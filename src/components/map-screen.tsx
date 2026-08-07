"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DesktopNotice } from "./desktop-notice";
import { RestroomList } from "./restroom-list";
import { RestroomSheet } from "./restroom-sheet";
import { DEFAULT_CENTER, radiusForBounds } from "@/lib/geo";
import { castVote, fetchNearby } from "@/lib/queries";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useGeolocation } from "@/lib/use-geolocation";
import type { Coords, Restroom, VoteValue } from "@/lib/types";

/**
 * Leaflet reaches for `window` at import time, so the map can never be server
 * rendered. Next only permits `ssr: false` inside a Client Component, which is
 * why this whole screen is one.
 */
const RestroomMap = dynamic(() => import("./restroom-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#e9e6df]" />,
});

type View = "map" | "list";

export function MapScreen() {
  const geo = useGeolocation();

  const [restrooms, setRestrooms] = useState<Restroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Restroom | null>(null);
  const [view, setView] = useState<View>("map");
  const [signedIn, setSignedIn] = useState(false);

  const [flyTarget, setFlyTarget] = useState<Coords | null>(null);
  const [flyToken, setFlyToken] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against a slow early request overwriting a fast later one. */
  const requestSeq = useRef(0);

  /**
   * The floating header grows and shrinks as banners appear (no location, demo
   * data, load errors), so the list has to be told how far down to start rather
   * than guessing with a fixed padding.
   */
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(72);

  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;

    const measure = () => setHeaderHeight(element.getBoundingClientRect().height);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const load = useCallback(async (origin: Coords, radiusM: number) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const results = await fetchNearby(origin, radiusM);
      if (seq !== requestSeq.current) return;
      setRestrooms(results);
      setError(null);
    } catch (cause) {
      if (seq !== requestSeq.current) return;
      setError(
        cause instanceof Error ? cause.message : "Couldn't load restrooms.",
      );
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  // Ask for location immediately and seed the list from the default centre, so
  // the screen is never empty while the permission prompt is up.
  useEffect(() => {
    geo.locate();
    void load(DEFAULT_CENTER, 2500);
    // Intentionally once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to the user once we get a fix.
  useEffect(() => {
    if (geo.status === "ready" && geo.coords) {
      setFlyTarget(geo.coords);
      setFlyToken((n) => n + 1);
    }
  }, [geo.status, geo.coords]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /** Refetch for whatever is on screen, debounced so a pan isn't 20 queries. */
  const handleViewportChange = useCallback(
    (center: Coords, northEast: Coords) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void load(center, radiusForBounds(center, northEast));
      }, 300);
    },
    [load],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleLocate = useCallback(() => {
    if (geo.coords) {
      setFlyTarget(geo.coords);
      setFlyToken((n) => n + 1);
    } else {
      geo.locate();
    }
  }, [geo]);

  const handleSelect = useCallback((restroom: Restroom) => {
    setSelected(restroom);
    setView("map");
  }, []);

  const handleVote = useCallback(
    async (restroom: Restroom, vote: VoteValue) => {
      await castVote(restroom.id, vote);
      // Reflect the vote locally so the sheet updates without a refetch.
      setRestrooms((prev) =>
        prev.map((r) =>
          r.id === restroom.id
            ? {
                ...r,
                up: vote === 1 ? r.up + 1 : r.up,
                down: vote === -1 ? r.down + 1 : r.down,
                score: r.score + vote,
              }
            : r,
        ),
      );
    },
    [],
  );

  const locating = geo.status === "locating";
  const geoBlocked =
    geo.status === "denied" ||
    geo.status === "insecure" ||
    geo.status === "unavailable";

  return (
    <>
      <main className="relative h-[100dvh] w-full overflow-hidden bg-mist md:hidden">
        {/* Map layer — kept mounted under the list so Leaflet never re-initialises. */}
        <div className={`absolute inset-0 ${view === "map" ? "" : "invisible"}`}>
          <RestroomMap
            restrooms={restrooms}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            me={geo.coords}
            accuracyM={geo.accuracyM}
            flyTarget={flyTarget}
            flyToken={flyToken}
            onViewportChange={handleViewportChange}
          />
        </div>

        {view === "list" && (
          <div
            className="absolute inset-0 overflow-y-auto bg-paper pb-28"
            style={{ paddingTop: headerHeight + 12 }}
          >
            <RestroomList
              restrooms={restrooms}
              onSelect={handleSelect}
              loading={loading}
            />
          </div>
        )}

        {/* Top bar */}
        <div
          ref={headerRef}
          className="pad-safe-top pointer-events-none absolute inset-x-0 top-0 z-1000 px-3"
        >
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-full bg-paper px-4 py-2.5 shadow-md">
              <span aria-hidden="true">🚻</span>
              <span className="text-sm font-semibold">Where To Poo</span>
              {loading && (
                <span className="ml-auto text-xs text-muted">Updating…</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setView(view === "map" ? "list" : "map")}
              className="rounded-full bg-paper px-4 py-2.5 text-sm font-semibold shadow-md transition active:bg-mist"
            >
              {view === "map" ? "List" : "Map"}
            </button>
          </div>

          {geoBlocked && geo.message && (
            <p className="pointer-events-auto mt-2 rounded-xl bg-paper px-4 py-2.5 text-xs text-muted shadow-md">
              {geo.message}
            </p>
          )}
          {error && (
            <p className="pointer-events-auto mt-2 rounded-xl bg-paper px-4 py-2.5 text-xs text-danger shadow-md">
              {error}
            </p>
          )}
          {!isSupabaseConfigured && (
            <p className="pointer-events-auto mt-2 rounded-xl bg-paper px-4 py-2.5 text-xs text-muted shadow-md">
              Demo data — connect Supabase to go live. See the README.
            </p>
          )}
        </div>

        {/* Floating controls. Hidden behind the sheet so they never overlap it. */}
        {!selected && (
          <div className="pad-safe-bottom absolute inset-x-0 bottom-0 z-1000 flex items-end justify-between px-4">
            <button
              type="button"
              onClick={handleLocate}
              aria-label="Show my location"
              // Recentring is meaningless while the list is covering the map.
              className={`grid h-12 w-12 place-items-center rounded-full bg-paper shadow-lg transition active:bg-mist ${
                view === "map" ? "" : "invisible"
              }`}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className={locating ? "animate-spin text-brand" : "text-ink"}
              >
                <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M12 1v3M12 20v3M23 12h-3M4 12H1"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              </svg>
            </button>

            <Link
              href={signedIn || !isSupabaseConfigured ? "/add" : "/login?next=/add"}
              className="flex items-center gap-2 rounded-full bg-brand px-5 py-3.5 text-base font-semibold text-white shadow-lg transition active:bg-brand-dark"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M10 4v12M4 10h12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Add a restroom
            </Link>
          </div>
        )}

        {selected && (
          <RestroomSheet
            restroom={selected}
            onClose={() => setSelected(null)}
            onVote={handleVote}
          />
        )}
      </main>

      <DesktopNotice />
    </>
  );
}
