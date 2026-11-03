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

## Project-scoped Supabase MCP

`.mcp.json` supports Claude Code and `.codex/config.toml` provides the corresponding Codex project configuration. Both target only `qhoubpcpelxruxnbgead`; no credentials are stored in either file. Use the Dockside repository as the trusted project root. Some CLI management commands may use only global configuration, so the reproducible command below explicitly supplies the same scoped endpoint without modifying global configuration:

```bash
codex -c 'mcp_servers.supabase_dockside.url="https://mcp.supabase.com/mcp?project_ref=qhoubpcpelxruxnbgead"' mcp login supabase_dockside
node scripts/verify-mcp.mjs
```

OAuth is handled and stored by Codex. The verifier uses Codex's local protocol client and the real MCP SQL tool; it starts no model turn and uses no extra reasoning agent. It verifies table counts and active cron. `docs/mcp-verification.json` records the query result; `docs/mcp-setup-verification.json` preserves the deployment/schedule completion proof across later read-only checks.

The authorized completion run also used `node scripts/verify-mcp.mjs --complete-setup` to republish the reviewed current function files and reapply the same named cron schedule through MCP. This is an intentional deployment operation, not needed for normal read-only verification. The function still requires its existing private header, and an unauthorized call was retested as 401.

Official references: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp), [Supabase MCP](https://supabase.com/docs/guides/ai-tools/mcp).
