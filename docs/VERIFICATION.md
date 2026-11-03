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

## Human acceptance confirmation

On November 3, the project owner confirmed that a real classmate had signed in, saved stations, and observed a genuine update without refreshing. The actual trial date and result details are awaiting the owner; the agent did not independently observe that trial.

The owner added the new repository to the Vercel GitHub installation, and `vercel git connect` returned Connected. Production is deployed and the public root, snapshot, sign-in page, and custom icon all returned 200. Manual deployment remains available as well.

## Nov 3 usability iteration

22/22 unit tests passed, including nearest eligible station selection, empty/stale/type/return filtering, coverage and preset search. Lint, typecheck and optimized build passed. The account/database/worker contract is unchanged. Browser regression covered the initial available suggestion, cross-area Millennium result and target-area selection, e-bike recalculation, preset matches and the explicit unsupported-address state, plus the 390px phone layout. A full reload retained an explicitly selected empty Woodlawn station while the separate suggestion continued to show the available University station. Switching to return mode then reset the suggestion using actual open docks. The browser regression exposed and fixed a Strict Mode mount-effect replay that could overwrite stored trip context in local development.

## Full assignment audit

See ASSIGNMENT5-AUDIT.md and audit-2026-11-03.json for the Nov 3 recheck. All 22 tests, lint, typecheck, build, rolled-back SQL invariants, actual Clerk JWT isolation and Realtime event verification passed again. Google Classroom visibly showed Turned in with both correct links. The report records completed project-scoped MCP verification and the subsequent four interactive learning rounds. This is not a formal classroom assessment.

## MCP follow-up completed

Codex OAuth connected to the project-scoped Supabase MCP endpoint. The direct protocol verifier called the actual execute_sql tool, received 40 directory rows, 40 status rows and active cron, republished the existing worker through deploy_edge_function (version 5), and set the same named minute schedule through MCP. Post-deployment unauthorized calls returned 401 and a real Realtime UPDATE was received. No model turn or delegated agent was used by this verifier; credentials are not logged. See mcp-verification.json and mcp-setup-verification.json.

The follow-up log audit found one failed collection at 10:39 CST (invalid_source_response, no HTTP status retained); the next scheduled run at 10:40 CST succeeded with 40 records and four changes. The root cause was not established from sanitized logs. The audit retains this failure rather than claiming an entirely failure-free history.
