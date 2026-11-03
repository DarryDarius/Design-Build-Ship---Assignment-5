# Understanding Dockside

## One update, end to end

Suppose a station changes from three electric bicycles to two. Divvy publishes a new GBFS response. Supabase Cron invokes `dockside-poll` using its private header. The worker validates the source, uses `vehicle_types.json` to identify electric bicycles, and sends the monitored snapshots to PostgreSQL.

The transaction compares the incoming fields with the current row. Only the changed station is updated. It saves the previous quantity and business-change timestamp, records the completed run, and advances the compact health heartbeat. Supabase Realtime sends a database change notification to an open browser. The browser reconciles a consistent snapshot and changes that number without moving the station row or refreshing the page.

If the worker wrote the database but Realtime were not enabled, data would be stored but the open page would miss the live signal. If the source changed its field types, normalization would reject the run rather than guessing. If a private follow's RLS were absent, user isolation would be broken even if the UI filtered the list.

## Source fields the app uses

| Field | Meaning and use |
| --- | --- |
| `station_id` | Stable source identity; joins station directory and status |
| `name`, `short_name`, `lat`, `lon` | Display, monitored-place search, station identity and geographical distance |
| `capacity` | Station metadata; never used to infer free docks by subtraction |
| `vehicle_types_available` | Counts by source vehicle type |
| `form_factor`, `propulsion_type` | Identify human bicycles, electric-assist bicycles, and excluded scooters |
| `num_docks_available` | Source-reported currently available docks |
| `is_installed` | Whether the station is installed |
| `is_renting` | Whether renting is allowed; matters for borrowing |
| `is_returning` | Whether returns are allowed; matters for returning |
| `last_reported` | The station's last status report to the operator; can be old even if the feed was just generated |
| `last_updated` | Feed-generation time; not proof that every station has just reported |
| `ttl` | The response's cache lifetime; sampled as 60 seconds |

`num_bikes_available` is deliberately not assumed to mean only bicycles. The source includes other vehicle form factors. Quantity calculations use typed bicycle counts.

## Why the worker is separate

A page is only open while someone visits it. A short-lived Edge Function is not a permanent loop either. Supabase Cron supplies the durable schedule, and each invocation does bounded work. Vercel hosts the web application; it is not being asked to keep a serverless request alive forever.

## Why upsert alone is insufficient

An unconditional upsert of all rows can produce writes and Realtime notifications even when the availability is identical. Dockside's conflict update has an `IS DISTINCT FROM` condition. The saved-response test and real database transaction test prove that an identical second ingest changes zero business rows.

A separate heartbeat is still written each run. This is intentional information: a successful check occurred even if nobody rented a bike.

## Reading three actual runs

The first manual worker verification saved 40 current snapshots. Its immediate repeat read the same 40 stations and changed zero rows. The first scheduled run then also read 40 and succeeded. Later a real verification received a Realtime `UPDATE` with four changed stations. Evidence is stored in `realtime-verification.json`; use the operations query for the latest three runs before class.

- `started_at`: when this attempt began.
- `result`: success, failure, running, or a skipped overlapping attempt.
- `read_count`: valid monitored records processed.
- `changed_count`: rows actually inserted or changed, not rows merely read.
- `missing_count`: monitored IDs missing from an otherwise valid feed.
- `duration_ms`: function processing time recorded with the result.
- `error_code`: a sanitized reason when an attempt fails.

## How freshness works

There are four separate questions:

1. Did the worker successfully process a response recently?
2. Was that source response itself recent?
3. Did this specific station report recently?
4. Is this browser still receiving updates?

A quantity unchanged for 20 minutes does not answer those questions. Healthy checks can preserve an unchanged number. Conversely, HTTP 200 can return an old feed, and a current feed can contain an old station report.

Global freshness begins with 180-second thresholds for checks/feed time; station reports use 300 seconds. The UI shows the cause and keeps old values labelled. Browser disconnection has its own message. None of these states is converted into zero inventory.

## Identity and tests

Clerk signs a JWT; Supabase verifies its issuer and signature through the configured third-party integration. The authenticated role and `sub` reach the database policies. The browser cannot choose another user's `sub` by inserting a different `user_id`.

The SQL test changes simulated request claims inside a rolled-back database transaction. This isolates the database policy behavior. The separate auth test uses two genuinely Clerk-signed tokens to test the entire trust chain as well. Both are needed: a correct RLS expression does not prove the issuer was configured correctly.

The source fixture tests validate inventory interpretation and reject malformed data before persistence. The database test validates real incremental upsert semantics and permissions. The Realtime test validates actual publication, grants, RLS, and WebSocket delivery. The production HTTP checks validate public web access and database-backed snapshots.

## Classroom questions

Use these as a conversational quiz, one at a time, before looking at the explanations above:

1. Trace one quantity change from Divvy to the screen. Which part causes the worker to run while the website is closed?
2. What would break if `station_id` or a vehicle type changed unexpectedly?
3. Can a station with unchanged bicycle counts still be fresh? What evidence is required?
4. Why does a successful HTTP response not prove the station's data is current?
5. What does the second identical-response test prove, and what does it not prove?
6. Why are the database RLS test and real signed-JWT test separate?
7. What happens when the browser disconnects and later reconnects?
8. Which quantities contribute to monthly cost, and how does fan-out change the message count?

## Classmate trial

Still to be performed by a real classmate. Ask them to sign in on the public site, save a few busy monitored stations, switch tasks, and watch a genuine change without refreshing. Record their actual feedback and improve the product if a step is confusing. No classmate trial has been fabricated in these notes.
