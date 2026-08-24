"use client";

import type { SessionConfig } from "@perseus/contracts";
import { advance, drawCount, seedFor, type BagPosition } from "@perseus/corpus";
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Onde este navegador está dentro da sacola de frases.
 *
 * O que fica guardado é a *posição*, nunca o resultado. O texto de uma corrida
 * precisa continuar sendo função pura da config, porque o servidor regenera
 * esse texto só a partir dela para pontuar a corrida — ver `ResultsService.score`.
 * Uma sacola consultada na hora do sorteio faria o texto do cliente depender de
 * um estado que o servidor não enxerga, e toda submissão seria recusada como
 * timeline inválida.
 *
 * Então a posição entra na seed, a seed viaja junto da corrida, e o servidor
 * distribui a mesma sacola a partir do mesmo id e chega nas mesmas frases.
 */
type Bag = BagPosition & {
  /** Anda o cursor pelo tanto que a corrida atual consumiu. */
  next: (config: SessionConfig) => void;
};

/**
 * O id é fixo, e isso é de propósito.
 *
 * Um id sorteado por visitante daria a cada pessoa uma ordem própria — e daria
 * também um texto diferente do que o servidor renderizou, já que ele não tem
 * como adivinhar o sorteio antes do JavaScript rodar. O que separa uma sessão
 * da seguinte é o cursor, que é persistido; a ordem ser a mesma para todo mundo
 * não custa nada a quem digita sozinho.
 */
const BAG_ID = "perseus";

export const useBag = create<Bag>()(
  persist(
    (set, get) => ({
      id: BAG_ID,
      cursor: 0,
      next: (config) => {
        const { id, cursor } = get();
        // Contado a partir do sorteio de verdade, nunca estimado: errar por um
        // aqui ou pula uma frase que ninguém vê, ou repete uma que todo mundo vê.
        const drawn = drawCount({ ...config, seed: seedFor({ id, cursor }) });
        // O mínimo de um existe para o caso de a pool ficar vazia: sem ele o
        // cursor pararia, e "novo texto" devolveria o mesmo texto para sempre.
        set(advance({ id, cursor }, Math.max(1, drawn)));
      },
    }),
    {
      name: "perseus:bag",
      version: 1,
      partialize: (state) => ({ id: state.id, cursor: state.cursor }),
      // Mesmo motivo de use-settings: ler o localStorage na criação da store
      // faria a primeira renderização do cliente discordar da do servidor.
      skipHydration: true,
    },
  ),
);

export function useBagHydration(): void {
  useEffect(() => {
    void useBag.persist.rehydrate();
  }, []);
}

/** A seed que a config desta corrida deve carregar. */
export function bagSeed(position: BagPosition): string {
  return seedFor({ id: position.id, cursor: position.cursor });
}
