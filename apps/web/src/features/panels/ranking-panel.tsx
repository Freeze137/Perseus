"use client";

import {
  TIERS,
  type Language,
  type LeaderboardEntry,
  type SyntaxChoice,
  type TextKind,
} from "@perseus/contracts";
import { useEffect, useState } from "react";
import { FallLoader } from "@/components/ui/fall-loader";
import { Modal } from "@/components/ui/modal";
import { PatenteMark } from "@/features/identity/patente-mark";
import { PatenteRing } from "@/features/identity/patente-ring";
import { useIdentity } from "@/features/identity/use-identity";
import { syntaxLabel } from "@/features/settings/syntax-options";
import { readLeaderboard } from "@/lib/api";

type Props = {
  kind: TextKind;
  language: Language;
  syntax: SyntaxChoice;
};

type Board =
  | { status: "loading" }
  | { status: "off" }
  | { status: "ready"; entries: LeaderboardEntry[] };

/**
 * Os recortes de tempo do board.
 *
 * Existe porque board eterno é board onde ninguém novo aparece: depois de um
 * ano, as dez primeiras posições pertencem a quem estava lá no começo, e a
 * lista deixa de responder a pergunta que alguém abre a gaveta pra fazer. Os
 * três juntos deixam a mesma tela responder "quem está rápido agora" e "quem já
 * foi o mais rápido".
 */
const WINDOWS = [
  { value: null, label: "Sempre" },
  { value: 7, label: "7 dias" },
  { value: 1, label: "Hoje" },
] as const;

/**
 * O ranking do que a pessoa estiver configurada agora.
 *
 * Segue as configurações em vez de oferecer filtros próprios: a pergunta que
 * alguém abre este painel pra fazer é "como eu vou *nisto*", e um painel que
 * responde sobre um modo diferente do que está na tela é um painel que precisa
 * ser reconfigurado antes de poder ser lido.
 */
export function RankingPanel({ kind, language, syntax }: Props) {
  const { identity } = useIdentity();
  const [windowDays, setWindowDays] = useState<number | null>(null);
  const [showing, setShowing] = useState(false);

  /**
   * As respostas são guardadas junto da pergunta que respondem.
   *
   * Trocar de modo tem que mostrar "carregando" de novo, mas escrever esse
   * estado a partir do efeito daria um render, um efeito e um segundo render a
   * cada mudança. Chavear a resposta guardada em vez disso faz o "está velha"
   * ser coisa que o render enxerga sozinho: um ranking cuja chave não bate mais
   * simplesmente não é resposta pra pergunta que está na tela.
   */
  const queryKey = `${kind}|${language}|${kind === "code" ? syntax : ""}|${windowDays}`;
  const [answer, setAnswer] = useState<{ key: string; board: Board } | null>(
    null,
  );

  useEffect(() => {
    let alive = true;

    readLeaderboard({
      kind,
      language,
      syntax: kind === "code" ? syntax : null,
      windowDays,
      limit: 20,
    })
      .then((response) => {
        if (!alive) return;
        // O servidor diz se está respondendo com um ranking ou com uma queda.
        // Lista vazia significava as duas coisas, e "seja o primeiro a
        // ranquear" é coisa estranha de dizer pra quem está com o banco fora.
        setAnswer({
          key: queryKey,
          board:
            response.status === "ok"
              ? { status: "ready", entries: response.entries }
              : { status: "off" },
        });
      })
      .catch(() => {
        if (alive) setAnswer({ key: queryKey, board: { status: "off" } });
      });

    return () => {
      alive = false;
    };
  }, [queryKey, kind, language, syntax, windowDays]);

  const board: Board =
    answer?.key === queryKey ? answer.board : { status: "loading" };
  const mine = identity?.player.username ?? null;

  return (
    <>
      <p className="text-sm leading-relaxed text-ash">
        {kind === "code"
          ? `Código · ${syntaxLabel(syntax)}`
          : `${LABELS[kind]} · ${language === "pt-BR" ? "português" : "inglês"}`}
        {" · precisão mínima de 75%"}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setWindowDays(option.value)}
            data-on={windowDays === option.value}
            className="rounded-full border border-slate px-3 py-1 text-xs text-ash transition-colors data-[on=true]:border-jade data-[on=true]:text-bone"
          >
            {option.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setShowing(true)}
          className="ml-auto text-xs text-ash underline decoration-slate underline-offset-4 hover:text-bone"
        >
          Mostrar patentes
        </button>
      </div>

      <div className="rule" />

      {board.status === "off" ? (
        <p className="text-sm leading-relaxed text-ash">
          Não deu para ler o ranking agora. O treino funciona normalmente sem
          ele, e seus resultados não se perdem por isso.
        </p>
      ) : null}

      {board.status === "loading" ? (
        <div className="flex justify-center py-2">
          {/* O ranking de código espera em zero e um; o de prosa, em
              estrelas. É o mesmo grid falando a língua do modo. */}
          <FallLoader
            label="Carregando o ranking"
            glyphs={kind === "code" ? "bits" : "stars"}
          />
        </div>
      ) : null}

      {board.status === "ready" && board.entries.length === 0 ? (
        <p className="text-sm leading-relaxed text-ash">
          Ninguém pontuou neste modo{windowDays === null ? "" : " nesta janela"}{" "}
          ainda. {mine ? "O primeiro lugar está aberto." : "Crie um nome para disputar."}
        </p>
      ) : null}

      {board.status === "ready" && board.entries.length > 0 ? (
        <ol className="flex flex-col gap-2 text-sm">
          {board.entries.map((entry) => (
            <li
              key={`${entry.rank}-${entry.username}`}
              data-mine={entry.username === mine}
              className="flex items-center justify-between gap-3 data-[mine=true]:text-mint"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-6 shrink-0 text-right font-mono text-xs text-ash">
                  {entry.rank}
                </span>
                {/* Emblema apagado é informação sobre quem anda sumido — e é
                    por isso que a linha fica no board mesmo assim: a
                    velocidade é fato, a patente é afirmação sobre hoje. */}
                {entry.tier ? (
                  <PatenteMark
                    tier={entry.tier}
                    size={20}
                    state={entry.dormant ? "dormant" : "earned"}
                  />
                ) : (
                  <span className="w-5 shrink-0" />
                )}
                {/* O nome da patente embaixo do nome da pessoa.

                    O emblema sozinho diz que existe uma escada e não diz qual
                    degrau — e o arco, que é o canal que não é cor, responde
                    isso pra quem já conhece a escada e não pra quem abriu o
                    board pela primeira vez. Escrito, responde pros dois. Vai
                    numa segunda linha porque "Gorgonea Tertia" não cabe ao
                    lado de um nome numa gaveta de 320px. */}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-bone">{entry.username}</span>
                  {entry.tier ? (
                    <span className="truncate font-mono text-xs text-ash">
                      {TIERS[entry.tier].star}
                      {entry.dormant ? " · dormente" : ""}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="display text-lg tabular-nums text-mint">
                  {Math.round(entry.wpm)}
                </span>
                <span className="font-mono text-xs text-ash">
                  {Math.round(entry.accuracy)}%
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <Modal
        open={showing}
        onClose={() => setShowing(false)}
        title="Patentes"
        heading="hero"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ash">
            Cinco degraus em prosa e cinco em código, nomeados pelas estrelas
            de Perseu na ordem em que elas esquentam — da vermelha Gorgonea
            Tertia à azul Atik. Todas aparecem, você tendo ou não: embaixo de
            cada uma está o ppm em que ela começa, e a sua diz que é sua.
          </p>

          <PatenteRing patentes={identity?.patentes ?? []} />

          <p className="text-xs leading-relaxed text-ash">
            A patente sai da média das suas cinco corridas válidas mais
            recentes, e aparece a partir da quinta. Texto curto entra pesando
            menos que texto médio ou longo: vinte segundos são uma amostra
            menor que um minuto, e a patente é o que você sustenta. Sete dias
            sem corrida a deixam dormente — nada é perdido, e uma corrida a
            reacende.
          </p>
        </div>
      </Modal>
    </>
  );
}

const LABELS: Record<TextKind, string> = {
  words: "Palavras",
  quote: "Frase",
  punctuation: "Pontuação",
  numbers: "Números",
  code: "Código",
};

/** Reexportado pra quem quiser o nome de uma patente sem importar o contrato. */
export { TIERS };
