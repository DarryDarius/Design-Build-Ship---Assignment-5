# Delivery verification — 2026-11-02 (Chicago)

## Executed checks

- `npm test`: 19/19 passed. Real GBFS fixture normalization, changed-row detection, type filtering, malformed fields, service flags, old/missing data, source/worker/station freshness, task decisions, search, and distance.
- `npm run lint`: passed with no warnings.
- `npm run typecheck`: passed.
- `npm run build`: optimized Next.js production build passed.
- `tests/database/invariants.sql`: passed on the independent deployed Dockside project. Transaction rolled back test writes. Checked actual SQL deduplication, single-row changes, anonymous read limits, owner policies, and cross-user isolation.
- Real Clerk-signed JWT checks: passed for two synthetic development users. Owner insert/read/delete worked; spoofed ownership and cross-user read/delete failed. Test follow removed and verification sessions revoked. See `auth-verification.json`.
- Real Supabase Postgres Changes event received after a real worker invocation. See `realtime-verification.json`.
- First actual source ingest: read 40, changed 40. Immediate repeated ingest: read 40, changed 0. Unauthenticated invocation rejected with 401.
- At 01:24, 01:25, and 01:26 UTC on Nov 3, scheduled runs read 40, missed 0, changed 2/3/3, and completed successfully in 489/334/150 ms respectively.
- Public production root and snapshot endpoint returned HTTP 200 without hosting authentication. Snapshot contained 40 directory rows and 40 availability rows, successful health, and realtime transport.
- Tracked/unignored file scan found no secret-key/token patterns; local env, worker token, and synthetic-user credentials are ignored and excluded from hosting uploads.

## Browser checks

Used the actual running application in Chrome, including a 390px-wide responsive viewport:

- Desktop layout, aligned live rows, selected station detail, borrow/return quantities and route behavior.
- Phone single-column list and scrollable bottom detail sheet, close control, Escape dismissal, and focus restored to the selected station.
- Guest save leads to the custom Clerk sign-in page. Returning to the board retains the selected station and task context.
- Login form renders Google and email entry. Full authenticated data access was verified independently with real Clerk JWTs; this is not described as a completed manual browser sign-in test.

## Human acceptance still required

The classmate trial required by the assignment has not been fabricated. Ask a classmate to open the production URL, sign in with their own account, save a station, and observe a genuine update without refreshing. Record the actual date, outcome, and any issue here after it happens.

GitHub automatic deploy requires the Vercel GitHub installation to include this new repository. Manual production deployment works. See operations notes for the current connection status.
