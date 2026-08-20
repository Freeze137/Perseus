"use client";

import { INVITE_CODE_LENGTH } from "@perseus/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/features/settings/use-settings";
import { ApiError, createMatch } from "@/lib/api";
import { describeConfig } from "./duel-copy";
import { MatchHistoryPanel } from "./match-history-panel";
import { rememberSeat } from "./match-storage";

/**
 * Opening a duel, or walking into one.
 *
 * The room inherits whatever the trainer is currently set to. That is the whole
 * configuration step: the settings on screen are the settings somebody just
 * chose to practise against, and asking them to choose again — in a second
 * form, for the same run — would be a worse version of a decision they have
 * already made. The one thing this asks for is the name, because a duel is the
 * only place in the product where somebody else reads it.
 */
export function NewDuelPanel() {
  const router = useRouter();
  const { language, kind, syntax, length, keyboardLayout } = useSettings();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const config = {
    language,
    kind,
    length,
    syntax: kind === "code" ? syntax : null,
    keyboardLayout,
  };

  const open = (event: FormEvent) => {
    event.preventDefault();
    const chosen = name.trim();
    if (!chosen || opening) return;

    setOpening(true);
    setProblem(null);
    createMatch({ displayName: chosen, ...config })
      .then((credentials) => {
        rememberSeat(credentials.match.inviteCode, {
          matchId: credentials.match.id,
          slot: credentials.slot,
          token: credentials.token,
        });
        router.push(`/duelo/${credentials.match.inviteCode}`);
      })
      .catch((error: unknown) => {
        setProblem(
          error instanceof ApiError
            ? error.message
            : "não foi possível abrir a sala",
        );
        setOpening(false);
      });
  };

  const enter = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== INVITE_CODE_LENGTH) return;
    // The invite screen asks for the name: whoever is joining has not been
    // asked yet, and asking here would mean asking twice on a bad code.
    router.push(`/duelo/${trimmed}`);
  };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={open} className="flex flex-col gap-2">
        <label htmlFor="duel-host-name" className="label">
          Abrir uma sala
        </label>
        <div className="flex gap-2">
          <input
            id="duel-host-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            autoComplete="off"
            placeholder="seu nome nesta partida"
            className="h-9 min-w-0 flex-1 rounded-sm border border-slate bg-void px-3 text-sm text-bone placeholder:text-slate"
          />
          <Button
            type="submit"
            variant="edge"
            size="sm"
            disabled={opening || name.trim().length === 0}
          >
            {opening ? "Abrindo…" : "Criar"}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-ash">
          {describeConfig({
            ...config,
            seed: "",
            durationMs: null,
          })}
          {" — o mesmo texto para os dois, sorteado pelo servidor."}
        </p>
      </form>

      {problem ? (
        <p className="text-sm leading-relaxed text-rust">{problem}</p>
      ) : null}

      <div className="rule" />

      <form onSubmit={enter} className="flex flex-col gap-2">
        <label htmlFor="duel-code" className="label">
          Entrar com um código
        </label>
        <div className="flex gap-2">
          <input
            id="duel-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={INVITE_CODE_LENGTH}
            autoComplete="off"
            spellCheck={false}
            placeholder="ABC234"
            className="h-9 min-w-0 flex-1 rounded-sm border border-slate bg-void px-3 font-mono text-sm tracking-[0.3em] text-bone placeholder:text-slate placeholder:tracking-normal"
          />
          <Button
            type="submit"
            variant="quiet"
            size="sm"
            disabled={code.trim().length !== INVITE_CODE_LENGTH}
          >
            Entrar
          </Button>
        </div>
      </form>

      <div className="rule" />

      <section className="flex flex-col gap-3">
        <h3 className="label">Partidas anteriores</h3>
        <MatchHistoryPanel />
      </section>
    </div>
  );
}
