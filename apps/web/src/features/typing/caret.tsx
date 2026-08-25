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
 * O cursor é a única coisa da tela com física de verdade.
 *
 * Ele persegue a posição do caractere em vez de teleportar até ela, e a mola
 * está ajustada logo abaixo do amortecimento crítico — overshoot suficiente pra
 * parecer objeto com peso, não o bastante pra embaçar onde a próxima letra vai.
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
