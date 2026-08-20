"use client";

import type { KeyboardLayout } from "@perseus/contracts";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { SPRING } from "@/lib/springs";
import { transitionFor } from "./performance-tiers";
import { useMotionLevel } from "./use-motion-level";
import {
  LAYOUTS,
  LAYOUT_OPTIONS,
  REACH_GROUPS,
  type KeyReach,
} from "./keyboard-layouts";

type Props = {
  layout: KeyboardLayout;
  onLayoutChange: (layout: KeyboardLayout) => void;
  /** How much of this run's bank the keyboard reaches. */
  share: { available: number; total: number };
  /** Offered when the keyboard is what is costing the typist sentences. */
  onUseEnglish: () => void;
};

/**
 * The keyboard chooser, drawn as a reach map rather than a dropdown.
 *
 * A `<select>` and two paragraphs was the honest minimum and it read like a
 * form: the one thing the typist actually wants to know — what this keyboard
 * costs my fingers — was prose they had to take on trust. Here the twelve
 * characters that matter are on screen, sorted by what they cost, and changing
 * the layout makes them travel between the groups.
 *
 * The movement is the argument. Switch from ABNT2 to US and the four accents
 * physically fall into "Fora de alcance", which is the same event that shrinks
 * the corpus underneath. Nobody has to be told twice.
 *
 * ---
 *
 * **Nothing in here resizes, and that is the whole trick.**
 *
 * The first version animated the group containers with `layout`. Motion
 * implements that as a scale transform, which stretches every glyph inside it
 * for the length of the animation — the keys and the labels visibly squashed on
 * the way to their new size. It also meant three containers reflowing while
 * twelve keys tried to fly between them.
 *
 * So the structure is fixed instead: all three groups always render, an empty
 * one says so rather than disappearing, and the key row is one line at every
 * layout (the widest group is eight caps ≈ 298px inside 432px of panel). The
 * panel's height is therefore identical for all three keyboards, no container
 * ever changes size, and the keys are free to move on transforms alone — which
 * is the only thing that animates cheaply and the only thing that cannot warp
 * a letterform.
 */
export function KeyboardPanel({
  layout,
  onLayoutChange,
  share,
  onUseEnglish,
}: Props) {
  const level = useMotionLevel();
  // Shared-layout travel is the one effect here that measures the DOM. At
  // 'brief' the keys still change groups, they just stop flying there — which
  // is exactly the trade this level exists to make.
  const travels = level === "spring";
  const info = LAYOUTS[layout];
  const narrowed = share.available < share.total;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="label mb-3">Teclado</legend>

      {/* Radios rather than buttons with aria-checked: the arrow-key roving
          within a group is the platform's job, and it gets it right. */}
      <div className="flex rounded-full bg-void/60 p-1">
        {LAYOUT_OPTIONS.map((option) => {
          const active = option.value === layout;
          return (
            <label
              key={option.value}
              className="relative flex-1 cursor-pointer select-none"
            >
              <input
                type="radio"
                name="keyboard-layout"
                className="peer sr-only"
                value={option.value}
                checked={active}
                onChange={() => onLayoutChange(option.value)}
              />
              {/* One pill, moved by shared layout rather than three pills
                  cross-fading — it is the same object sliding, and it should
                  travel like one. */}
              {active ? (
                <motion.span
                  aria-hidden="true"
                  layoutId={travels ? "keyboard-layout-pill" : undefined}
                  transition={transitionFor(level, SPRING.snap)}
                  className="absolute inset-0 rounded-full bg-slate"
                />
              ) : null}
              <span
                data-active={active}
                className="relative block rounded-full px-3 py-1.5 text-center text-sm font-medium text-ash transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald data-[active=true]:text-bone"
              >
                {option.short}
              </span>
            </label>
          );
        })}
      </div>

      {/* Two lines are reserved for this at every layout, so the copy changing
          length cannot move anything below it. `popLayout` takes the outgoing
          line out of flow: the default would stack both for a frame and double
          the height, and `mode="wait"` would hold the box empty for the length
          of the exit before the new line even started. */}
      <div className="min-h-[2.875rem]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={layout}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transitionFor(level, { duration: 0.12 })}
            className="text-sm leading-relaxed text-ash"
          >
            {info.tell}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-3">
        {REACH_GROUPS.map((group) => {
          const keys = info.keys.filter((key) => key.reach === group.reach);
          return (
            <div key={group.reach} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-bone">
                  {group.title}
                </span>
                <span className="text-xs text-ash">{group.note}</span>
              </div>
              {/* Fixed height whether or not there are keys in it: an empty
                  group that collapsed would move every group under it, and
                  "nenhuma" is information anyway — it is how ABNT2 says it
                  leaves nothing out of reach. */}
              <div className="flex h-8 flex-wrap items-center gap-1.5">
                {keys.length > 0 ? (
                  keys.map((key) => (
                    <motion.span
                      key={key.char}
                      // The character is the identity, so the same key that was
                      // 'direct' on one layout is the same object when it lands
                      // in 'dead' on the next — and it travels there.
                      layoutId={travels ? `key-${key.char}` : undefined}
                      transition={transitionFor(level, SPRING.migrate)}
                      title={key.how}
                      data-reach={key.reach}
                      className={CAP[key.reach]}
                    >
                      {key.char}
                      <span className="sr-only"> — {key.how}</span>
                    </motion.span>
                  ))
                ) : (
                  <span className="text-sm text-ash">nenhuma</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* The consequence, with the real count. Deliberately not a boxed alert:
          nothing has gone wrong, and a warning card would make a fact about
          hardware look like a failure the typist caused.

          Height is animated rather than transformed. It is a layout property
          and normally off limits, but the alternative here is the panel
          snapping taller in one frame — and unlike a scale, an animated height
          on a clipped box leaves the text inside it at its true size. */}
      <AnimatePresence initial={false}>
        {narrowed ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transitionFor(level, { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] })}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 border-t border-slate pt-3">
              <p className="text-sm leading-relaxed text-bone">
                Sem os acentos, o sorteio fica em{" "}
                <span className="font-mono font-semibold tabular-nums text-mint">
                  {share.available}
                </span>{" "}
                das {share.total} frases deste modo.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => onLayoutChange("us-intl")}
                >
                  Ativar US Internacional
                </Button>
                <span aria-hidden="true" className="h-4 w-px bg-slate" />
                <Button variant="quiet" size="sm" onClick={onUseEnglish}>
                  Treinar em inglês
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </fieldset>
  );
}

/**
 * The brightness ramp, which is the same idea the keyboard star map is built
 * on: a key you can reach is a star you can see. Cost is drawn as light, never
 * as hue — rust is the error colour in this palette, and a key your hardware
 * does not have is a fact, not a mistake.
 *
 * Every state is the same box at the same size. Only paint changes, so a key
 * arriving in a new group has nothing to resize on the way.
 */
const CAP: Record<KeyReach, string> = {
  direct:
    "grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-slate font-mono text-sm text-bone",
  dead: "grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-slate bg-slate/40 font-mono text-sm text-bone/80",
  none: "grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-dashed border-slate font-mono text-sm text-ash line-through decoration-ash/60",
};
