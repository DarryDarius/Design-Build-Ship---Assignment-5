import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availability,
  distance,
  feedFreshness,
  matches,
  quantity,
  stationFreshness,
} from "../../src/lib/rules";
import type { Health, Station, StationStatus } from "../../src/lib/types";

const now = Date.parse("2026-11-03T01:00:00Z");
const status: StationStatus = {
  station_id: "s1",
  classic: 2,
  electric: 5,
  docks: 0,
  installed: true,
  renting: true,
  returning: true,
  changed_at: new Date(now - 500000).toISOString(),
  previous_classic: null,
  previous_electric: null,
  previous_docks: null,
  version: 1,
};
const health: Health = {
  source: "divvy",
  last_attempt_at: new Date(now - 15000).toISOString(),
  last_success_at: new Date(now - 15000).toISOString(),
  source_updated_at: new Date(now - 30000).toISOString(),
  last_result: "success",
  error_code: null,
  changed_count: 0,
  duration_ms: 100,
  station_reports: { s1: Math.floor(now / 1000) - 60 },
  missing_ids: [],
  version: 1,
};

test("unchanged quantities stay fresh when source and worker are healthy", () => {
  assert.equal(feedFreshness(health, now), "fresh");
  assert.equal(stationFreshness("s1", health, now), "fresh");
});
test("HTTP success cannot hide an old source feed", () => {
  assert.equal(
    feedFreshness(
      { ...health, source_updated_at: new Date(now - 181000).toISOString() },
      now,
    ),
    "stale",
  );
});
test("a failed last run has down state despite a recent successful run", () => {
  assert.equal(
    feedFreshness({ ...health, last_result: "failed" }, now),
    "down",
  );
});
test("a station's stale report is not hidden by global freshness", () => {
  assert.equal(
    stationFreshness(
      "s1",
      { ...health, station_reports: { s1: now / 1000 - 301 } },
      now,
    ),
    "stale",
  );
  assert.equal(stationFreshness("missing", health, now), "unknown");
});
test("borrowing and returning use their own service flags and counts", () => {
  assert.equal(availability(status, "borrow", "any", "fresh").eligible, true);
  assert.equal(availability(status, "return", "any", "fresh").eligible, false);
  assert.equal(
    availability(
      { ...status, renting: false, docks: 4 },
      "borrow",
      "any",
      "fresh",
    ).kind,
    "closed",
  );
  assert.equal(
    availability(
      { ...status, renting: false, docks: 4 },
      "return",
      "any",
      "fresh",
    ).eligible,
    true,
  );
});
test("old or missing data never becomes a live recommendation or fake zero", () => {
  assert.equal(availability(status, "borrow", "any", "stale").eligible, false);
  assert.equal(availability(undefined, "borrow", "any", "unknown").count, null);
});
test("a type preference changes the decision and low-inventory label", () => {
  assert.equal(quantity(status, "borrow", "electric"), 5);
  assert.equal(availability(status, "borrow", "classic", "fresh").kind, "low");
  assert.equal(
    availability({ ...status, electric: 0 }, "borrow", "electric", "fresh")
      .eligible,
    false,
  );
});
test("station search accepts reversed street names and punctuation", () => {
  const station = {
    name: "Ellis Ave & 55th St",
    short_name: "CHI001",
  } as Station;
  assert.equal(matches(station, "55th ellis"), true);
  assert.equal(matches(station, "Ellis and 55th"), true);
  assert.equal(matches(station, "Michigan"), false);
});
test("distance is geographical and symmetrical", () => {
  const a = { lat: 41.7886, lon: -87.5987 },
    b = { lat: 41.7953, lon: -87.5878 };
  assert.equal(distance(a, a), 0);
  assert.ok(distance(a, b) > 1000 && distance(a, b) < 1300);
  assert.ok(Math.abs(distance(a, b) - distance(b, a)) < 0.01);
});
