import type {
  BikeType,
  Freshness,
  Health,
  Mode,
  Point,
  Station,
  StationStatus,
} from "./types";

export const POLL_SECONDS = 60;
export const FEED_STALE_SECONDS = 180;
export const STATION_STALE_SECONDS = 300;
export const PRESETS: Point[] = [
  {
    name: "UChicago · Main Quad",
    lat: 41.7886,
    lon: -87.5987,
    region: "hyde-park",
  },
  {
    name: "55th & Lake Park",
    lat: 41.7953,
    lon: -87.5878,
    region: "hyde-park",
  },
  {
    name: "Harold Washington Library",
    lat: 41.8763,
    lon: -87.6282,
    region: "loop",
  },
  { name: "Millennium Park", lat: 41.8826, lon: -87.6226, region: "loop" },
];
export function distance(
  a: Pick<Point, "lat" | "lon">,
  b: Pick<Point, "lat" | "lon">,
): number {
  const rad = Math.PI / 180;
  const x =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function distanceLabel(m: number): string {
  return m < 1000
    ? `${Math.round(m / 10) * 10} m`
    : `${(m / 1000).toFixed(1)} km`;
}
export function ageSeconds(
  iso: string | null | undefined,
  now: number,
): number {
  if (!iso) return Infinity;
  const time = Date.parse(iso);
  return Number.isFinite(time) && time <= now + 30000
    ? Math.max(0, (now - time) / 1000)
    : Infinity;
}
export function ago(iso: string | null | undefined, now: number): string {
  const s = ageSeconds(iso, now);
  if (!Number.isFinite(s)) return "not yet confirmed";
  if (s < 5) return "just now";
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export function feedFreshness(h: Health | null, now: number): Freshness {
  if (!h?.last_success_at)
    return h?.last_result === "failed" ? "down" : "unknown";
  if (h.last_result === "failed") return "down";
  if (
    ageSeconds(h.last_success_at, now) > FEED_STALE_SECONDS ||
    ageSeconds(h.source_updated_at, now) > FEED_STALE_SECONDS
  )
    return "stale";
  return "fresh";
}
export function stationFreshness(
  id: string,
  h: Health | null,
  now: number,
): Freshness {
  const feed = feedFreshness(h, now);
  if (feed !== "fresh") return feed;
  if (h?.missing_ids.includes(id) || !h?.station_reports[id]) return "unknown";
  const reported = h.station_reports[id] * 1000;
  return reported > now + 30000 || now - reported > STATION_STALE_SECONDS * 1000
    ? "stale"
    : "fresh";
}
export function quantity(s: StationStatus, mode: Mode, bike: BikeType): number {
  if (mode === "return") return s.docks;
  return bike === "classic"
    ? s.classic
    : bike === "electric"
      ? s.electric
      : s.classic + s.electric;
}
export function availability(
  s: StationStatus | undefined,
  mode: Mode,
  bike: BikeType,
  freshness: Freshness,
): {
  label: string;
  kind: "good" | "low" | "empty" | "closed" | "unknown";
  count: number | null;
  eligible: boolean;
} {
  if (!s)
    return {
      label: "Awaiting station data",
      kind: "unknown",
      count: null,
      eligible: false,
    };
  const count = quantity(s, mode, bike);
  if (!s.installed || !(mode === "borrow" ? s.renting : s.returning))
    return {
      label: mode === "borrow" ? "Rentals paused" : "Returns paused",
      kind: "closed",
      count,
      eligible: false,
    };
  if (freshness !== "fresh")
    return {
      label:
        freshness === "unknown"
          ? "Status unconfirmed"
          : "Last known availability",
      kind: "unknown",
      count,
      eligible: false,
    };
  if (count === 0)
    return {
      label:
        mode === "return"
          ? "No open docks"
          : bike === "electric"
            ? "No e-bikes"
            : bike === "classic"
              ? "No classic bikes"
              : "No bikes",
      kind: "empty",
      count,
      eligible: false,
    };
  if (count < 3)
    return {
      label: `Only ${count} ${mode === "return" ? (count === 1 ? "dock" : "docks") : count === 1 ? "bike" : "bikes"} left`,
      kind: "low",
      count,
      eligible: true,
    };
  return {
    label: mode === "return" ? "Ready for your return" : "Ready to ride",
    kind: "good",
    count,
    eligible: true,
  };
}
export function matches(station: Station, query: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/&|\band\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const haystack = norm(`${station.name} ${station.short_name}`);
  return norm(query)
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}
