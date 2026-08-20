"use client";

import type { Session as AuthSession } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase, syncConfigured } from "@/lib/supabase";

export type AuthState = {
  /** Null while unknown, and null forever when sync is not configured. */
  session: AuthSession | null;
  /** False once we know one way or the other. */
  loading: boolean;
  configured: boolean;
};

/**
 * Whether anybody is signed in.
 *
 * Deliberately thin: sign-in is email-only, so there is no password to hold, no
 * token to refresh by hand and nothing here that would be a liability if it
 * leaked. Supabase owns the session; this only mirrors it into React.
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

/** Sends a one-time sign-in link. No password is ever created or stored. */
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
