<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Dockside

Read `docs/PRODUCT.md` before changing product behavior. This is Assignment 5: a live Divvy station board for borrowing near an origin or returning near a destination.

- Next.js 16, React 19, Tailwind 4, Clerk 7, Supabase Postgres/Realtime/Edge Functions. Next's proxy is `src/proxy.ts`.
- Original visual language: civic wayfinding, cobalt blue, aligned station rows, tabular numbers. No generic dashboard cards or marketing landing page.
- Public station board; authentication only for personal follows. RLS enforces ownership using Clerk's `sub`. No secret key in the browser.
- Never treat missing/old data as zero inventory. Freshness depends on worker, feed, station report, and browser transport separately.
- Count bicycles through GBFS vehicle types; scooters are excluded. Borrow and return service flags differ. Distances are straight-line, not walking estimates.
- Keep live list ordering and focus stable. Login must preserve the pending save and trip context.
- `supabase/functions` runs on Deno and is excluded from Next's TypeScript check. Pure normalization is covered by saved-response tests.
- Database objects are `dockside_*` to keep the app isolated if a free Supabase project is shared. Never modify Assignment 4 tables or deployment.
- Keep real progress commits. Run unit tests, `tsc --noEmit`, lint, build and relevant browser checks before shipping.
- Do not print environment files, credentials or auth state. CLI-generated secret files must remain ignored.

Commands: `npm run dev`, `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:e2e`.
