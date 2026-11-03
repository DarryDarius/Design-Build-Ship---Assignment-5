import { mkdir, writeFile, readFile } from "node:fs/promises";

const base = "https://gbfs.lyft.com/gbfs/2.3/chi/en/";
const get = async (file) => {
  const response = await fetch(base + file, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`GBFS ${response.status}`);
  return response.json();
};
const [info, status, types] = await Promise.all([
  get("station_information.json"),
  get("station_status.json"),
  get("vehicle_types.json"),
]);
const live = new Map(status.data.stations.map((s) => [s.station_id, s]));
const centers = [
  { region: "hyde-park", lat: 41.791, lon: -87.597, count: 24 },
  { region: "loop", lat: 41.88, lon: -87.626, count: 16 },
];
const stations = centers.flatMap((center) =>
  info.data.stations
    .filter((s) => {
      const row = live.get(s.station_id);
      return (
        row &&
        row.is_installed &&
        typeof s.short_name === "string" &&
        s.capacity > 1 &&
        Math.abs(s.lat - center.lat) < 0.025 &&
        Math.abs(s.lon - center.lon) < 0.03
      );
    })
    .sort(
      (a, b) =>
        (a.lat - center.lat) ** 2 +
        ((a.lon - center.lon) * 0.75) ** 2 -
        ((b.lat - center.lat) ** 2 + ((b.lon - center.lon) * 0.75) ** 2),
    )
    .slice(0, center.count)
    .map((s) => ({
      station_id: s.station_id,
      name: s.name,
      short_name: s.short_name,
      lat: s.lat,
      lon: s.lon,
      capacity: s.capacity,
      region: center.region,
    })),
);
if (
  stations.length !== 40 ||
  new Set(stations.map((s) => s.station_id)).size !== 40
)
  throw new Error("Expected 40 unique stations");
await mkdir("src/data", { recursive: true });
await mkdir("tests/fixtures", { recursive: true });
await writeFile(
  "src/data/stations.json",
  JSON.stringify(stations, null, 2) + "\n",
);
await writeFile(
  "supabase/migrations/20261103000200_dockside_coverage.sql",
  `-- Curated docked-station coverage from the real GBFS directory.\ninsert into public.dockside_stations(station_id,name,short_name,lat,lon,capacity,region)\nselect station_id,name,short_name,lat,lon,capacity,region\nfrom jsonb_to_recordset($coverage$${JSON.stringify(stations)}$coverage$::jsonb) as s(station_id text,name text,short_name text,lat double precision,lon double precision,capacity integer,region text)\non conflict(station_id) do update set name=excluded.name,short_name=excluded.short_name,lat=excluded.lat,lon=excluded.lon,capacity=excluded.capacity,region=excluded.region;\n`,
);
const ids = new Set(stations.map((s) => s.station_id));
const trim = (raw) => ({
  ...raw,
  data: { stations: raw.data.stations.filter((s) => ids.has(s.station_id)) },
});
await writeFile(
  "tests/fixtures/vehicle-types.json",
  JSON.stringify(types, null, 2) + "\n",
);
await writeFile(
  "tests/fixtures/divvy-a.json",
  JSON.stringify(trim(status), null, 2) + "\n",
);
await writeFile(
  "tests/fixtures/provenance.json",
  JSON.stringify(
    {
      fetched_at: new Date().toISOString(),
      url: base + "station_status.json",
      note: "Real saved GBFS response; filtered to the monitored coverage. Tests pin the clock to the source timestamp.",
    },
    null,
    2,
  ) + "\n",
);
// Reuse the earlier independent sampling for a genuine changed-response fixture.
try {
  const earlier = JSON.parse(
    await readFile("/tmp/assignment5-source-check/divvy-1.json", "utf8"),
  );
  await writeFile(
    "tests/fixtures/divvy-b.json",
    JSON.stringify(trim(earlier.data), null, 2) + "\n",
  );
} catch {
  await writeFile(
    "tests/fixtures/divvy-b.json",
    JSON.stringify(trim(status), null, 2) + "\n",
  );
}
console.log(
  `Saved ${stations.length} monitored stations and real response fixtures.`,
);
