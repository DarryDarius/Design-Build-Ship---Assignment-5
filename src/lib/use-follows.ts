"use client";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { makeClient } from "./supabase";
import type { Follow } from "./types";

export function useFollows() {
  const { userId, isLoaded, getToken } = useAuth();
  const db = useMemo(
    () => makeClient(async () => await getToken()),
    [getToken],
  );
  const [state, setState] = useState<{
    owner: string | null;
    rows: Follow[];
    error: string | null;
    loaded: boolean;
  }>({ owner: null, rows: [], error: null, loaded: false });
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!userId || !db) return;
    let cancelled = false;
    void db
      .from("dockside_follows")
      .select("station_id,created_at")
      .order("created_at")
      .then(({ data, error }) => {
        if (!cancelled)
          setState({
            owner: userId,
            rows: data ?? [],
            error: error
              ? "Couldn't load your saved stations. Try again."
              : null,
            loaded: !error,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, db]);
  const rows = state.owner === userId ? state.rows : [];
  const toggle = useCallback(
    async (id: string, save: boolean) => {
      if (!userId) throw new Error("Sign in to save your stations.");
      if (!db)
        throw new Error(
          "Saved stations are being connected. Please try again later.",
        );
      setPending(id);
      try {
        const result = save
          ? await db
              .from("dockside_follows")
              .insert({ station_id: id })
              .select("station_id,created_at")
              .single()
          : await db.from("dockside_follows").delete().eq("station_id", id);
        if (result.error && result.error.code !== "23505")
          throw new Error("Couldn't save that change. Please try again.");
        const updated = await db
          .from("dockside_follows")
          .select("station_id,created_at")
          .order("created_at");
        if (updated.error)
          throw new Error(
            "Your change was saved, but the list couldn't reload. Please retry.",
          );
        setState({
          owner: userId,
          rows: updated.data ?? [],
          error: null,
          loaded: true,
        });
      } finally {
        setPending(null);
      }
    },
    [userId, db],
  );
  return {
    userId,
    isLoaded,
    rows,
    pending,
    toggle,
    error: state.owner === userId ? state.error : null,
    loaded: state.owner === userId && state.loaded,
  };
}
