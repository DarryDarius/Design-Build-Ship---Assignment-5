-- Rendered by scripts/bootstrap-cloud.mjs; the token is piped, never committed.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $setup$
declare secret_id uuid;
begin
 select id into secret_id from vault.secrets where name='dockside_worker_token';
 if secret_id is null then
  perform vault.create_secret('__WORKER_TOKEN__','dockside_worker_token','Dockside scheduled worker credential');
 else
  perform vault.update_secret(secret_id,'__WORKER_TOKEN__','dockside_worker_token','Dockside scheduled worker credential');
 end if;
end;
$setup$;

select cron.schedule('dockside-poll','* * * * *', $job$
 select net.http_post(
   url := 'https://qhoubpcpelxruxnbgead.supabase.co/functions/v1/dockside-poll',
   headers := jsonb_build_object('Content-Type','application/json','x-dockside-token',
     (select decrypted_secret from vault.decrypted_secrets where name='dockside_worker_token')),
   body := '{}'::jsonb, timeout_milliseconds := 20000
 );
$job$);
