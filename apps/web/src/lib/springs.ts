import type { Transition } from "motion/react";

/**
 * The motion vocabulary, in one place.
 *
 * Springs rather than durations, for the same reason the caret uses one: every
 * moving thing in this interface is an object with weight, and an object that
 * arrives on a bezier arrives on rails. A spring also survives interruption —
 * open the drawer, change your mind, close it halfway through, and it leaves
 * from wherever it actually is instead of snapping back to start a new tween.
 *
 * Tuned just under critical damping. Enough overshoot to read as physical,
 * never enough to make the reader wait for it to settle.
 */
export const SPRING = {
  /**
   * An overlay arriving: the settings dialog, a side drawer.
   *
   * The heaviest thing here, and still under 300 ms to visually settle — a
   * panel that takes longer than that is choreography, and the user came to
   * type.
   */
  panel: { type: "spring", stiffness: 320, damping: 34, mass: 0.9 },
  /** Something small snapping to a new position, like a selected segment. */
  snap: { type: "spring", stiffness: 560, damping: 40, mass: 0.7 },
  /**
   * A key travelling between two groups, far enough that the eye follows it.
   *
   * Damped just past critical on purpose. This one moves twelve objects at
   * once, and twelve things wobbling in formation reads as instability rather
   * than as weight.
   */
  migrate: { type: "spring", stiffness: 480, damping: 38, mass: 0.75 },
} as const satisfies Record<string, Transition>;

/**
 * What every spring above becomes under `prefers-reduced-motion`.
 *
 * Zero, not "slower". The setting is a request for no vestibular motion at all,
 * and a gentle slide is still a slide. Opacity is left to cross-fade because
 * fading is not motion in that sense.
 */
export const INSTANT = { duration: 0 } as const satisfies Transition;
