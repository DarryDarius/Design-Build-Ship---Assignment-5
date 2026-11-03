"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeClient } from "./supabase";
import type { Snapshot } from "./types";

export function useBoard(stationIds: string[]) {
  const filterIds = stationIds.join(",");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<
    "connecting" | "live" | "reconnecting" | "offline" | "preview"
  >("connecting");
  const [now, setNow] = useState(() => Date.now());
  const live = useRef(true),
    sequence = useRef(0);
  const refresh = useCallback(async () => {
    const ticket = ++sequence.current;
    try {
      const response = await fetch("/api/snapshot", {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Couldn't load the station board.");
      if (!live.current || ticket !== sequence.current) return;
      setSnapshot((previous) =>
        !previous ||
        !previous.health ||
        !payload.health ||
        payload.health.version >= previous.health.version
          ? payload
          : previous,
      );
      setError(null);
      if (payload.transport === "source-preview") setConnection("preview");
    } catch (e) {
      if (live.current && ticket === sequence.current)
        setError(e instanceof Error ? e.message : "Couldn't load the board.");
    }
  }, []);
  useEffect(() => {
    live.current = true;
    // Initial fetch synchronizes this component with an external data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const db = makeClient();
    let cancelled = false;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const reconcile = () => {
      clearTimeout(pending);
      pending = setTimeout(() => void refresh(), 120);
    };
    const channel = db
      ?.channel("dockside-board")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dockside_station_status",
          filter: `station_id=in.(${filterIds})`,
        },
        reconcile,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dockside_source_health",
          filter: "source=eq.divvy",
        },
        reconcile,
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setConnection("live");
          void refresh();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        )
          setConnection(navigator.onLine ? "reconnecting" : "offline");
      });
    // Only the explicitly labelled, development-only preview polls the source.
    const previewClock = !db
      ? setInterval(() => void refresh(), 60000)
      : undefined;
    const offline = () => setConnection("offline");
    const online = () => {
      setConnection(db ? "reconnecting" : "preview");
      void refresh();
    };
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      live.current = false;
      cancelled = true;
      clearInterval(clock);
      clearInterval(previewClock);
      clearTimeout(pending);
      if (channel) void db?.removeChannel(channel);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, filterIds]);
  return { snapshot, error, connection, now, refresh };
}
