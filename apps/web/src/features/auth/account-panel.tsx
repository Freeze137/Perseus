"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { signInWithEmail, signOut, useAuth } from "./use-auth";

type Status = "idle" | "sending" | "sent" | "failed";

/**
 * Sign-in, such as it is.
 *
 * Email only, no password. There is nothing here worth stealing — a typing
 * speed and a display name — so asking somebody to invent and store a password
 * for it would be collecting a liability in exchange for nothing. A one-time
 * link is also the only flow with no reset flow behind it.
 */
export function AccountPanel() {
  const { session, loading, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  if (!configured) {
    return (
      <p className="text-sm leading-relaxed text-ash">
        Conta e ranking online não estão configurados neste ambiente. Tudo o
        mais funciona: o treino nunca dependeu de estar conectado.
      </p>
    );
  }

  if (loading) return <p className="text-sm text-ash">…</p>;

  if (session) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-ash">
          Conectado como{" "}
          <span className="text-bone">{session.user.email ?? session.user.id}</span>
        </p>
        <Button variant="quiet" size="sm" onClick={() => void signOut()}>
          Sair
        </Button>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.includes("@")) return;
    setStatus("sending");
    signInWithEmail(email)
      .then(() => setStatus("sent"))
      .catch(() => setStatus("failed"));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="perseus-email" className="label">
        Entrar para disputar o ranking
      </label>
      <div className="flex gap-2">
        <input
          id="perseus-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@exemplo.com"
          autoComplete="email"
          className="h-9 min-w-0 flex-1 rounded-sm border border-slate bg-void px-3 text-sm text-bone placeholder:text-slate"
        />
        <Button variant="edge" size="sm" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Enviando…" : "Enviar link"}
        </Button>
      </div>
      {status === "sent" ? (
        <p className="text-sm leading-relaxed text-mint">
          Link enviado. Abra o e-mail nesta mesma janela.
        </p>
      ) : null}
      {status === "failed" ? (
        <p className="text-sm leading-relaxed text-rust">
          Não deu para enviar agora. Tente de novo em um minuto.
        </p>
      ) : null}
    </form>
  );
}
