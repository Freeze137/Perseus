"use client";

import { TIERS, TIER_ORDER, type RankFamily } from "@perseus/contracts";
import { motion } from "motion/react";
import { transitionFor } from "@/features/settings/performance-tiers";
import { useMotionLevel } from "@/features/settings/use-motion-level";
import { PatenteMark } from "./patente-mark";
import { useIdentity } from "./use-identity";

/** A barra enche vindo da esquerda, como a pista do duelo. */
const FILL = { duration: 0.6, ease: [0.16, 1, 0.3, 1] } as const;

type Props = {
  /** A família do que acabou de ser digitado. Prosa e código não se misturam. */
  family: RankFamily;
};

/**
 * Onde você está na escada, e quanto falta pro próximo degrau.
 *
 * Nasceu do espaço vazio ao lado do placar de um duelo, mas a razão de existir
 * não é preencher: a patente é a única medida deste produto que não é de uma
 * corrida só — é a média das cinco últimas —, e até aqui ela aparecia como um
 * nome e nada mais. "Miram" não responde quanto falta pra Mirfak; um número e
 * uma barra respondem.
 *
 * O que a barra mede é a média, e não a corrida que acabou de acontecer. Uma
 * corrida muito acima do próximo degrau move a barra cerca de um quinto do
 * caminho, que é exatamente o que ela vale — e é essa a diferença entre uma
 * patente e um recorde pessoal.
 */
export function PatenteProgress({ family }: Props) {
  const { passport, identity } = useIdentity();
  const level = useMotionLevel();
  const still = level === "none";

  // Sem identidade não há escada a mostrar, e dizê-lo aqui é mais útil que um
  // espaço vazio: a corrida foi pontuada, ela só não classificou ninguém.
  if (!passport) {
    return (
      <p className="text-sm leading-relaxed text-ash">
        Sem identidade, esta corrida foi pontuada e não entrou no ranking. A
        identidade é um nome e seis palavras para guardar.
      </p>
    );
  }

  const patente = identity?.patentes.find((one) => one.family === family);
  const label = family === "code" ? "código" : "prosa";

  if (!patente) {
    return (
      <div className="flex flex-col gap-2">
        <p className="label">Patente de {label}</p>
        <p className="text-sm leading-relaxed text-ash">
          Ela aparece na sua quinta corrida válida de {label}, e é a média das
          cinco mais recentes.
        </p>
      </div>
    );
  }

  const step = TIER_ORDER.indexOf(patente.tier);
  const next = TIER_ORDER[step + 1];
  const floor = TIERS[patente.tier].from[family];
  const ceiling = next ? TIERS[next].from[family] : null;
  const missing = ceiling === null ? 0 : Math.max(0, ceiling - patente.wpm);
  /** Onde a média está entre o degrau de baixo e o de cima. */
  const share =
    ceiling === null
      ? 1
      : Math.min(1, Math.max(0, (patente.wpm - floor) / (ceiling - floor)));

  return (
    <div className="flex flex-col gap-3">
      <p className="label">Patente de {label}</p>

      <div className="flex items-center gap-3">
        <PatenteMark
          tier={patente.tier}
          size={52}
          state={patente.dormant ? "dormant" : "earned"}
        />
        <span className="flex min-w-0 flex-col">
          <span className="display text-xl text-bone">
            {TIERS[patente.tier].star}
          </span>
          <span className="font-mono text-xs tabular-nums text-ash">
            média de {Math.round(patente.wpm)} ppm
          </span>
        </span>
      </div>

      {next && ceiling !== null ? (
        <div className="flex flex-col gap-2">
          {/* Os dois extremos escritos, porque a barra sozinha diz proporção e
              não diz de quanto pra quanto. */}
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-xs tabular-nums text-ash">
              {floor} ppm
            </span>
            <span className="font-mono text-xs tabular-nums text-ash">
              {ceiling} ppm
            </span>
          </div>

          <div
            role="progressbar"
            aria-valuemin={floor}
            aria-valuemax={ceiling}
            aria-valuenow={Math.round(patente.wpm)}
            aria-label={`Progresso até ${TIERS[next].star}`}
            className="h-1.5 overflow-hidden rounded-full bg-slate"
          >
            <motion.div
              className="h-full origin-left rounded-full bg-mint"
              initial={still ? { scaleX: share } : { scaleX: 0 }}
              animate={{ scaleX: share }}
              transition={transitionFor(level, FILL)}
            />
          </div>

          <p className="text-sm leading-relaxed text-ash">
            {missing <= 0
              ? `A média já alcança ${TIERS[next].star}; a próxima corrida válida confirma o degrau.`
              : `Faltam ${Math.ceil(missing)} ppm de média para ${TIERS[next].star}.`}
          </p>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-ash">
          {TIERS[patente.tier].star} é o degrau mais quente da escada. Não há
          próximo — há manter.
        </p>
      )}

      {patente.dormant ? (
        <p className="text-sm leading-relaxed text-ash">
          Dormente: sete dias sem corrida. Nada foi perdido, e uma corrida a
          reacende.
        </p>
      ) : null}
    </div>
  );
}
