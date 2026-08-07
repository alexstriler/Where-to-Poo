import type { Coords } from "./types";

/** Roughly midtown Manhattan — where the map opens when we have no fix yet. */
export const DEFAULT_CENTER: Coords = { lat: 40.7549, lng: -73.984 };
export const DEFAULT_ZOOM = 15;

/**
 * Straight-line distance in metres. We let Postgres do this for real searches,
 * but the client needs it too for sample data and for re-sorting after a move.
 */
export function haversineMetres(a: Coords, b: Coords): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "140 m" / "1.2 km" — short enough to sit in a list row. */
export function formatDistance(metres: number | null): string {
  if (metres === null || !Number.isFinite(metres)) return "";
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Walking time at a brisk-but-realistic 80 m/min. Travellers care about
 * "how long until I get there", not metres.
 */
export function formatWalkTime(metres: number | null): string {
  if (metres === null || !Number.isFinite(metres)) return "";
  const minutes = Math.max(1, Math.round(metres / 80));
  if (minutes > 60) return "";
  return `${minutes} min walk`;
}

/**
 * Deep link into the phone's own maps app for turn-by-turn directions.
 * iOS gets Apple Maps, everything else gets Google Maps.
 */
export function directionsUrl(dest: Coords, label?: string): string {
  const isApple =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);

  if (isApple) {
    const q = label ? `&q=${encodeURIComponent(label)}` : "";
    return `https://maps.apple.com/?daddr=${dest.lat},${dest.lng}${q}&dirflg=w`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=walking`;
}

/**
 * Metres from the map centre to the edge of the viewport, so we only ask the
 * database for restrooms that could actually be on screen.
 */
export function radiusForBounds(
  center: Coords,
  northEast: Coords,
  min = 400,
  max = 20_000,
): number {
  const corner = haversineMetres(center, northEast);
  return Math.min(max, Math.max(min, Math.round(corner)));
}
