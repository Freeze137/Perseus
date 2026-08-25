"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useSyncExternalStore } from "react";
import { DuelJoin } from "@/features/multiplayer/duel-join";
import { DuelLobby } from "@/features/multiplayer/duel-lobby";
import { DuelScreen } from "@/features/multiplayer/duel-screen";
import { SITE_NAME } from "@/lib/site";
import {
  forgetSeat,
  noSeat,
  rememberMatch,
  rememberSeat,
  seatFor,
  subscribeDuels,
} from "@/features/multiplayer/match-storage";
import { useMatch } from "@/features/multiplayer/use-match";
import { leaveMatch } from "@/lib/api";

/**
 * Um duelo, num código de convite.
 *
 * O código é o endereço inteiro: um link pra colar numa conversa, abrir no
 * celular e ler em voz alta. O que separa os dois jogadores de quem mais estiver
 * segurando é a cadeira no armazenamento local — o token que o servidor emitiu
 * quando entraram — que é também o que deixa uma aba recarregada voltar pra um
 * duelo já rodando.
 *
 * Visitante sem cadeira recebe a tela de convite. Visitante cuja cadeira aponta
 * pra uma sala que não existe mais recebe a mesma coisa, porque token morto é
 * indistinguível de nunca ter tido um, e dizer pra alguém que o token dele
 * venceu não é uma instrução que ele possa seguir.
 */
export default function DuelPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = use(params);
  const code = raw.toUpperCase();
  const router = useRouter();

  /**
   * A cadeira sai direto do armazenamento local, que é estado fora do React —
   * então é lida do jeito que estado de fora deve ser lido. O retrato do
   * servidor é "sem cadeira": nada renderizado no servidor tem como saber, e a
   * tela de convite é a coisa certa a mostrar enquanto isso for verdade.
   */
  const seat = useSyncExternalStore(
    subscribeDuels,
    () => seatFor(code),
    noSeat,
  );

  const link = useMatch(seat?.matchId ?? null, seat?.token ?? null);
  const { match, error, apply } = link;

  // Duelo que vale lembrar é o que foi jogado até o fim. O que é lembrado é a
  // rodada, não a sala: revanche joga outro duelo na mesma sala, e os dois
  // pertencem ao histórico como entradas próprias.
  useEffect(() => {
    if (match?.state === "done") rememberMatch(match.roundId);
  }, [match?.state, match?.roundId]);

  // Cadeira cuja sala já era é pior que nenhuma cadeira: segura a tela num erro
  // sobre o qual ninguém pode agir, enquanto largar oferece o formulário de
  // convite.
  useEffect(() => {
    if (!error || !seat) return;
    forgetSeat(code);
  }, [error, seat, code]);

  /**
   * Encerra o duelo e vai embora.
   *
   * A cadeira é largada seja qual for a resposta do servidor. Requisição que
   * falha aqui quer dizer que a sala já tinha ido ou que a rede caiu — nos dois
   * casos a coisa a fazer é sair, e guardar uma cadeira morta só mandaria esta
   * aba de volta pra uma sala que não existe.
   */
  const leave = useCallback(() => {
    if (!seat) return;
    const { matchId, token } = seat;
    forgetSeat(code);
    router.push("/");
    void leaveMatch(matchId, token).catch(() => undefined);
  }, [seat, code, router]);

  const joined = useCallback(
    (credentials: { match: { id: string }; slot: number; token: string }) => {
      rememberSeat(code, {
        matchId: credentials.match.id,
        slot: credentials.slot,
        token: credentials.token,
      });
    },
    [code],
  );

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="flex h-18 shrink-0 items-center justify-between px-6">
        <Link
          href="/"
          className="text-sm font-medium text-ash transition-colors hover:text-mint"
        >
          ← Treino
        </Link>
        <span className="display -mr-[0.3em] text-xl tracking-[0.3em] text-bone">
          {SITE_NAME}
        </span>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-8 px-6 pb-16">
        {!seat ? (
          <DuelJoin code={code} onJoined={joined} />
        ) : !match ? (
          <p className="text-center text-sm text-ash">Entrando na sala…</p>
        ) : match.state === "lobby" ? (
          <DuelLobby
            match={match}
            slot={seat.slot}
            token={seat.token}
            onLeave={leave}
          />
        ) : (
          <DuelScreen
            match={match}
            slot={seat.slot}
            token={seat.token}
            serverNow={link.serverNow}
            connected={link.connected}
            onMatch={apply}
            onLeave={leave}
          />
        )}
      </main>
    </div>
  );
}
