"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Coords } from "./types";

export type GeoStatus =
  | "idle"
  | "locating"
  | "ready"
  | "denied"
  | "unavailable"
  | "insecure";

export interface GeoState {
  status: GeoStatus;
  coords: Coords | null;
  /** Reported accuracy radius in metres, drawn as a circle on the map. */
  accuracyM: number | null;
  message: string | null;
}

/**
 * Browser geolocation with the failure modes spelled out.
 *
 * The one that trips people up: geolocation only works in a "secure context",
 * meaning HTTPS or localhost. Opening the dev server from your phone over a LAN
 * IP (http://192.168.x.x:3000) fails with no useful error, so we detect that
 * case up front and say so instead of silently spinning.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({
    status: "idle",
    coords: null,
    accuracyM: null,
    message: null,
  });

  const watchId = useRef<number | null>(null);

  const locate = useCallback(() => {
    if (typeof window === "undefined") return;

    if (!window.isSecureContext) {
      setState({
        status: "insecure",
        coords: null,
        accuracyM: null,
        message:
          "Location needs a secure connection. Open this over https:// or on localhost.",
      });
      return;
    }

    if (!("geolocation" in navigator)) {
      setState({
        status: "unavailable",
        coords: null,
        accuracyM: null,
        message: "This browser can't share your location.",
      });
      return;
    }

    setState((prev) => ({ ...prev, status: "locating", message: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          status: "ready",
          coords: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          accuracyM: position.coords.accuracy,
          message: null,
        });
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setState({
          status: denied ? "denied" : "unavailable",
          coords: null,
          accuracyM: null,
          message: denied
            ? "Location is blocked. You can still search by moving the map."
            : "Couldn't get a location fix. Try again, or move the map yourself.",
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, []);

  // Clean up any active watch on unmount.
  useEffect(() => {
    return () => {
      if (watchId.current !== null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  return { ...state, locate };
}
