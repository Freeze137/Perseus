'use client';

import { motion, useSpring, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';

export type CaretTarget = {
  x: number;
  y: number;
  height: number;
};

const CHASE = { stiffness: 900, damping: 42, mass: 0.55 } as const;
const INSTANT = { stiffness: 4_000, damping: 120, mass: 0.2 } as const;

/**
 * The caret is the only thing on screen with real physics.
 *
 * It chases the character position instead of teleporting to it, and the
 * spring is tuned just under critical damping — enough overshoot to feel like
 * an object with weight, not enough to blur where the next letter goes.
 */
export function Caret({ target }: { target: CaretTarget }) {
  const reduced = useReducedMotion();
  const config = reduced ? INSTANT : CHASE;

  const x = useSpring(target.x, config);
  const y = useSpring(target.y, config);

  useEffect(() => {
    x.set(target.x);
    y.set(target.y);
  }, [target.x, target.y, x, y]);

  return (
    <motion.span
      aria-hidden="true"
      className="caret"
      style={{ x, y, height: target.height }}
    />
  );
}
