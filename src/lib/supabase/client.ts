import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True once a Supabase project is wired up. Until then the app runs on the
 * built-in sample restrooms so every screen is usable with no cloud accounts.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

let cached: SupabaseClient | null = null;

/** Browser-side client, or null when Supabase isn't configured yet. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  cached ??= createBrowserClient(url, anonKey);
  return cached;
}
