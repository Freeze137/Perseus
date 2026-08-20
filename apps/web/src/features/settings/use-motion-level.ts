"use client";

import { useReducedMotion } from "motion/react";
import { useSettings } from "./use-settings";
import { motionLevelOf, type MotionLevel } from "./performance-tiers";

/**
 * What this reader's interface is allowed to animate with, right now.
 *
 * One hook so the two inputs — the performance level they chose and the motion
 * preference their system carries — are combined in one place. Components that
 * asked `useReducedMotion()` on their own could only ever see half the answer.
 */
export function useMotionLevel(): MotionLevel {
  const reduced = useReducedMotion();
  const tier = useSettings((state) => state.performance);
  return motionLevelOf(tier, reduced ?? false);
}
