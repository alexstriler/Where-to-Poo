/**
 * Shared shapes for the whole app. These mirror the columns returned by the
 * `nearby_restrooms` RPC in supabase/schema.sql — if you change one, change both.
 */

export const RESTROOM_KINDS = [
  "public",
  "park",
  "transit",
  "cafe",
  "restaurant",
  "store",
  "gas_station",
  "mall",
  "library",
  "other",
] as const;

export type RestroomKind = (typeof RESTROOM_KINDS)[number];

/** Human labels for the kind picker and the detail sheet. */
export const KIND_LABELS: Record<RestroomKind, string> = {
  public: "Public restroom",
  park: "Park",
  transit: "Transit station",
  cafe: "Cafe",
  restaurant: "Restaurant",
  store: "Store",
  gas_station: "Gas station",
  mall: "Mall",
  library: "Library",
  other: "Other",
};

/**
 * How much we trust that this restroom is really there, computed server-side in
 * `nearby_restrooms` from vote score plus recency. See schema.sql.
 */
export type Confidence = "confirmed" | "unverified" | "likely_gone";

export interface Restroom {
  id: string;
  name: string;
  kind: RestroomKind;
  lat: number;
  lng: number;
  isFree: boolean;
  requiresPurchase: boolean;
  isAccessible: boolean | null;
  hasChangingTable: boolean | null;
  hours: string | null;
  address: string | null;
  notes: string | null;
  source: "user" | "osm";
  createdAt: string;
  /** Metres from the search origin. Absent when we didn't search from a point. */
  distanceM: number | null;
  up: number;
  down: number;
  score: number;
  confidence: Confidence;
}

/** The payload the add-a-restroom form produces. */
export interface NewRestroom {
  name: string;
  kind: RestroomKind;
  lat: number;
  lng: number;
  isFree: boolean;
  requiresPurchase: boolean;
  isAccessible: boolean | null;
  hasChangingTable: boolean | null;
  hours: string | null;
  address: string | null;
  notes: string | null;
}

/** A user's vote on whether a restroom is still there. */
export type VoteValue = 1 | -1;

export interface Coords {
  lat: number;
  lng: number;
}
