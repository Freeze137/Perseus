import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase do browser, ou null quando o sync não está configurado.
 *
 * Null é estado previsto, não falha. Isto é um treinador de digitação antes de
 * ser uma conta: sem credencial no ambiente ele roda igual — local, offline,
 * sem oferecer login. Todo mundo que chama aqui tem que tratar o null em vez
 * de supor que o cliente existe.
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
