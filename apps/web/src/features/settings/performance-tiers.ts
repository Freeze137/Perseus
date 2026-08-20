import type { Transition } from "motion/react";
import { INSTANT, SPRING } from "@/lib/springs";

/**
 * How much the interface is allowed to spend on looking alive.
 *
 * Three levels rather than a switch, because the machines that struggle are not
 * one kind of machine. An older laptop usually has plenty of CPU for the
 * interface and an integrated GPU that chokes on a full-screen canvas with
 * blur; a cheap tablet is short of both. One toggle would have made the first
 * machine give up the star field entirely when dropping the glow was enough.
 *
 * **What a level never changes: the text, the corpus, the metrics, the
 * verification, or a single word on screen.** Everything here is the price of
 * the presentation, never the substance. A run typed at 'minimal' is the same
 * run, scored the same way, worth the same on the same leaderboard — which is
 * the only arrangement under which somebody on a slow machine is competing at
 * all rather than being quietly given a different product.
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
 * Resolves what may actually move, given the chosen level and the reader's own
 * system preference.
 *
 * `prefers-reduced-motion` wins over the tier in one direction only: it can
 * silence motion that the tier allows, never restore motion the tier gave up.
 * The two are answering different questions — one is "can this machine afford
 * it", the other is "does this movement make me ill" — and only the second one
 * is entitled to override a deliberate choice.
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
 * The transition to hand a `motion` component, given the level.
 *
 * 'brief' is a tween rather than a slower spring on purpose. A spring is a
 * per-frame integration; a tween is a lookup along a curve. On the machine this
 * level exists for, the difference is not the duration, it is the arithmetic.
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
