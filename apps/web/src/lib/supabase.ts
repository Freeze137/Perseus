import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The browser's Supabase client, or null when sync is not configured.
 *
 * Null is a supported state, not a failure. PERSEUSS is a typing trainer before
 * it is an account: with no credentials in the environment it runs exactly as
 * it always has — local, offline, no sign-in offered — and every caller here
 * has to handle that rather than assume a client exists.
 *
 * Only the anon key ever reaches this file. It is public by design and every
 * row it can touch is fenced by the policies in supabase/migrations. The
 * service-role key lives in the API and would be a full database handover if it
 * were ever pasted into anything prefixed NEXT_PUBLIC_.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const syncConfigured = supabase !== null;
