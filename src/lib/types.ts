export type Mode = "borrow" | "return";
export type BikeType = "any" | "classic" | "electric";
export type Region = "hyde-park" | "loop";
export type Point = { lat: number; lon: number; name: string; region?: Region };
export type Station = {
  station_id: string;
  name: string;
  short_name: string;
  lat: number;
  lon: number;
  capacity: number;
  region: Region;
};
export type StationStatus = {
  station_id: string;
  classic: number;
  electric: number;
  docks: number;
  installed: boolean;
  renting: boolean;
  returning: boolean;
  changed_at: string;
  previous_classic: number | null;
  previous_electric: number | null;
  previous_docks: number | null;
  version: number;
};
export type Health = {
  source: "divvy";
  last_attempt_at: string;
  last_success_at: string | null;
  source_updated_at: string | null;
  last_result: "success" | "failed" | "running";
  error_code: string | null;
  changed_count: number;
  duration_ms: number;
  station_reports: Record<string, number>;
  missing_ids: string[];
  version: number;
};
export type Snapshot = {
  stations: Station[];
  statuses: StationStatus[];
  health: Health | null;
  transport: "realtime" | "source-preview";
  fetched_at: string;
};
export type Follow = { station_id: string; created_at: string };
export type Freshness = "fresh" | "stale" | "down" | "unknown";
