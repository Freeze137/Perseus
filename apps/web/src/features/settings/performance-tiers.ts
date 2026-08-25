import type { Transition } from "motion/react";
import { INSTANT, SPRING } from "@/lib/springs";

/**
 * Quanto a interface pode gastar pra parecer viva.
 *
 * Três níveis em vez de um interruptor, porque as máquinas que sofrem não são
 * um tipo só de máquina. Notebook mais velho costuma ter CPU de sobra pra
 * interface e uma GPU integrada que engasga num canvas de tela cheia com blur;
 * tablet barato é curto nos dois. Um interruptor só faria a primeira máquina
 * entregar o campo de estrelas inteiro quando largar o brilho bastava.
 *
 * **O que um nível nunca muda: o texto, o corpus, as métricas, a verificação,
 * ou uma palavra que seja na tela.** Tudo aqui é o preço da apresentação, nunca
 * a substância. Corrida digitada no 'minimal' é a mesma corrida, pontuada do
 * mesmo jeito, valendo o mesmo no mesmo ranking — que é o único arranjo em que
 * alguém numa máquina lenta está de fato competindo, em vez de estar recebendo
 * calado um produto diferente.
 */
export type PerformanceTier = "full" | "light" | "minimal";

/** What the interface is allowed to animate with. */
export type MotionLevel =
  /** Springs, shared-layout travel between positions, the lot. */
  | "spring"
  /** Short tweens on transform and opacity only. Nothing measures the layout. */
  | "brief"
  /** Nothing moves. Cross-fades survive, because fading is not motion. */
  | "none";

/** What the star field is allowed to draw. */
export type FieldLevel =
  /** Every shape, the standing glow, and the display's own pixel ratio. */
  | "rich"
  /** The same composition without the blur, at 1x, with fewer shapes. */
  | "plain"
  /** No canvas at all. */
  | "off";

export type TierInfo = {
  label: string;
  /** What this level costs and buys, in the user's terms. */
  note: string;
  motion: MotionLevel;
  field: FieldLevel;
};

export const TIERS: Record<PerformanceTier, TierInfo> = {
  full: {
    label: "Completo",
    note: "Campo estelar com brilho, painéis com física. Para máquina que dá conta.",
    motion: "spring",
    field: "rich",
  },
  light: {
    label: "Leve",
    note: "O campo perde o brilho e metade das formas; os painéis passam a deslizar sem física. Foi o brilho que saiu, não o conteúdo.",
    motion: "brief",
    field: "plain",
  },
  minimal: {
    label: "Mínimo",
    note: "Sem canvas e sem movimento. Mesmo texto, mesmas métricas, mesmo ranking.",
    motion: "none",
    field: "off",
  },
};

export const TIER_ORDER = ["full", "light", "minimal"] as const;

/**
 * Resolve o que de fato pode se mover, dado o nível escolhido e a preferência
 * de sistema de quem está lendo.
 *
 * `prefers-reduced-motion` ganha do nível numa direção só: pode calar movimento
 * que o nível permite, nunca restaurar movimento que o nível entregou. Os dois
 * respondem perguntas diferentes — uma é "esta máquina aguenta", a outra é
 * "este movimento me deixa enjoado" — e só a segunda tem direito de passar por
 * cima de uma escolha deliberada.
 */
export function motionLevelOf(
  tier: PerformanceTier,
  reduced: boolean,
): MotionLevel {
  if (reduced) return "none";
  return TIERS[tier].motion;
}

export function fieldLevelOf(tier: PerformanceTier): FieldLevel {
  return TIERS[tier].field;
}

/**
 * A transição pra entregar a um componente `motion`, dado o nível.
 *
 * 'brief' é tween e não mola mais lenta, de propósito. Mola é integração por
 * frame; tween é consulta ao longo de uma curva. Na máquina pra qual este nível
 * existe, a diferença não é a duração, é a aritmética.
 */
export function transitionFor(
  level: MotionLevel,
  spring: Transition,
): Transition {
  if (level === "none") return INSTANT;
  if (level === "brief") return BRIEF;
  return spring;
}

/** One curve for every 'brief' transition, so the level reads as one decision. */
export const BRIEF = {
  duration: 0.16,
  ease: [0.2, 0.8, 0.2, 1],
} as const satisfies Transition;

/** Re-exported so callers need one import to animate at the right level. */
export { SPRING, INSTANT };
