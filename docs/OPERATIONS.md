# Dockside operations

## Deployed resources

- Web: https://dockside-chi-eight.vercel.app
- Vercel project: `dockside`, project `prj_WnsI2CRFZAMwZY15MQ50kkw4YdjA`
- Supabase: `dockside`, project `qhoubpcpelxruxnbgead`, US East
- Function: `dockside-poll`
- Cron job: `dockside-poll`, every minute
- Clerk development app: `app_3LZdI4hX9FAYTYxKV77FivFfmv7`
- Clerk issuer: `https://hot-crayfish-178.clerk.accounts.dev`
- Source repository: https://github.com/DarryDarius/Design-Build-Ship---Assignment-5

The Supabase organization was visibly confirmed as FREE during configuration. Database/project keys, the generated database password, and the dedicated cron secret are not in tracked source. `.local-secrets` and `.env*` are excluded from Git and Vercel uploads.

## Database setup

The numbered SQL files in `supabase/migrations` are the reproducible creation and curated-coverage definitions. They were applied through the authenticated Supabase CLI's remote query capability. Existing deployment: they are already applied; the first migration is not meant to run twice.

For a fresh, intentionally selected project, review project IDs, issuer, SQL, and coverage first, then apply the files in order. Never apply a reset to the Assignment 4 project.

## Configure hosting and worker

Owner-only tooling requires the linked Clerk and Vercel accounts and Supabase CLI login.

```bash
node scripts/bootstrap-cloud.mjs --hosting
node scripts/bootstrap-cloud.mjs --worker
```

`--hosting` obtains linked Clerk keys through the Clerk CLI, pipes values into Vercel's environment commands, and appends only the public database configuration locally. It does not print credential values.

`--worker` creates/reuses a dedicated random cron token, sets the Edge Function secret, invokes the worker twice, checks unauthorized rejection, and renders `supabase/setup/schedule.sql` into a temporary private file. The actual credential is stored in Supabase Vault; the temporary SQL/env files are removed after use. The token is never embedded in a migration.

Function deploy:

```bash
npx supabase@latest functions deploy dockside-poll \
  --remote=qhoubpcpelxruxnbgead --use-api --yes
```

`verify_jwt=false` does not make the worker open: the function itself requires its exact dedicated secret header, compared with constant-time digests. The platform-supplied service credential is used only inside the function for database writes.

## Inspect the latest three runs

```bash
npx supabase@latest db query --remote=qhoubpcpelxruxnbgead --read-only \
  "select started_at,result,read_count,changed_count,missing_count,duration_ms,error_code from public.dockside_worker_runs order by started_at desc limit 3;" \
  --output json
```

A healthy run with `changed_count=0` is normal. The source or quantities may be unchanged. `source_time_regressed` protects a newer snapshot from an older feed. A failed run preserves the last successful inventory and updates health.

Cron check:

```sql
select jobname, schedule, active from cron.job where jobname='dockside-poll';
```

To intentionally stop this application's worker after grading, unschedule this named job only:

```sql
select cron.unschedule('dockside-poll');
```

This stop command has not been executed as part of delivery.

## Git and web deploy

The repository retains real planning, ingestion, interface, verification, and refinement commits. The final source is on `main`.

```bash
npm test
npm run lint
npm run typecheck
npm run build
npx vercel@latest deploy --prod --yes
```

The production deployment is ready and its public root, snapshot, sign-in page, and icon returned HTTP 200 without Vercel authentication. The owner added this repository to the Vercel GitHub installation's selected repositories, and `vercel git connect` confirmed the connection. Pushes to `main` now trigger production builds; other branches create previews. Manual CLI deployment remains available with the existing account.

## Maintenance and limits

- Check Supabase's Edge Function, Realtime message, database size, and egress usage.
- At 60 seconds, about 43,200 scheduled invocations occur per 30 days; leave room for tests.
- Detailed run records older than seven days are deleted by the worker startup routine.
- Public health contains only sanitized status, not internal exception bodies or credentials.
- Source-directory curation is fixed for this first release. To change coverage, review and regenerate the catalog and coverage SQL, update the database intentionally, and redeploy the worker and web app together. Do not casually regenerate a different catalog against an existing live deployment.
- A free project may pause after inactivity. Confirm it remains healthy until grading is complete.
