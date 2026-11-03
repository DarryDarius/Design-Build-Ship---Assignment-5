export type NormalizedStatus = { station_id: string; classic: number; electric: number; docks: number; installed: boolean; renting: boolean; returning: boolean };
export type ParsedFeed = { statuses: NormalizedStatus[]; sourceUpdatedAt: string; stationReports: Record<string, number>; missingIds: string[] };
function obj(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x)) throw new Error("invalid_structure");
  return x as Record<string, unknown>;
}
function nonnegative(x: unknown): number {
  if (typeof x !== "number" || !Number.isInteger(x) || x < 0) throw new Error("invalid_count");
  return x;
}
function flag(x: unknown): boolean {
  if (x === true || x === 1) return true;
  if (x === false || x === 0) return false;
  throw new Error("invalid_service_flag");
}
export function parseFeed(raw: unknown, rawTypes: unknown, monitoredIds: string[], nowMs = Date.now()): ParsedFeed {
  const root = obj(raw), data = obj(root.data);
  const updated = nonnegative(root.last_updated);
  if (!updated || updated * 1000 > nowMs + 30000) throw new Error("invalid_source_time");
  if (!Array.isArray(data.stations) || data.stations.length === 0) throw new Error("empty_source");
  const types = obj(obj(rawTypes).data).vehicle_types;
  if (!Array.isArray(types)) throw new Error("invalid_vehicle_types");
  const mapping = new Map<string, "classic" | "electric" | "other">();
  for (const rawType of types) {
    const type = obj(rawType);
    if (typeof type.vehicle_type_id !== "string") throw new Error("invalid_vehicle_type_id");
    mapping.set(type.vehicle_type_id, type.form_factor === "bicycle" ? type.propulsion_type === "human" ? "classic" : type.propulsion_type === "electric_assist" ? "electric" : "other" : "other");
  }
  if (![...mapping.values()].includes("classic") || ![...mapping.values()].includes("electric")) throw new Error("missing_bicycle_types");
  const monitored = new Set(monitoredIds), seen = new Set<string>();
  const statuses: NormalizedStatus[] = [], stationReports: Record<string, number> = {};
  for (const value of data.stations) {
    const row = obj(value), id = row.station_id;
    if (typeof id !== "string" || !monitored.has(id)) continue;
    if (seen.has(id)) throw new Error("duplicate_station");
    seen.add(id);
    if (!Array.isArray(row.vehicle_types_available)) throw new Error("missing_vehicle_counts");
    let classic = 0, electric = 0;
    const seenTypes = new Set<string>();
    for (const value of row.vehicle_types_available) {
      const type = obj(value);
      if (typeof type.vehicle_type_id !== "string" || seenTypes.has(type.vehicle_type_id)) throw new Error("invalid_vehicle_counts");
      seenTypes.add(type.vehicle_type_id);
      const count = nonnegative(type.count), kind = mapping.get(type.vehicle_type_id);
      if (!kind) throw new Error("unknown_vehicle_type");
      if (kind === "classic") classic += count;
      if (kind === "electric") electric += count;
    }
    if (![...mapping].filter(([,kind]) => kind === "classic" || kind === "electric").every(([type]) => seenTypes.has(type))) throw new Error("incomplete_bicycle_counts");
    const reported = nonnegative(row.last_reported);
    stationReports[id] = reported;
    statuses.push({ station_id: id, classic, electric, docks: nonnegative(row.num_docks_available), installed: flag(row.is_installed), renting: flag(row.is_renting), returning: flag(row.is_returning) });
  }
  if (statuses.length === 0) throw new Error("no_monitored_stations");
  return { statuses, sourceUpdatedAt: new Date(updated * 1000).toISOString(), stationReports, missingIds: monitoredIds.filter(id => !seen.has(id)) };
}
export function changedRows(previous: NormalizedStatus[], next: NormalizedStatus[]): NormalizedStatus[] {
  const byId = new Map(previous.map(s => [s.station_id, s]));
  return next.filter(s => {
    const old = byId.get(s.station_id);
    return !old || (["classic", "electric", "docks", "installed", "renting", "returning"] as const).some(key => old[key] !== s[key]);
  });
}
