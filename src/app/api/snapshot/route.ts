import { createClient } from "@supabase/supabase-js";
import catalog from "@/data/stations.json";
import { parseFeed } from "../../../../supabase/functions/_shared/normalize";
import type { Snapshot, Station } from "@/lib/types";

export async function GET() {
  const now = new Date().toISOString();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    const db = createClient(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
      },
    });
    const { data, error } = await db.rpc("dockside_snapshot");
    if (error)
      return Response.json(
        { error: "The station board is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    return Response.json(
      { ...data, transport: "realtime", fetched_at: now } satisfies Snapshot,
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  // Explicit development preview, never described as a deployed worker or Realtime.
  if (process.env.NODE_ENV === "production")
    return Response.json(
      {
        error:
          "The station board is being connected. Please check back shortly.",
      },
      { status: 503 },
    );
  try {
    const base = "https://gbfs.lyft.com/gbfs/2.3/chi/en/";
    const get = async (file: string) => {
      const r = await fetch(base + file, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error("source_unavailable");
      return r.json();
    };
    const [raw, types] = await Promise.all([
      get("station_status.json"),
      get("vehicle_types.json"),
    ]);
    const parsed = parseFeed(
      raw,
      types,
      catalog.map((s) => s.station_id),
    );
    return Response.json(
      {
        stations: catalog as Station[],
        statuses: parsed.statuses.map((s) => ({
          ...s,
          changed_at: now,
          previous_classic: null,
          previous_electric: null,
          previous_docks: null,
          version: Date.now(),
        })),
        health: {
          source: "divvy",
          last_attempt_at: now,
          last_success_at: now,
          source_updated_at: parsed.sourceUpdatedAt,
          last_result: "success",
          error_code: null,
          changed_count: 0,
          duration_ms: 0,
          station_reports: parsed.stationReports,
          missing_ids: parsed.missingIds,
          version: Date.now(),
        },
        transport: "source-preview",
        fetched_at: now,
      } satisfies Snapshot,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Divvy isn't answering right now. Try again shortly." },
      { status: 503 },
    );
  }
}
