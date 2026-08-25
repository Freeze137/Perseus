'use client';

import { memo } from 'react';

export type CharState = 'pending' | 'correct' | 'wrong' | 'extra';

type Props = {
  index: number;
  char: string;
  state: CharState;
  /** Só em código: isto é espaço inicial numa parada de indentação, então desenha guia. */
  guide?: boolean;
};

/**
 * Um caractere do texto alvo.
 *
 * As reações são animação CSS pura e não componentes do Motion: uma corrida tem
 * centenas de caracteres, e centenas de motores de animação disputariam o mesmo
 * frame com o handler de entrada. Motion fica reservado pro cursor, onde a
 * física de fato aparece.
 */
export const Char = memo(function Char({ index, char, state, guide }: Props) {
  // Quebra de linha não tem glifo mas precisa de caixa: é uma posição em que o
  // cursor estaciona e um caractere que dá pra errar, então recebe largura em
  // vez de ser pulada.
  const newline = char === '\n';

  return (
    <span
      data-index={index}
      data-state={state}
      data-newline={newline || undefined}
      data-guide={guide || undefined}
      className="char"
      // Espaço não tem glifo pra reagir, então ganha uma caixa visível pra animar.
      aria-hidden="true"
    >
      {newline ? '' : char}
    </span>
  );
});
