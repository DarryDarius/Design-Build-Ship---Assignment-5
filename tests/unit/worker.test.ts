import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseFeed,
  changedRows,
} from "../../supabase/functions/_shared/normalize";
import catalog from "../../src/data/stations.json";

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"),
  );
const feed = fixture("divvy-a.json"),
  types = fixture("vehicle-types.json"),
  ids = catalog.map((s) => s.station_id),
  clock = feed.last_updated * 1000;
const parse = (raw = feed) => parseFeed(raw, types, ids, clock);

test("real saved response produces the monitored station snapshots", () => {
  const parsed = parse();
  assert.equal(parsed.statuses.length, 40);
  assert.equal(parsed.missingIds.length, 0);
  assert.equal(Object.keys(parsed.stationReports).length, 40);
  assert.ok(
    parsed.statuses.every(
      (s) =>
        Number.isInteger(s.classic) &&
        s.classic >= 0 &&
        Number.isInteger(s.electric) &&
        s.electric >= 0,
    ),
  );
});
test("reprocessing the same saved source has no business changes", () => {
  const first = parse();
  assert.deepEqual(changedRows(first.statuses, parse().statuses), []);
});
test("one actual bike-count edit changes exactly one station", () => {
  const next = structuredClone(feed);
  const row = next.data.stations[0];
  row.vehicle_types_available.find(
    (t: { vehicle_type_id: string }) => t.vehicle_type_id === "1",
  ).count += 1;
  const delta = changedRows(parse().statuses, parse(next).statuses);
  assert.equal(delta.length, 1);
  assert.equal(delta[0].station_id, row.station_id);
  assert.equal(delta[0].classic, parse().statuses[0].classic + 1);
});
test("scooter counts never become bicycle inventory", () => {
  const next = structuredClone(feed);
  const row = next.data.stations[0];
  row.vehicle_types_available.find(
    (t: { vehicle_type_id: string }) => t.vehicle_type_id === "3",
  ).count += 20;
  assert.deepEqual(changedRows(parse().statuses, parse(next).statuses), []);
});
test("heartbeat timestamp changes do not rewrite business snapshots", () => {
  const next = structuredClone(feed);
  next.data.stations[0].last_reported += 1;
  assert.deepEqual(changedRows(parse().statuses, parse(next).statuses), []);
  assert.notDeepEqual(parse().stationReports, parse(next).stationReports);
});
test("a missing station is unknown, never synthesized as zero inventory", () => {
  const next = structuredClone(feed);
  const removed = next.data.stations.pop();
  const result = parse(next);
  assert.deepEqual(result.missingIds, [removed.station_id]);
  assert.equal(result.statuses.length, 39);
  assert.ok(!result.statuses.some((s) => s.station_id === removed.station_id));
});
test("malformed and negative counts reject the run before a write", () => {
  const next = structuredClone(feed);
  next.data.stations[0].num_docks_available = -1;
  assert.throws(() => parse(next), /invalid_count/);
  assert.throws(
    () => parse({ data: { stations: [] }, last_updated: feed.last_updated }),
    /empty_source/,
  );
});
test("missing bicycle types cannot silently reduce the inventory", () => {
  const next = structuredClone(feed);
  next.data.stations[0].vehicle_types_available =
    next.data.stations[0].vehicle_types_available.filter(
      (t: { vehicle_type_id: string }) => t.vehicle_type_id !== "1",
    );
  assert.throws(() => parse(next), /incomplete_bicycle_counts/);
});
test("service flags normalize numeric and boolean forms", () => {
  const next = structuredClone(feed);
  Object.assign(next.data.stations[0], {
    is_installed: true,
    is_renting: false,
    is_returning: true,
  });
  const row = parse(next).statuses[0];
  assert.equal(row.installed, true);
  assert.equal(row.renting, false);
  assert.equal(row.returning, true);
});
test("future source time and duplicate stations reject the run", () => {
  const next = structuredClone(feed);
  next.last_updated += 1000;
  assert.throws(() => parse(next), /invalid_source_time/);
  const duplicate = structuredClone(feed);
  duplicate.data.stations.push(duplicate.data.stations[0]);
  assert.throws(() => parse(duplicate), /duplicate_station/);
});
