'use client';

import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useCallback, useMemo, useRef } from 'react';

export type CaretTarget = {
  x: number;
  y: number;
  height: number;
};

/**
 * A perseguição normal, ajustada logo abaixo do amortecimento crítico.
 *
 * Overshoot suficiente pra parecer objeto com peso, não o bastante pra embaçar
 * onde a próxima letra vai.
 */
const CHASE = { stiffness: 900, damping: 42, mass: 0.55 } as const;

/**
 * A mesma perseguição sob `prefers-reduced-motion`, curta e sem overshoot.
 *
 * Não é teleporte. A configuração pede pra interface parar de mover coisa
 * grande pelo campo de visão — painel voando, tela deslizando —, e um traço de
 * dois pixels andando a largura de uma letra em cerca de cinquenta milésimos
 * não é esse movimento. Teleportar o cursor era obedecer a chave literalmente e
 * entregar uma digitação que pisca em vez de correr: quem liga a chave não está
 * pedindo um produto pior, está pedindo pra não passar mal.
 */
const BRIEF = { stiffness: 1_400, damping: 50, mass: 0.4 } as const;

export type CaretHandle = {
  x: ReturnType<typeof useSpring>;
  y: ReturnType<typeof useSpring>;
  height: ReturnType<typeof useMotionValue<number>>;
  place: (target: CaretTarget) => void;
};

/**
 * O cursor é a única coisa da tela com física de verdade — e anda sem passar
 * pelo React.
 *
 * `place` escreve direto nos motion values, que pintam pelo compositor. Isto
 * era estado, e estado significava um segundo render do componente inteiro a
 * cada tecla: o primeiro pra letra trocar de cor, o segundo só pra mover um
 * traço. O segundo desapareceu, e com ele os caracteres que o React reconciliava
 * de novo por nada.
 */
export function useCaret(): CaretHandle {
  const reduced = useReducedMotion();
  const config = reduced ? BRIEF : CHASE;

  const x = useSpring(0, config);
  const y = useSpring(0, config);
  const height = useMotionValue(0);
  // A primeira posição de uma corrida é onde o cursor nasce, não um lugar pra
  // onde ele viaja: sem isto ele desliza do canto até a primeira letra toda vez
  // que um texto novo entra.
  const placed = useRef(false);

  const place = useCallback(
    (target: CaretTarget) => {
      height.set(target.height);
      if (placed.current) {
        x.set(target.x);
        y.set(target.y);
        return;
      }
      placed.current = true;
      x.jump(target.x);
      y.jump(target.y);
    },
    [x, y, height],
  );

  return useMemo(() => ({ x, y, height, place }), [x, y, height, place]);
}

export function Caret({ caret }: { caret: CaretHandle }) {
  return (
    <motion.span
      aria-hidden="true"
      className="caret"
      style={{ x: caret.x, y: caret.y, height: caret.height }}
    />
  );
}
