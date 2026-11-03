"use client";

import { UserButton, useClerk } from "@clerk/nextjs";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Bike,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  Info,
  LocateFixed,
  MapPin,
  Navigation2,
  Plus,
  Search,
  Star,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { Brand } from "./Brand";
import { useBoard } from "@/lib/use-board";
import { useFollows } from "@/lib/use-follows";
import {
  ago,
  availability,
  distance,
  distanceLabel,
  feedFreshness,
  matches,
  PRESETS,
  quantity,
  recommendStation,
  searchLocations as searchLocationOptions,
  stationFreshness,
} from "@/lib/rules";
import catalog from "@/data/stations.json";
import type {
  BikeType,
  Mode,
  Point,
  Region,
  Station,
  StationStatus,
} from "@/lib/types";

type Context = {
  mode: Mode;
  bike: BikeType;
  anchor: Point;
  region: Region;
  selected: string;
  selection: "automatic" | "suggested" | "manual";
  view: "nearby" | "saved";
};
const defaultContext: Context = {
  mode: "borrow",
  bike: "any",
  anchor: PRESETS[0],
  region: "hyde-park",
  selected: catalog[0].station_id,
  selection: "automatic",
  view: "nearby",
};
const regionName = (r: Region) =>
  r === "hyde-park" ? "Hyde Park" : "The Loop";
const pad = (n: number) => String(n).padStart(2, "0");
const subscribeMobile = (notify: () => void) => {
  const media = window.matchMedia("(max-width: 740px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const mobileSnapshot = () => window.matchMedia("(max-width: 740px)").matches;
const validPoint = (point: Point) =>
  point &&
  Number.isFinite(point.lat) &&
  Math.abs(point.lat) <= 90 &&
  Number.isFinite(point.lon) &&
  Math.abs(point.lon) <= 180 &&
  typeof point.name === "string";

export default function Board() {
  const follows = useFollows();
  const {
    isLoaded: authLoaded,
    userId: authUserId,
    toggle: toggleFollow,
  } = follows;
  const clerk = useClerk();
  const [context, setContext] = useState<Context>(defaultContext);
  const [query, setQuery] = useState("");
  const watchedIds = catalog
    .filter(
      (station) =>
        station.station_id === context.selected ||
        (context.view === "saved"
          ? follows.rows.some(
              (follow) => follow.station_id === station.station_id,
            )
          : query.trim() || station.region === context.region),
    )
    .map((station) => station.station_id);
  const { snapshot, error, connection, now, refresh } = useBoard(watchedIds);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileDetails, setMobileDetails] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const locationDialog = useRef<HTMLDialogElement>(null),
    coverageDialog = useRef<HTMLDialogElement>(null),
    detailsPanel = useRef<HTMLDivElement>(null);
  const mobile = useSyncExternalStore(
    subscribeMobile,
    mobileSnapshot,
    () => false,
  );
  const restored = useRef(false),
    hadStoredContext = useRef(false),
    initialViewOwner = useRef<string | null>(null),
    pendingHandled = useRef(false),
    lastSelectedButton = useRef<HTMLButtonElement | null>(null);
  const { mode, bike, anchor, region, selected, view } = context;
  const stations = (
    snapshot?.stations.length ? snapshot.stations : catalog
  ) as Station[];
  const statusById = useMemo(
    () => new Map(snapshot?.statuses.map((s) => [s.station_id, s]) ?? []),
    [snapshot?.statuses],
  );
  const savedIds = new Set(follows.rows.map((f) => f.station_id));
  const health = snapshot?.health ?? null;
  const freshness = feedFreshness(health, now);
  const isDisconnected =
    connection === "offline" || connection === "reconnecting";

  useEffect(() => {
    if (restored.current) return;
    try {
      const raw = sessionStorage.getItem("dockside-context");
      if (raw) {
        const value = JSON.parse(raw) as Context;
        if (
          (value.mode === "borrow" || value.mode === "return") &&
          (value.region === "hyde-park" || value.region === "loop") &&
          ["any", "classic", "electric"].includes(value.bike) &&
          ["nearby", "saved"].includes(value.view) &&
          validPoint(value.anchor) &&
          catalog.some((s) => s.station_id === value.selected)
        ) {
          // Hydrate browser trip context after the server-rendered first paint.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setContext({
            ...value,
            selection: value.selection === "manual" ? "manual" : "automatic",
          });
          hadStoredContext.current = true;
        }
      }
    } catch {
      /* Browsing works when storage is unavailable. */
    }
    restored.current = true;
  }, []);
  useEffect(() => {
    // Do not overwrite storage with the first default render while hydration
    // is restoring a saved trip; Strict Mode replays mount effects in dev.
    if (!restored.current || context === defaultContext) return;
    try {
      const safe =
        context.anchor.name === "Your location"
          ? { ...context, anchor: PRESETS.find((p) => p.region === region)! }
          : context;
      sessionStorage.setItem("dockside-context", JSON.stringify(safe));
    } catch {}
  }, [context, region]);
  useEffect(() => {
    if (
      !authUserId ||
      !follows.loaded ||
      initialViewOwner.current === authUserId
    )
      return;
    initialViewOwner.current = authUserId;
    if (!hadStoredContext.current && follows.rows.length > 0) {
      // Initial view follows the signed-in user's successfully loaded preferences.
      setContext((current) => ({
        ...current,
        view: "saved",
        selection: "automatic",
      }));
    }
  }, [authUserId, follows.loaded, follows.rows.length]);
  useEffect(() => {
    if (!authLoaded || !authUserId || pendingHandled.current) return;
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem("dockside-pending-save");
    } catch {}
    if (!pending) return;
    pendingHandled.current = true;
    void toggleFollow(pending, true)
      .then(() => {
        sessionStorage.removeItem("dockside-pending-save");
        setNotice("Station saved. You're right where you left off.");
      })
      .catch((e) => {
        pendingHandled.current = false;
        setNotice(e.message);
      });
  }, [authLoaded, authUserId, toggleFollow]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!mobileDetails || !mobile) return;
    const panel = detailsPanel.current,
      previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel?.querySelector<HTMLButtonElement>(".mobile-close")?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileDetails(false);
        lastSelectedButton.current?.focus();
      }
      if (e.key === "Tab" && panel) {
        const elements = Array.from(
          panel.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]"),
        ).filter((el) => el.offsetParent !== null);
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [mobileDetails, mobile]);

  const update = (patch: Partial<Context>) =>
    setContext((old) => ({ ...old, ...patch }));
  const setAnchor = (point: Point) => {
    const nextRegion = point.region ?? region;
    update({
      anchor: point,
      region: nextRegion,
      selection: "automatic",
      view: "nearby",
    });
    setExpanded(false);
    setQuery("");
    locationDialog.current?.close();
  };
  const switchRegion = (next: Region) => {
    setAnchor(PRESETS.find((p) => p.region === next)!);
  };
  const available = (s: Station) =>
    availability(
      statusById.get(s.station_id),
      mode,
      bike,
      stationFreshness(s.station_id, health, now),
    );
  const nearby = stations
    .filter((s) => s.region === region)
    .map((s) => ({ ...s, meters: distance(anchor, s) }))
    .sort(
      (a, b) => a.meters - b.meters || a.station_id.localeCompare(b.station_id),
    );
  const withinCoverage =
    Math.min(...stations.map((s) => distance(anchor, s))) < 2500;
  const scope =
    view === "saved"
      ? follows.rows
          .map((f) => stations.find((s) => s.station_id === f.station_id))
          .filter((s): s is Station => !!s)
          .map((s) => ({ ...s, meters: distance(anchor, s) }))
      : query.trim()
        ? stations
            .map((s) => ({ ...s, meters: distance(anchor, s) }))
            .sort(
              (a, b) =>
                a.meters - b.meters || a.station_id.localeCompare(b.station_id),
            )
        : nearby;
  const visible = scope.filter(
    (s) =>
      matches(s, query) &&
      (view === "saved" || query || expanded || s.meters <= 1000),
  );
  const nearest = !isDisconnected
    ? recommendStation(nearby, anchor, statusById, health, now, mode, bike)
    : undefined;
  const suggested =
    view === "saved"
      ? !isDisconnected
        ? recommendStation(scope, anchor, statusById, health, now, mode, bike)
        : undefined
      : nearest;
  const initialStation = suggested ?? scope[0];
  const initialId = initialStation?.station_id;
  // Pin the first verified suggestion for this task. Later live events update
  // its quantities without moving the user's detail panel to another station.
  useEffect(() => {
    if (
      context.selection !== "automatic" ||
      freshness !== "fresh" ||
      isDisconnected ||
      !initialId
    )
      return;
    // One-time synchronization with the first fresh external snapshot for this
    // task; changing the guard to "suggested" prevents subsequent live repicks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContext((current) =>
      current.selection === "automatic"
        ? { ...current, selected: initialId, selection: "suggested" }
        : current,
    );
  }, [context.selection, freshness, isDisconnected, initialId]);
  const chosen =
    context.selection === "automatic"
      ? initialStation
      : (stations.find((s) => s.station_id === selected) ?? initialStation);
  const chosenStatus = chosen ? statusById.get(chosen.station_id) : undefined;
  const chosenAvailability = chosen ? available(chosen) : undefined;
  const alternatives =
    chosen && !isDisconnected
      ? stations
          .filter(
            (s) => s.station_id !== chosen.station_id && available(s).eligible,
          )
          .map((s) => ({ ...s, meters: distance(chosen, s) }))
          .filter((s) => s.meters <= 1500)
          .sort((a, b) => a.meters - b.meters)
          .slice(0, 2)
      : [];
  const locationOptions = searchLocationOptions(stations, locationQuery).slice(
    0,
    12,
  );
  const sourceTime = health?.source_updated_at
    ? new Date(health.source_updated_at).toLocaleTimeString("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  function signIn(stationId?: string) {
    try {
      if (stationId) sessionStorage.setItem("dockside-pending-save", stationId);
    } catch {}
    void clerk.redirectToSignIn({ signInFallbackRedirectUrl: "/" });
  }
  async function toggleSave(id: string) {
    if (!follows.isLoaded) return;
    if (!follows.userId) {
      signIn(id);
      return;
    }
    try {
      const save = !savedIds.has(id);
      await follows.toggle(id, save);
      setNotice(
        save
          ? "Station saved to your board."
          : "Station removed from your board.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't save that change.");
    }
  }
  function selectStation(id: string, button?: HTMLButtonElement) {
    const target = stations.find((station) => station.station_id === id);
    update({
      selected: id,
      selection: "manual",
      ...(target && target.region !== region && view === "nearby"
        ? { region: target.region, anchor: target, view: "nearby" as const }
        : {}),
    });
    if (target && target.region !== region) {
      setQuery("");
      setExpanded(false);
    }
    if (button) lastSelectedButton.current = button;
    setMobileDetails(true);
  }
  function useLocation() {
    if (!navigator.geolocation) {
      setNotice(
        "Location isn't supported here. Choose a preset or station instead.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const point = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          name: "Your location",
        };
        const closest = [...stations].sort(
          (a, b) => distance(point, a) - distance(point, b),
        )[0];
        setAnchor({ ...point, region: closest.region });
        if (distance(point, closest) > 2500)
          setNotice(
            "You're outside our coverage. Choose Hyde Park or the Loop to browse monitored stations.",
          );
      },
      () => {
        setLocating(false);
        setNotice(
          "Location wasn't shared. Choose a preset or search for a station instead.",
        );
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  function changeMode(next: Mode) {
    if (next === mode) return;
    try {
      sessionStorage.setItem(
        `dockside-anchor-${mode}`,
        JSON.stringify(
          anchor.name === "Your location"
            ? PRESETS.find((p) => p.region === region)
            : anchor,
        ),
      );
      const stored = sessionStorage.getItem(`dockside-anchor-${next}`);
      const candidate = stored ? (JSON.parse(stored) as Point) : anchor;
      const point = validPoint(candidate) ? candidate : anchor;
      const nextRegion = point.region ?? region;
      update({
        mode: next,
        anchor: point,
        region: nextRegion,
        selection: "automatic",
      });
    } catch {
      update({ mode: next, selection: "automatic" });
    }
  }
  const directions = chosen
    ? `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: `${chosen.lat},${chosen.lon}`, travelmode: mode === "borrow" ? "walking" : "bicycling", ...(mode === "borrow" ? { origin: `${anchor.lat},${anchor.lon}` } : {}) })}`
    : "#";

  return (
    <div className="app-shell">
      <header className="masthead">
        <Brand />
        <div className="masthead-city">
          <span className="city-symbol" aria-hidden="true">
            ✶ ✶ ✶ ✶
          </span>
          <span>CHICAGO, IL</span>
        </div>
        <div className="account">
          {follows.userId ? (
            <UserButton />
          ) : (
            <button className="text-button" onClick={() => signIn()}>
              Sign in <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      </header>
      <main id="main" className="workspace">
        <div className="board-intro">
          <div>
            <p className="eyebrow">
              <span className="small-square" /> CHICAGO / DIVVY STATION BOARD
            </p>
            <h1>
              {mode === "borrow" ? (
                <>
                  Find a <span>bike.</span>
                </>
              ) : (
                <>
                  Find an <span>open dock.</span>
                </>
              )}
            </h1>
          </div>
          <button
            className="coverage-link"
            onClick={() => coverageDialog.current?.showModal()}
          >
            <span className="coverage-number">40</span>
            <span>
              stations.
              <br />
              two neighborhoods.
            </span>
            <ArrowUpRight size={20} />
          </button>
        </div>
        <section className="trip-controls" aria-label="Plan your station stop">
          <div className="mode-switch" aria-label="Your task">
            {(["borrow", "return"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                className={mode === m ? "active" : ""}
                onClick={() => changeMode(m)}
              >
                {m === "borrow" ? (
                  <ArrowUpRight size={21} />
                ) : (
                  <ArrowDownLeft size={21} />
                )}
                <span>{m === "borrow" ? "Get a bike" : "Return a bike"}</span>
              </button>
            ))}
          </div>
          <div className="anchor-control">
            <span className="field-kicker">
              {mode === "borrow" ? "STARTING NEAR" : "RETURNING NEAR"}
            </span>
            <button
              onClick={() => {
                setLocationQuery("");
                locationDialog.current?.showModal();
              }}
              className="anchor-button"
            >
              <MapPin size={17} />
              <span>{anchor.name}</span>
              <ChevronDown size={16} />
            </button>
          </div>
          <button
            className="locate-button"
            onClick={useLocation}
            disabled={locating}
            title={
              mode === "borrow"
                ? "Use my location as the starting point"
                : "Use my location as the return destination"
            }
          >
            <LocateFixed size={19} />
            <span>{locating ? "Locating…" : "Use my location"}</span>
          </button>
        </section>
        <div className="board-grid">
          <section className="station-board" aria-label="Station availability">
            {view === "nearby" &&
              snapshot &&
              !query.trim() &&
              (nearest ? (
                <button
                  className="decision-strip"
                  onClick={(event) =>
                    selectStation(nearest.station_id, event.currentTarget)
                  }
                >
                  <Navigation2 size={19} aria-hidden="true" />
                  <span>
                    <small>
                      NEAREST AVAILABLE{" "}
                      {mode === "return"
                        ? "DOCK"
                        : bike === "electric"
                          ? "E-BIKE"
                          : bike === "classic"
                            ? "CLASSIC BIKE"
                            : "BIKE"}
                    </small>
                    <strong>{nearest.name}</strong>
                    <span>
                      {available(nearest).count}{" "}
                      {mode === "return"
                        ? "open docks"
                        : bike === "electric"
                          ? "e-bikes"
                          : bike === "classic"
                            ? "classic bikes"
                            : "bikes"}{" "}
                      · {distanceLabel(distance(anchor, nearest))} straight-line
                      {available(nearest).kind === "low"
                        ? " · Limited availability"
                        : ""}
                    </span>
                  </span>
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              ) : (
                <p className="decision-unavailable">
                  {isDisconnected || freshness !== "fresh"
                    ? "Waiting for fresh, connected station data before suggesting a stop."
                    : !withinCoverage
                      ? "Choose a point in our coverage area to find a nearby stop."
                      : `No confirmed ${mode === "return" ? "open docks" : bike === "electric" ? "e-bikes" : bike === "classic" ? "classic bikes" : "bikes"} within 2.5 km. Try another type or location.`}
                </p>
              ))}
            <div className="board-toolbar">
              <div className="view-tabs" aria-label="Station list">
                <button
                  className={view === "nearby" ? "active" : ""}
                  onClick={() =>
                    update({ view: "nearby", selection: "automatic" })
                  }
                >
                  Find a station
                </button>
                <button
                  className={view === "saved" ? "active" : ""}
                  onClick={() =>
                    update({ view: "saved", selection: "automatic" })
                  }
                >
                  <Star size={14} /> My stations{" "}
                  {follows.rows.length > 0 && (
                    <span className="tab-count">{follows.rows.length}</span>
                  )}
                </button>
              </div>
              <span className="live-mark">
                <span
                  className={`status-dot ${freshness === "fresh" && !isDisconnected ? "" : "warning"}`}
                />
                {connection === "preview"
                  ? "SOURCE PREVIEW"
                  : freshness === "fresh" && !isDisconnected
                    ? "LIVE BOARD"
                    : "LAST KNOWN"}
              </span>
            </div>
            <div className="list-options">
              {view === "nearby" && !query.trim() ? (
                <div className="region-tabs" aria-label="Coverage area">
                  {(["hyde-park", "loop"] as const).map((r) => (
                    <button
                      key={r}
                      className={region === r ? "active" : ""}
                      onClick={() => switchRegion(r)}
                    >
                      {regionName(r)}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="return-note">
                  {view === "saved"
                    ? "Your saved stations · both areas"
                    : "Search results · both areas"}
                </span>
              )}
              {mode === "borrow" ? (
                <div className="bike-filter" aria-label="Bicycle type">
                  {(["any", "classic", "electric"] as const).map((type) => (
                    <button
                      key={type}
                      aria-pressed={bike === type}
                      className={bike === type ? "active" : ""}
                      onClick={() =>
                        update({ bike: type, selection: "automatic" })
                      }
                    >
                      {type === "electric" && <Zap size={12} />}{" "}
                      {type === "any"
                        ? "Any bike"
                        : type === "classic"
                          ? "Classic"
                          : "E-bike"}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="return-note">Showing open docks</span>
              )}
            </div>
            <label className="station-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  view === "saved"
                    ? "Find a saved station"
                    : "Search all 40 stations"
                }
                aria-label={
                  view === "saved"
                    ? "Search your saved stations"
                    : "Search stations in Hyde Park and the Loop"
                }
                aria-describedby="station-search-scope"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search">
                  <X size={15} />
                </button>
              )}
              <span className="search-shortcut">
                {view === "saved" ? "SAVED" : "A—Z"}
              </span>
            </label>
            <p id="station-search-scope" className="search-scope">
              {view === "saved"
                ? "Searching your saved stations."
                : "Search covers Hyde Park + The Loop. Select a result to explore its area."}
            </p>
            {(error ||
              isDisconnected ||
              freshness === "down" ||
              freshness === "stale" ||
              connection === "preview") && (
              <div
                className={`board-alert ${connection === "preview" ? "preview" : ""}`}
                role="status"
              >
                {isDisconnected ? <WifiOff size={17} /> : <Info size={17} />}
                <div>
                  <strong>
                    {connection === "offline"
                      ? "You're offline."
                      : connection === "reconnecting"
                        ? "Reconnecting to live updates."
                        : error
                          ? "Couldn't refresh the board."
                          : connection === "preview"
                            ? "Development source preview."
                            : freshness === "down"
                              ? "The last station check failed."
                              : "Station data is delayed."}
                  </strong>
                  <p>
                    {connection === "preview"
                      ? "Real Divvy data. The background worker and Realtime are not connected yet."
                      : isDisconnected
                        ? "Last known numbers stay visible. We'll catch up when the connection returns."
                        : (error ??
                          `Last successful check ${ago(health?.last_success_at, now)}. Older numbers aren't used to suggest a station.`)}
                  </p>
                </div>
                {!isDisconnected && (
                  <button
                    onClick={() => void refresh()}
                    className="text-button"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
            <div className="column-head">
              <span>#</span>
              <span>STATION</span>
              <span>{mode === "borrow" ? "BIKES" : "DOCKS"}</span>
              <span title="Straight-line distance">
                STRAIGHT
                <br />
                LINE
              </span>
              <span />
            </div>
            {!snapshot && !error ? (
              <div
                className="skeleton-board"
                role="status"
                aria-label="Loading live station availability"
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <div className="skeleton-row" key={i}>
                    <span />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : view === "saved" && !follows.userId ? (
              <div className="empty-state">
                <Star size={28} />
                <h2>
                  Your everyday stops,
                  <br />
                  all in one place.
                </h2>
                <p>
                  Save the stations you use. Their latest availability will be
                  here when you return.
                </p>
                <button className="primary-button" onClick={() => signIn()}>
                  Sign in to save stations <ArrowUpRight size={17} />
                </button>
              </div>
            ) : view === "saved" && follows.error ? (
              <div className="empty-state">
                <h2>Your stations couldn&apos;t load.</h2>
                <p>{follows.error}</p>
                <button className="outline-button" onClick={follows.retry}>
                  Try again
                </button>
              </div>
            ) : view === "saved" && follows.userId && !follows.loaded ? (
              <div
                className="skeleton-board"
                role="status"
                aria-label="Loading your saved stations"
              >
                {[0, 1, 2].map((i) => (
                  <div className="skeleton-row" key={i}>
                    <span />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="empty-state">
                <Search size={26} />
                <h2>
                  {query
                    ? "No matching stations."
                    : view === "saved"
                      ? "Make this board yours."
                      : !withinCoverage
                        ? "A little outside our neighborhood."
                        : "Look a little further."}
                </h2>
                <p>
                  {query
                    ? view === "saved"
                      ? "No saved station matches. Clear the search or browse all stations."
                      : "No match in either area. Try a station or street name, like Millennium or Ellis."
                    : view === "saved"
                      ? "Find a station, then use the star to save it here."
                      : !withinCoverage
                        ? "We're currently watching Hyde Park and the Loop. Choose one of these areas to explore."
                        : "There aren't monitored stations within 1 km of this point."}
                </p>
                <button
                  className="outline-button"
                  onClick={() =>
                    query
                      ? setQuery("")
                      : view === "saved"
                        ? update({ view: "nearby" })
                        : !withinCoverage
                          ? switchRegion("hyde-park")
                          : setExpanded(true)
                  }
                >
                  {query
                    ? "Clear search"
                    : view === "saved"
                      ? "Find a station"
                      : !withinCoverage
                        ? "Browse Hyde Park"
                        : "Show more stations"}
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <ol className="station-list">
                {visible.map((station, index) => {
                  const status = statusById.get(station.station_id),
                    state = available(station),
                    isSelected = chosen?.station_id === station.station_id;
                  return (
                    <li
                      key={station.station_id}
                      className={`station-row ${isSelected ? "selected" : ""} ${state.kind}`}
                    >
                      <button
                        className="station-select"
                        onClick={(e) =>
                          selectStation(station.station_id, e.currentTarget)
                        }
                        aria-pressed={isSelected}
                        aria-label={`${station.name}, ${state.count ?? "unknown"} ${mode === "borrow" ? "bikes" : "open docks"}, ${distanceLabel(station.meters)} straight-line distance. ${state.label}`}
                      >
                        <span className="station-index">{pad(index + 1)}</span>
                        <span className="station-description">
                          <span className="station-name">{station.name}</span>
                          <span className="station-meta">
                            {query.trim() && (
                              <span className="result-region">
                                {regionName(station.region)}
                              </span>
                            )}
                            {nearest?.station_id === station.station_id &&
                            view === "nearby" ? (
                              <>
                                <span className="nearest-label">
                                  <Navigation2 size={11} />
                                  Nearest available
                                </span>
                                {state.kind === "low" && (
                                  <span className="availability-label low">
                                    {state.label}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span
                                className={`availability-label ${state.kind}`}
                              >
                                {state.kind === "low" && (
                                  <span className="tiny-dot" />
                                )}
                                {state.label}
                              </span>
                            )}
                            {state.kind !== "unknown" &&
                              state.kind !== "low" &&
                              status &&
                              mode === "borrow" && (
                                <span className="type-summary">
                                  {status.classic} classic · {status.electric}{" "}
                                  electric
                                </span>
                              )}
                          </span>
                        </span>
                        <span className={`station-quantity ${state.kind}`}>
                          {state.count === null ? "—" : pad(state.count)}
                          <span>{mode === "borrow" ? "bikes" : "docks"}</span>
                        </span>
                        <span className="station-distance">
                          {distanceLabel(station.meters)}
                          <ChevronRight size={15} />
                        </span>
                      </button>
                      <button
                        className={`save-button ${savedIds.has(station.station_id) ? "saved" : ""}`}
                        onClick={() => void toggleSave(station.station_id)}
                        disabled={!!follows.pending || !follows.isLoaded}
                        aria-label={`${savedIds.has(station.station_id) ? "Unsave" : "Save"} ${station.name}`}
                        aria-pressed={savedIds.has(station.station_id)}
                      >
                        <Star
                          size={18}
                          fill={
                            savedIds.has(station.station_id)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {snapshot &&
              view === "nearby" &&
              !query &&
              !expanded &&
              visible.length > 0 &&
              visible.length < nearby.length && (
                <button
                  className="expand-list"
                  onClick={() => setExpanded(true)}
                >
                  Show all {nearby.length} stations in {regionName(region)}{" "}
                  <Plus size={15} />
                </button>
              )}
            <div className="board-footnote">
              <span>
                <span className="legend-marker" /> Availability can change
                before you arrive.
              </span>
              <span>↗ Straight-line distance</span>
            </div>
          </section>
          {chosen && (
            <aside
              className={`station-aside ${mobileDetails ? "mobile-open" : ""}`}
              aria-label="Selected station details"
              role={mobile && mobileDetails ? "dialog" : undefined}
              aria-modal={mobile && mobileDetails ? true : undefined}
            >
              <div
                className="mobile-scrim"
                onClick={() => {
                  setMobileDetails(false);
                  lastSelectedButton.current?.focus();
                }}
              />
              <div className="details-content" ref={detailsPanel}>
                <div className="selected-station">
                  <div className="selected-top">
                    <span>
                      {context.selection === "manual"
                        ? "YOUR SELECTED STOP"
                        : chosenAvailability?.eligible && !isDisconnected
                          ? "SUGGESTED FIRST STOP"
                          : "STATION DETAILS"}
                    </span>
                    <button
                      className="mobile-close"
                      aria-label="Close station details"
                      onClick={() => {
                        setMobileDetails(false);
                        lastSelectedButton.current?.focus();
                      }}
                    >
                      <X size={21} />
                    </button>
                    <span className="desktop-station-code">
                      {chosen.short_name}
                    </span>
                  </div>
                  <div className="station-wayfinding" aria-hidden="true">
                    <ArrowUpRight strokeWidth={1.5} />
                  </div>
                  <p className="selected-area">
                    {regionName(chosen.region)} <span> / </span> CHICAGO
                  </p>
                  <h2>{chosen.name.replace(" & ", " &\n")}</h2>
                  <p className="selected-distance">
                    {distanceLabel(distance(anchor, chosen))} straight-line from{" "}
                    {anchor.name}
                  </p>
                  <div className="selected-inventory">
                    <span className="selected-count">
                      {chosenAvailability?.count === null ||
                      chosenAvailability?.count === undefined
                        ? "—"
                        : pad(chosenAvailability.count)}
                    </span>
                    <div>
                      <span>
                        {mode === "return"
                          ? "open docks"
                          : bike === "electric"
                            ? "e-bikes"
                            : bike === "classic"
                              ? "classic bikes"
                              : "bikes available"}
                      </span>
                      <strong>
                        {chosenAvailability?.eligible && !isDisconnected ? (
                          <>
                            <span className="white-dot" />
                            {chosenAvailability.kind === "low"
                              ? chosenAvailability.label
                              : "Good to go"}
                          </>
                        ) : (
                          <>
                            <Info size={12} />
                            {isDisconnected
                              ? "Connection interrupted"
                              : chosenAvailability?.label}
                          </>
                        )}
                      </strong>
                    </div>
                  </div>
                  {chosenStatus && (
                    <div className="inventory-breakdown">
                      <span>
                        <Bike size={15} />
                        {chosenStatus.classic} classic
                      </span>
                      <span>
                        <Zap size={14} />
                        {chosenStatus.electric} electric
                      </span>
                      <span>
                        <DockIcon />
                        {chosenStatus.docks} docks
                      </span>
                    </div>
                  )}
                  <a
                    href={directions}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="directions-button"
                  >
                    {chosenAvailability?.eligible && !isDisconnected
                      ? mode === "borrow"
                        ? "Walk to this station"
                        : "Ride to this station"
                      : "View station location"}
                    <ArrowUpRight size={21} />
                  </a>
                  <p className="directions-note">
                    {mode === "borrow"
                      ? "Walking time & route in Google Maps"
                      : "Cycling time & route in Google Maps"}{" "}
                    <ExternalLink size={10} />
                  </p>
                </div>
                <div className="station-detail-meta">
                  <div>
                    <Clock3 size={14} />
                    <span>
                      Station reported{" "}
                      {ago(
                        health?.station_reports[chosen.station_id]
                          ? new Date(
                              health.station_reports[chosen.station_id] * 1000,
                            ).toISOString()
                          : null,
                        now,
                      )}
                    </span>
                  </div>
                  <div>
                    <MapPin size={14} />
                    <span>
                      {distanceLabel(distance(anchor, chosen))} straight-line
                      from {anchor.name}
                    </span>
                  </div>
                  {chosenStatus && (
                    <ChangeNote
                      status={chosenStatus}
                      mode={mode}
                      bike={bike}
                      now={now}
                    />
                  )}
                </div>
                <div className="alternatives">
                  <div className="section-caption">
                    <span>HAVE A PLAN B</span>
                    <span>NEAR THIS STATION</span>
                  </div>
                  {alternatives.length > 0 ? (
                    alternatives.map((station) => (
                      <button
                        className="alternative-row"
                        key={station.station_id}
                        onClick={() => update({ selected: station.station_id })}
                      >
                        <span className="alternative-arrow">
                          <ArrowRight size={17} />
                        </span>
                        <span>
                          <strong>{station.name}</strong>
                          <small>
                            {distanceLabel(station.meters)} away ·{" "}
                            {available(station).count}{" "}
                            {mode === "borrow" ? "bikes" : "open docks"}
                          </small>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    ))
                  ) : (
                    <p className="alternatives-empty">
                      No other confirmed{" "}
                      {mode === "borrow" ? "bikes" : "open docks"} within 1.5 km
                      of this station. Try another area or check again shortly.
                    </p>
                  )}
                </div>
                <div className="saved-hint">
                  <Star size={16} />
                  <p>
                    Make it a regular stop.
                    <br />
                    <button
                      onClick={() => void toggleSave(chosen.station_id)}
                      disabled={!!follows.pending}
                    >
                      {savedIds.has(chosen.station_id)
                        ? "Saved to your stations"
                        : "Save this station"}
                      <ArrowUpRight size={12} />
                    </button>
                  </p>
                </div>
              </div>
            </aside>
          )}
        </div>
        <footer className="system-footer">
          <details className="health-details">
            <summary>
              <span
                className={`status-dot ${freshness === "fresh" && !isDisconnected ? "" : "warning"}`}
              />
              {!snapshot
                ? "Waiting for the station board"
                : connection === "preview"
                  ? "Source preview · background system not connected"
                  : isDisconnected
                    ? "Live connection interrupted"
                    : freshness === "fresh"
                      ? `Checked ${ago(health?.last_success_at, now)}`
                      : freshness === "down"
                        ? "Last check failed"
                        : "Data freshness unconfirmed"}
              <ChevronDown size={12} />
            </summary>
            <div>
              <p>Source updated: {sourceTime} Chicago time</p>
              <p>Last successful check: {ago(health?.last_success_at, now)}</p>
              <p>
                Station counts changed in the last run:{" "}
                {health?.changed_count ?? "—"}
              </p>
              <p>
                {connection === "preview"
                  ? "Direct source preview in development."
                  : "Background checks about every 60 seconds. Updates arrive automatically."}
              </p>
              <p>Individual stations may report later than the overall feed.</p>
            </div>
          </details>
          <div className="footer-source">
            Station data by{" "}
            <a
              href="https://divvybikes-marketing.lyft.net/system-data"
              target="_blank"
              rel="noopener noreferrer"
            >
              Divvy ↗
            </a>
            <span>Independent station board</span>
          </div>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice.includes("saved") || notice.includes("removed") ? (
            <Check size={17} />
          ) : (
            <Info size={17} />
          )}
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <dialog ref={locationDialog} className="location-dialog">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">
              {mode === "borrow" ? "YOUR STARTING POINT" : "YOUR DESTINATION"}
            </p>
            <h2>
              {mode === "borrow"
                ? "Choose a starting point."
                : "Choose a return destination."}
            </h2>
          </div>
          <button
            aria-label="Close location picker"
            onClick={() => locationDialog.current?.close()}
          >
            <X size={21} />
          </button>
        </div>
        <p id="location-search-scope" className="location-scope">
          Choose a preset place or one of our 40 Divvy stations in either area.
          Street addresses and other building names aren&apos;t searchable here.
        </p>
        <label className="dialog-search">
          <Search size={18} />
          <input
            autoFocus
            placeholder="Preset place or station name"
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            aria-label="Search preset places and monitored stations"
            aria-describedby="location-search-scope"
          />
        </label>
        <p className="field-kicker">
          {locationQuery ? "MATCHING PLACES & STATIONS" : "PRESET PLACES"}
        </p>
        <div className="location-options">
          {(locationQuery.trim()
            ? locationOptions
            : PRESETS.map((point) => ({ ...point, kind: "Preset place" }))
          ).map((point) => (
            <button
              key={`${point.kind}-${point.name}`}
              onClick={() =>
                setAnchor({ ...point, region: point.region as Region })
              }
            >
              <MapPin size={17} />
              <span>
                <strong>{point.name}</strong>
                <small>
                  {point.kind} · {regionName(point.region as Region)}
                </small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
          {locationQuery.trim() && locationOptions.length === 0 && (
            <p className="dialog-help">
              No preset place or monitored station matches. Address search
              isn&apos;t available. Try a nearby street or station name, clear
              the search for presets, or use your current location below.
            </p>
          )}
        </div>
        <button
          className="dialog-locate"
          onClick={useLocation}
          disabled={locating}
        >
          <LocateFixed size={17} />
          {locating ? "Locating…" : "Use my current location"}
        </button>
        <p className="dialog-help">
          Currently covering selected stations in Hyde Park and the Loop. Your
          device location stays in this browser&apos;s memory.
        </p>
      </dialog>
      <dialog ref={coverageDialog} className="location-dialog">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">A SMALLER, MORE USEFUL BOARD</p>
            <h2>
              Two neighborhoods.
              <br />
              Your everyday stops.
            </h2>
          </div>
          <button
            aria-label="Close coverage information"
            onClick={() => coverageDialog.current?.close()}
          >
            <X size={21} />
          </button>
        </div>
        <p className="coverage-copy">
          Dockside watches 24 stations around UChicago and 16 in the Loop.
          Choose where you need a bike or an open dock, then save the stops that
          fit your day.
        </p>
        <div className="coverage-areas">
          {(["hyde-park", "loop"] as const).map((r) => (
            <button
              key={r}
              onClick={() => {
                switchRegion(r);
                coverageDialog.current?.close();
              }}
            >
              <span>{r === "hyde-park" ? "24" : "16"}</span>
              <strong>{regionName(r)}</strong>
              <ArrowUpRight size={25} />
            </button>
          ))}
        </div>
        <p className="dialog-help">
          Availability comes from Divvy&apos;s public GBFS feed. Bikes and open
          docks can change between a check and your arrival.
        </p>
      </dialog>
    </div>
  );
}

function DockIcon() {
  return (
    <svg
      width="14"
      height="15"
      viewBox="0 0 14 15"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 3v9M12 3v9M2 7h10M5 12h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ChangeNote({
  status,
  mode,
  bike,
  now,
}: {
  status: StationStatus;
  mode: Mode;
  bike: BikeType;
  now: number;
}) {
  const previous =
    mode === "return"
      ? status.previous_docks
      : bike === "classic"
        ? status.previous_classic
        : bike === "electric"
          ? status.previous_electric
          : status.previous_classic !== null &&
              status.previous_electric !== null
            ? status.previous_classic + status.previous_electric
            : null;
  if (previous === null) return null;
  const difference = quantity(status, mode, bike) - previous;
  if (!difference) return null;
  return (
    <div className="change-note">
      <span aria-hidden="true">↗</span>
      <span>
        {difference > 0 ? "+" : ""}
        {difference} {mode === "return" ? "docks" : "bikes"} · change recorded{" "}
        {ago(status.changed_at, now)}
      </span>
    </div>
  );
}
