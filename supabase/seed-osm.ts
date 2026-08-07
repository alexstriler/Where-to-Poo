/**
 * Seed the database with public toilets from OpenStreetMap, so the app isn't an
 * empty map on day one.
 *
 *   yarn seed:osm                  # New York City
 *   yarn seed:osm london           # a named preset
 *   yarn seed:osm 51.28,-0.51,51.69,0.33   # south,west,north,east
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env.local. That key bypasses Row Level
 * Security — it stays on your machine and never ships to the browser.
 *
 * LICENCE: OpenStreetMap data is ODbL. The app already credits OpenStreetMap on
 * the map, which covers normal use. Read https://www.openstreetmap.org/copyright
 * before redistributing the database itself.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- env -------------------------------------------------------------------

/** Minimal .env.local reader so this script has no extra dependencies. */
function loadEnv(path: string) {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || rawValue === undefined) continue;
    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    if (value && !process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Copy .env.example to .env.local and fill both in (Supabase -> Project Settings -> API).",
  );
  process.exit(1);
}

// --- areas -----------------------------------------------------------------

/** south, west, north, east */
type BBox = [number, number, number, number];

const PRESETS: Record<string, BBox> = {
  nyc: [40.68, -74.05, 40.88, -73.9],
  london: [51.44, -0.24, 51.57, 0.0],
  paris: [48.81, 2.24, 48.91, 2.42],
  tokyo: [35.62, 139.66, 35.72, 139.79],
  sf: [37.7, -122.52, 37.81, -122.38],
  chicago: [41.85, -87.7, 41.95, -87.58],
};

function resolveArea(arg: string | undefined): { label: string; bbox: BBox } {
  if (!arg) return { label: "nyc", bbox: PRESETS.nyc! };

  const preset = PRESETS[arg.toLowerCase()];
  if (preset) return { label: arg.toLowerCase(), bbox: preset };

  const parts = arg.split(",").map((n) => Number(n.trim()));
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    return { label: "custom", bbox: parts as BBox };
  }

  console.error(
    `Unknown area "${arg}". Use one of ${Object.keys(PRESETS).join(", ")}, ` +
      "or a bounding box as south,west,north,east.",
  );
  process.exit(1);
}

// --- Overpass --------------------------------------------------------------

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function fetchToilets(bbox: BBox): Promise<OverpassElement[]> {
  const [south, west, north, east] = bbox;
  const query = `
    [out:json][timeout:90];
    (
      node["amenity"="toilets"](${south},${west},${north},${east});
      way["amenity"="toilets"](${south},${west},${north},${east});
    );
    out center tags;`;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Overpass asks for an identifying User-Agent.
      "User-Agent": "where-to-poo-seed/1.0",
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(
      `Overpass returned ${response.status}. It rate-limits heavy use — wait a minute and retry.`,
    );
  }

  const json = (await response.json()) as { elements?: OverpassElement[] };
  return json.elements ?? [];
}

// --- mapping ---------------------------------------------------------------

/** OSM's `wheelchair`/`changing_table`/`fee` are yes/no/limited strings. */
function osmBool(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  if (["yes", "designated", "limited"].includes(value)) return true;
  if (["no"].includes(value)) return false;
  return null;
}

function toRow(element: OverpassElement) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (lat === undefined || lng === undefined) return null;

  const tags = element.tags ?? {};
  const fee = tags.fee;
  const isFree = fee === undefined ? true : fee === "no";

  return {
    // Namespaced so a node and a way with the same numeric id can't collide.
    osm_id: element.type === "way" ? -element.id : element.id,
    name: (tags.name ?? "Public toilets").slice(0, 80),
    kind: "public" as const,
    lat,
    lng,
    is_free: isFree,
    requires_purchase: false,
    is_accessible: osmBool(tags.wheelchair),
    has_changing_table: osmBool(tags.changing_table),
    hours: tags.opening_hours?.slice(0, 120) ?? null,
    address: tags["addr:street"]
      ? `${tags["addr:housenumber"] ?? ""} ${tags["addr:street"]}`.trim().slice(0, 200)
      : null,
    notes: "Imported from OpenStreetMap.",
    source: "osm" as const,
    created_by: null,
  };
}

// --- main ------------------------------------------------------------------

async function main() {
  const { label, bbox } = resolveArea(process.argv[2]);
  console.log(`Fetching public toilets for ${label} [${bbox.join(", ")}]…`);

  const elements = await fetchToilets(bbox);
  console.log(`Overpass returned ${elements.length} element(s).`);

  const rows = elements.map(toRow).filter((row) => row !== null);
  if (rows.length === 0) {
    console.log("Nothing to import.");
    return;
  }

  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false },
  });

  // Upsert on osm_id so re-running refreshes rather than duplicates.
  let imported = 0;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("restrooms")
      .upsert(chunk, { onConflict: "osm_id" });

    if (error) throw new Error(error.message);
    imported += chunk.length;
    console.log(`  ${imported}/${rows.length}`);
  }

  console.log(
    `\nDone — ${imported} restroom(s) in the database.\n` +
      "Data © OpenStreetMap contributors, licensed under the ODbL.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
