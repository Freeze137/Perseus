import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase do browser, ou null quando o sync não está configurado.
 *
 * Null é estado previsto, não falha. Isto é um treinador de digitação antes de
 * ser uma conta: sem credencial no ambiente ele roda igual — local, offline,
 * sem oferecer login. Todo mundo que chama aqui tem que tratar o null em vez
 * de supor que o cliente existe.
 *
 * Só a chave anon chega neste arquivo. Ela é pública por desenho e toda linha
 * que ela alcança está cercada pelas políticas em supabase/migrations. A chave
 * de service role mora na API e seria a entrega do banco inteiro se um dia fosse
 * colada em qualquer coisa com prefixo NEXT_PUBLIC_.
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
