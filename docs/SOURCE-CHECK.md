# Actual source check — Divvy GBFS

Two real station-status responses were fetched before implementation, 131.77 seconds apart:

| Sample | Fetch time (UTC) | Source timestamp (Unix seconds) | Rows | TTL |
| --- | --- | --- | --- | --- |
| 1 | 2026-11-03 00:09:31.407722 | 1793664521 | 2,079 | 60 seconds |
| 2 | 2026-11-03 00:11:43.175084 | 1793664641 | 2,079 | 60 seconds |

Comparing records by `station_id`, 121 stations changed at least one of these source fields: bicycle availability, dock availability, disabled counts, vehicle-type counts, or installed/renting/returning flags. A change in `last_reported` alone was excluded from that comparison. This is a full-city feasibility check, not a claim that all 40 curated stations change every minute.

Source: [Divvy official discovery](https://gbfs.divvybikes.com/gbfs/2.3/gbfs.json), with station status, station information, and vehicle types obtained through its published feed links. The actual saved subset used by tests is in `tests/fixtures`; its clock is pinned in the tests. The source TTL supports the selected 60-second scheduler rather than unnecessarily polling every few seconds.

## Product implications of the actual fields

- Vehicle type 1 is a human-powered bicycle, type 2 an assisted bicycle, and type 3 a scooter in the fetched Divvy type directory. Type IDs are mapped through the directory, not assumed universally valid for other systems.
- `num_bikes_available` can include scooters. Dockside sums bicycle-type counts and excludes scooters.
- `num_docks_available` is the direct return quantity. Capacity minus bicycles would be wrong when docks/vehicles are disabled.
- Rental and return flags are independent, and source booleans can be encoded as 0/1.
- Individual `last_reported` timestamps can be old even when the feed is freshly generated. Feed health and station freshness require separate checks.
- Some directory entries are public racks with no meaningful dock capacity or no short name. Coverage selects docked stations with a valid short name and capacity greater than one; temporary service closures remain visible after selection.

The first live worker invocation populated all 40 monitored rows. An immediate second invocation read 40 and changed zero, verifying database idempotency against an unchanged actual source response. Later scheduled runs continued without a browser open.
