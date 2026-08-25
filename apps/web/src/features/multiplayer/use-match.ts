"use client";

import { MatchEventSchema, type Match } from "@perseus/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, matchStreamUrl, readMatch } from "@/lib/api";

export type MatchLink = {
  match: Match | null;
  /** Qual jogador este browser é. Null até a sala responder. */
  slot: number | null;
  /** Se o stream de eventos está aberto agora. */
  connected: boolean;
  /** Preenchido quando a sala recusou ou já era. Terminal: retentar não ajuda. */
  error: string | null;
  /**
   * O relógio do servidor, até onde este browser consegue saber.
   *
   * Todo retrato carrega o `serverNow` do servidor, e a diferença contra o
   * relógio local fica guardada aqui. Está errada pelo tempo que a mensagem
   * levou pra chegar — dezenas de milissegundos nas conexões pra que isto
   * serve — e isso é aceito em vez de corrigido: a alternativa é uma estimativa
   * de ida e volta cujo erro tem o mesmo tamanho. O que se compra é o que
   * importa: dois browsers cujos relógios de sistema discordam em um minuto
   * ainda contam a mesma regressiva.
   */
  serverNow: () => number;
  /**
   * Aceita um retrato que quem chamou pegou em outro lugar.
   *
   * Existe um: a resposta ao envio de uma corrida terminada, que traz a sala
   * resolvida. Normalmente o stream entrega a mesma coisa um instante depois, e
   * isto é o que mantém a tela correta no caso em que ele não entrega — conexão
   * caída exatamente no momento em que o duelo acaba.
   */
  apply: (match: Match) => void;
};

/**
 * Segura um duelo: o estado da sala, sempre atual, e o cursor do outro jogador.
 *
 * O stream é server-sent events e não socket, pelos motivos do lado da API. O
 * que importa aqui é que ele é *só* uma vista. Nada que este hook recebe é
 * confiado com pontuação — progresso move uma barra, e o resultado chega como
 * retrato que o servidor escreveu depois de reproduzir as duas timelines.
 */
export function useMatch(
  matchId: string | null,
  token: string | null,
): MatchLink {
  const [match, setMatch] = useState<Match | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0);

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  const apply = useCallback((next: Match) => {
    offset.current = next.serverNow - Date.now();
    setMatch((current) =>
      // Os retratos são ordenados pelo relógio do próprio servidor, então um
      // mais velho chegando atrasado é descartado em vez de poder reabrir um
      // duelo terminado.
      current && current.serverNow > next.serverNow ? current : next,
    );
  }, []);

  useEffect(() => {
    if (!matchId || !token) return;

    let alive = true;
    const take = (next: Match) => {
      offset.current = next.serverNow - Date.now();
      setMatch(next);
    };

    // O stream abre com um retrato próprio, então isto não é estritamente
    // necessário — mas é a requisição que reporta sala morta ou token velho
    // como erro comum, onde o stream só falharia em abrir.
    readMatch(matchId, token)
      .then((seat) => {
        if (!alive) return;
        take(seat.match);
        setSlot(seat.slot);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setError(
          cause instanceof ApiError
            ? cause.message
            : "não foi possível entrar na sala",
        );
      });

    const source = new EventSource(matchStreamUrl(matchId, token));

    source.onopen = () => {
      if (alive) setConnected(true);
    };

    source.onmessage = (event: MessageEvent<string>) => {
      if (!alive) return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const parsed = MatchEventSchema.safeParse(payload);
      if (!parsed.success) return;

      if (parsed.data.type === "match") {
        take(parsed.data.match);
        // Duelo terminado ainda tem uma coisa a dizer: revanche. A sala segue
        // viva enquanto uma puder ser oferecida, e o voto chega por este mesmo
        // stream — fechar aqui era o que fazia o botão não fazer nada nas duas
        // telas. Só sala abandonada acabou de vez.
        if (parsed.data.match.state === "abandoned") {
          source.close();
          setConnected(false);
        }
        return;
      }

      // Um cursor andou. Remendado no lugar em vez de pedir retrato novo: isto
      // chega cinco vezes por segundo por jogador e muda um número.
      const { slot: moved, index, serverNow: at } = parsed.data;
      offset.current = at - Date.now();
      setMatch((current) =>
        current
          ? {
              ...current,
              players: current.players.map((player) =>
                player.slot === moved && index > player.progress
                  ? { ...player, progress: index }
                  : player,
              ),
            }
          : current,
      );
    };

    source.onerror = () => {
      if (alive) setConnected(false);
      // Sem retentativa manual: EventSource reconecta sozinho pra qualquer
      // coisa passageira, e pra sala que já era a reconexão leva 404 e para.
      // Reimplementar isso aqui só brigaria com ele.
    };

    return () => {
      alive = false;
      source.close();
    };
  }, [matchId, token]);

  return { match, slot, connected, error, serverNow, apply };
}

/**
 * Milissegundos que faltam pra um timestamp do servidor, recalculado num timer.
 *
 * Separado do desenho da regressiva pro número e a coisa que o desenha não
 * serem a mesma preocupação — e pra um componente que só quer saber se as
 * teclas destravaram não ter que re-renderizar a 10 Hz pra descobrir.
 */
export function useTimeLeft(
  target: number | null,
  serverNow: () => number,
  tickMs = 100,
): number {
  const [state, setState] = useState(() => ({
    target,
    left: remaining(target, serverNow),
  }));

  // Ajustar estado durante o render é o jeito suportado de zerar numa entrada
  // que mudou — o mesmo movimento que o `useTypingSession` faz. Um efeito
  // mostraria a regressiva antiga por um frame, o que num relógio de cinco
  // segundos dá pra ver.
  if (state.target !== target) {
    setState({ target, left: remaining(target, serverNow) });
  }
  const left =
    state.target === target ? state.left : remaining(target, serverNow);

  useEffect(() => {
    if (target === null) return;
    const id = window.setInterval(
      () => setState({ target, left: remaining(target, serverNow) }),
      tickMs,
    );
    return () => window.clearInterval(id);
  }, [target, serverNow, tickMs]);

  return left;
}

function remaining(target: number | null, serverNow: () => number): number {
  return target === null ? 0 : Math.max(0, target - serverNow());
}
