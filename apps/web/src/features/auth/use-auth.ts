"use client";

import type { Session as AuthSession } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase, syncConfigured } from "@/lib/supabase";

export type AuthState = {
  /** Null enquanto não se sabe, e null pra sempre quando não há sync configurado. */
  session: AuthSession | null;
  /** False assim que se sabe de um jeito ou de outro. */
  loading: boolean;
  configured: boolean;
};

/**
 * Se tem alguém logado.
 *
 * Fino de propósito: o login é só por e-mail, então não há senha pra guardar,
 * token pra renovar na mão, nem nada aqui que fosse passivo se vazasse. O dono
 * da sessão é o Supabase; isto só a espelha no React.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(syncConfigured);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, loading, configured: syncConfigured };
}

/** Manda um link de login de uso único. Nenhuma senha é criada ou guardada. */
export async function signInWithEmail(email: string): Promise<void> {
  if (!supabase) throw new Error("sync is not configured");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}
