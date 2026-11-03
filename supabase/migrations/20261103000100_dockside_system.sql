-- Independent, prefixed objects: no changes to previous assignments.
create table public.dockside_stations (
 station_id text primary key, name text not null, short_name text not null,
 lat double precision not null check(lat between -90 and 90),
 lon double precision not null check(lon between -180 and 180),
 capacity integer not null check(capacity >= 0),
 region text not null check(region in ('hyde-park','loop'))
);
create table public.dockside_station_status (
 station_id text primary key references public.dockside_stations(station_id),
 classic integer not null check(classic >= 0), electric integer not null check(electric >= 0),
 docks integer not null check(docks >= 0), installed boolean not null, renting boolean not null, returning boolean not null,
 changed_at timestamptz not null default now(), previous_classic integer, previous_electric integer, previous_docks integer,
 version bigint not null
);
create table public.dockside_follows (
 user_id text not null default (auth.jwt()->>'sub'),
 station_id text not null references public.dockside_stations(station_id),
 created_at timestamptz not null default now(), primary key(user_id,station_id)
);
create table public.dockside_worker_runs (
 id uuid primary key, started_at timestamptz not null default now(), finished_at timestamptz,
 result text not null check(result in ('running','success','failed','skipped')),
 http_status integer, read_count integer not null default 0, changed_count integer not null default 0,
 missing_count integer not null default 0, duration_ms integer, source_updated_at timestamptz,
 error_code text
);
create index dockside_runs_started_idx on public.dockside_worker_runs(started_at desc);
create table public.dockside_source_health (
 source text primary key check(source='divvy'), last_attempt_at timestamptz not null,
 last_success_at timestamptz, source_updated_at timestamptz,
 last_result text not null check(last_result in ('running','success','failed')),
 error_code text, changed_count integer not null default 0, duration_ms integer not null default 0,
 station_reports jsonb not null default '{}', missing_ids jsonb not null default '[]', version bigint not null default 0
);

alter table public.dockside_stations enable row level security;
alter table public.dockside_station_status enable row level security;
alter table public.dockside_follows enable row level security;
alter table public.dockside_worker_runs enable row level security;
alter table public.dockside_source_health enable row level security;
create policy "Public station directory" on public.dockside_stations for select to anon,authenticated using(true);
create policy "Public availability" on public.dockside_station_status for select to anon,authenticated using(true);
create policy "Public sanitized health" on public.dockside_source_health for select to anon,authenticated using(true);
create policy "Read own follows" on public.dockside_follows for select to authenticated using(user_id=(select auth.jwt()->>'sub'));
create policy "Save own follows" on public.dockside_follows for insert to authenticated with check(user_id=(select auth.jwt()->>'sub'));
create policy "Remove own follows" on public.dockside_follows for delete to authenticated using(user_id=(select auth.jwt()->>'sub'));
revoke all on public.dockside_stations,public.dockside_station_status,public.dockside_follows,public.dockside_worker_runs,public.dockside_source_health from anon,authenticated;
grant select on public.dockside_stations,public.dockside_station_status,public.dockside_source_health to anon,authenticated;
grant select,insert,delete on public.dockside_follows to authenticated;
grant all on public.dockside_stations,public.dockside_station_status,public.dockside_follows,public.dockside_worker_runs,public.dockside_source_health to service_role;

-- One transaction returns a consistent snapshot; RLS remains in force.
create function public.dockside_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'stations',coalesce((select jsonb_agg(s order by s.name) from public.dockside_stations s),'[]'::jsonb),
  'statuses',coalesce((select jsonb_agg(s) from public.dockside_station_status s),'[]'::jsonb),
  'health',(select to_jsonb(h) from public.dockside_source_health h where source='divvy')
 );
$$;
revoke all on function public.dockside_snapshot() from public;
grant execute on function public.dockside_snapshot() to anon,authenticated,service_role;

-- Short transaction lock serializes startup. The persisted running row is the lease.
create function public.dockside_begin_run(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(5123805);
 update public.dockside_worker_runs set result='failed',finished_at=now(),error_code='worker_timeout'
  where result='running' and started_at < now()-interval '55 seconds';
 if exists(select 1 from public.dockside_worker_runs where result='running') then
  insert into public.dockside_worker_runs(id,result,finished_at,error_code) values(p_id,'skipped',now(),'overlapping_run');
  return false;
 end if;
 insert into public.dockside_worker_runs(id,result) values(p_id,'running');
 delete from public.dockside_worker_runs where started_at < now()-interval '7 days';
 return true;
end;
$$;

create function public.dockside_commit_run(p_id uuid,p_rows jsonb,p_reports jsonb,p_missing jsonb,p_source_time timestamptz,p_duration integer,p_http_status integer)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer; v bigint := floor(extract(epoch from clock_timestamp())*1000)::bigint; started timestamptz;
begin
 perform pg_catalog.pg_advisory_xact_lock(5123805);
 select started_at into started from public.dockside_worker_runs where id=p_id and result='running' for update;
 if started is null then raise exception 'invalid_run'; end if;
 if p_source_time < (select source_updated_at from public.dockside_source_health where source='divvy') then raise exception 'source_time_regressed'; end if;
 insert into public.dockside_station_status as current(station_id,classic,electric,docks,installed,renting,returning,version)
 select r.station_id,r.classic,r.electric,r.docks,r.installed,r.renting,r.returning,v
 from jsonb_to_recordset(p_rows) as r(station_id text,classic integer,electric integer,docks integer,installed boolean,renting boolean,returning boolean)
 on conflict(station_id) do update set
  classic=excluded.classic,electric=excluded.electric,docks=excluded.docks,
  installed=excluded.installed,renting=excluded.renting,returning=excluded.returning,
  previous_classic=current.classic,previous_electric=current.electric,previous_docks=current.docks,changed_at=now(),version=v
 where (current.classic,current.electric,current.docks,current.installed,current.renting,current.returning)
  is distinct from (excluded.classic,excluded.electric,excluded.docks,excluded.installed,excluded.renting,excluded.returning);
 get diagnostics changed=row_count;
 insert into public.dockside_source_health(source,last_attempt_at,last_success_at,source_updated_at,last_result,error_code,changed_count,duration_ms,station_reports,missing_ids,version)
 values('divvy',started,now(),p_source_time,'success',null,changed,p_duration,p_reports,p_missing,v)
 on conflict(source) do update set last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,
  source_updated_at=excluded.source_updated_at,last_result='success',error_code=null,changed_count=changed,
  duration_ms=p_duration,station_reports=p_reports,missing_ids=p_missing,version=v;
 update public.dockside_worker_runs set finished_at=now(),result='success',http_status=p_http_status,
  read_count=jsonb_array_length(p_rows),changed_count=changed,missing_count=jsonb_array_length(p_missing),
  duration_ms=p_duration,source_updated_at=p_source_time where id=p_id;
 return changed;
end;
$$;

create function public.dockside_fail_run(p_id uuid,p_error text,p_duration integer,p_http_status integer)
returns void language plpgsql security definer set search_path='' as $$
declare started timestamptz;
begin
 perform pg_catalog.pg_advisory_xact_lock(5123805);
 select started_at into started from public.dockside_worker_runs where id=p_id and result='running' for update;
 if started is null then return; end if;
 update public.dockside_worker_runs set result='failed',finished_at=now(),error_code=left(p_error,80),duration_ms=p_duration,http_status=p_http_status where id=p_id;
 insert into public.dockside_source_health(source,last_attempt_at,last_result,error_code,duration_ms,version)
 values('divvy',started,'failed',left(p_error,80),p_duration,floor(extract(epoch from clock_timestamp())*1000)::bigint)
 on conflict(source) do update set last_attempt_at=excluded.last_attempt_at,last_result='failed',error_code=excluded.error_code,duration_ms=p_duration,version=excluded.version;
end;
$$;
revoke all on function public.dockside_begin_run(uuid),public.dockside_commit_run(uuid,jsonb,jsonb,jsonb,timestamptz,integer,integer),public.dockside_fail_run(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.dockside_begin_run(uuid),public.dockside_commit_run(uuid,jsonb,jsonb,jsonb,timestamptz,integer,integer),public.dockside_fail_run(uuid,text,integer,integer) to service_role;

alter publication supabase_realtime add table public.dockside_station_status, public.dockside_source_health;
