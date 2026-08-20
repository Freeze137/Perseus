"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  motionLevelOf,
  transitionFor,
  SPRING,
  TIERS,
  TIER_ORDER,
  type PerformanceTier,
} from "./performance-tiers";

type Props = {
  tier: PerformanceTier;
  onTierChange: (tier: PerformanceTier) => void;
};

/**
 * The performance chooser.
 *
 * Deliberately the same control as the keyboard chooser above it — one
 * segmented row, one line of consequence underneath. Two pickers in one dialog
 * that behave differently is the kind of inconsistency a settings screen is
 * supposed to be free of, and this one is the second thing anybody arriving
 * here is looking for.
 *
 * The note is the whole point. Every level of this setting takes something
 * away, so each one has to say what it takes — and, just as importantly, what
 * it does not: no level of this changes a word of the text, a figure in the
 * metrics, or where a run lands on the board.
 */
export function PerformancePanel({ tier, onTierChange }: Props) {
  const reduced = useReducedMotion();
  const level = motionLevelOf(tier, reduced ?? false);
  const info = TIERS[tier];

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="label mb-3">Desempenho</legend>

      <div className="flex rounded-full bg-void/60 p-1">
        {TIER_ORDER.map((value) => {
          const active = value === tier;
          return (
            <label
              key={value}
              className="relative flex-1 cursor-pointer select-none"
            >
              <input
                type="radio"
                name="performance-tier"
                className="peer sr-only"
                value={value}
                checked={active}
                onChange={() => onTierChange(value)}
              />
              {active ? (
                <motion.span
                  aria-hidden="true"
                  // Shares no layoutId with the keyboard pill: two independent
                  // controls, two independent objects.
                  layoutId={level === "spring" ? "performance-pill" : undefined}
                  transition={transitionFor(level, SPRING.snap)}
                  className="absolute inset-0 rounded-full bg-slate"
                />
              ) : null}
              <span
                data-active={active}
                className="relative block rounded-full px-3 py-1.5 text-center text-sm font-medium text-ash transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald data-[active=true]:text-bone"
              >
                {TIERS[value].label}
              </span>
            </label>
          );
        })}
      </div>

      {/* Three lines reserved, so the longest note cannot shove the rest of the
          dialog down when it arrives. */}
      <div className="min-h-[4.3125rem]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={tier}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transitionFor(level, { duration: 0.12 })}
            className="text-sm leading-relaxed text-ash"
          >
            {info.note}
          </motion.p>
        </AnimatePresence>
      </div>

      {reduced ? (
        <p className="text-sm leading-relaxed text-ash">
          Seu sistema pede movimento reduzido, então nada se move aqui em
          nenhum dos três — a escolha acima segue valendo para o campo estelar.
        </p>
      ) : null}
    </fieldset>
  );
}
