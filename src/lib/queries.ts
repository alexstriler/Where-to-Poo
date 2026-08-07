"use client";

import { getSupabaseBrowserClient } from "./supabase/client";
import { haversineMetres } from "./geo";
import { SAMPLE_RESTROOMS } from "./sample-data";
import type {
  Confidence,
  Coords,
  NewRestroom,
  Restroom,
  RestroomKind,
  VoteValue,
} from "./types";

/** The raw row shape returned by the `nearby_restrooms` RPC. */
interface NearbyRow {
  id: string;
  name: string;
  kind: RestroomKind;
  lat: number;
  lng: number;
  is_free: boolean;
  requires_purchase: boolean;
  is_accessible: boolean | null;
  has_changing_table: boolean | null;
  hours: string | null;
  address: string | null;
  notes: string | null;
  source: "user" | "osm";
  created_at: string;
  distance_m: number | null;
  up: number;
  down: number;
  score: number;
  confidence: Confidence;
}

function rowToRestroom(row: NearbyRow): Restroom {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    lat: row.lat,
    lng: row.lng,
    isFree: row.is_free,
    requiresPurchase: row.requires_purchase,
    isAccessible: row.is_accessible,
    hasChangingTable: row.has_changing_table,
    hours: row.hours,
    address: row.address,
    notes: row.notes,
    source: row.source,
    createdAt: row.created_at,
    distanceM: row.distance_m,
    up: row.up,
    down: row.down,
    score: row.score,
    confidence: row.confidence,
  };
}

/** Sample-data stand-in for the RPC, so the map works before Supabase exists. */
function nearbySample(origin: Coords, radiusM: number): Restroom[] {
  return SAMPLE_RESTROOMS.map((restroom) => ({
    ...restroom,
    distanceM: haversineMetres(origin, { lat: restroom.lat, lng: restroom.lng }),
  }))
    .filter((restroom) => (restroom.distanceM ?? Infinity) <= radiusM)
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
}

/**
 * Restrooms near a point, nearest first. Distance filtering, sorting, and the
 * confidence rating all happen in Postgres in a single round trip.
 */
export async function fetchNearby(
  origin: Coords,
  radiusM: number,
  limit = 100,
): Promise<Restroom[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return nearbySample(origin, radiusM);

  const { data, error } = await supabase.rpc("nearby_restrooms", {
    in_lat: origin.lat,
    in_lng: origin.lng,
    in_radius_m: Math.round(radiusM),
    in_limit: limit,
  });

  if (error) throw new Error(error.message);
  return ((data ?? []) as NearbyRow[]).map(rowToRestroom);
}

/**
 * Add a restroom. Row Level Security requires `created_by` to match the signed-in
 * user, so this fails cleanly if the session has expired.
 */
export async function addRestroom(input: NewRestroom): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error(
      "Adding restrooms needs a Supabase project. See the README for setup.",
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You need to be signed in to add a restroom.");

  const { data, error } = await supabase
    .from("restrooms")
    .insert({
      name: input.name,
      kind: input.kind,
      lat: input.lat,
      lng: input.lng,
      is_free: input.isFree,
      requires_purchase: input.requiresPurchase,
      is_accessible: input.isAccessible,
      has_changing_table: input.hasChangingTable,
      hours: input.hours,
      address: input.address,
      notes: input.notes,
      source: "user",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/**
 * Record "still here" (+1) or "it's gone" (-1). The table has a unique
 * constraint on (restroom_id, user_id), so upserting lets someone change their
 * mind without ever stacking two votes.
 */
export async function castVote(
  restroomId: string,
  vote: VoteValue,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error(
      "Voting needs a Supabase project. See the README for setup.",
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You need to be signed in to vote.");

  const { error } = await supabase
    .from("restroom_votes")
    .upsert(
      { restroom_id: restroomId, user_id: user.id, vote },
      { onConflict: "restroom_id,user_id" },
    );

  if (error) throw new Error(error.message);
}

/** Restrooms the signed-in user added, newest first. Powers /me. */
export async function fetchMySubmissions(): Promise<Restroom[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("restrooms_with_scores")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as NearbyRow[]).map(rowToRestroom);
}
