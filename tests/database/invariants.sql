-- All writes roll back. Run on the Dockside project after the first real ingest.
begin;
do $verify$
declare payload jsonb; reports jsonb; missing jsonb; source_time timestamptz; first_id uuid := gen_random_uuid(); second_id uuid := gen_random_uuid(); changed integer;
begin
 if (select count(*) from public.dockside_station_status) <> 40 then raise exception 'Expected 40 initialized snapshots'; end if;
 select jsonb_agg(to_jsonb(s) || jsonb_build_object('classic',s.classic + case when s.station_id=(select min(station_id) from public.dockside_station_status) then 1 else 0 end)) into payload from public.dockside_station_status s;
 select station_reports,missing_ids,greatest(source_updated_at,now()) into reports,missing,source_time from public.dockside_source_health where source='divvy';
 insert into public.dockside_worker_runs(id,result) values(first_id,'running');
 changed := public.dockside_commit_run(first_id,payload,reports,missing,source_time,1,200);
 if changed <> 1 then raise exception 'Single station update changed % rows, expected 1',changed; end if;
 insert into public.dockside_worker_runs(id,result) values(second_id,'running');
 changed := public.dockside_commit_run(second_id,payload,reports,missing,source_time,1,200);
 if changed <> 0 then raise exception 'Idempotent ingest changed % rows, expected 0',changed; end if;
end;
$verify$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dockside_sql_test_a","role":"authenticated"}',true);
insert into public.dockside_follows(station_id) select station_id from public.dockside_stations order by station_id limit 1;
do $verify$ begin
 if (select count(*) from public.dockside_follows) <> 1 then raise exception 'Owner cannot read saved station'; end if;
end; $verify$;
select set_config('request.jwt.claims','{"sub":"dockside_sql_test_b","role":"authenticated"}',true);
do $verify$ begin
 if exists(select 1 from public.dockside_follows) then raise exception 'Cross-user read leaked a saved station'; end if;
 begin
  insert into public.dockside_follows(user_id,station_id) select 'dockside_sql_test_a',station_id from public.dockside_stations order by station_id limit 1;
  raise exception 'Spoofed ownership was accepted';
 exception when insufficient_privilege then null;
 end;
 delete from public.dockside_follows where user_id='dockside_sql_test_a';
end; $verify$;
select set_config('request.jwt.claims','{"sub":"dockside_sql_test_a","role":"authenticated"}',true);
do $verify$ begin
 if (select count(*) from public.dockside_follows) <> 1 then raise exception 'Cross-user delete removed another user''s saved station'; end if;
end; $verify$;

reset role;
set local role anon;
do $verify$ begin
 if jsonb_array_length(public.dockside_snapshot()->'stations') <> 40 then raise exception 'Public station board is inaccessible'; end if;
 begin
  perform public.dockside_begin_run(gen_random_uuid());
  raise exception 'Anonymous client can run privileged worker RPC';
 exception when insufficient_privilege then null;
 end;
 begin
  perform count(*) from public.dockside_worker_runs;
  raise exception 'Anonymous client can read internal run logs';
 exception when insufficient_privilege then null;
 end;
end; $verify$;
rollback;
select 'PASS: incremental ingest, idempotency, ownership, public reads and privileged RPC isolation; all test writes rolled back' as verification;
