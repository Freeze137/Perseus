"use client";

import { useSyncExternalStore } from "react";

/** Onde a preferência de girar fica guardada. */
const SPIN_KEY = "perseus:patente-spin";

/**
 * A preferência de girar, como fonte externa em vez de estado do React.
 *
 * O `localStorage` é um sistema de fora, e lê-lo dentro de um efeito pra então
 * escrever estado produz um render a mais em toda montagem. `useSyncExternalStore`
 * é o que existe pra exatamente esta forma — e o instantâneo do servidor é
 * `false`, que é o padrão e é o que o HTML entregue já diz.
 *
 * Mora num arquivo só porque duas telas perguntam a mesma coisa: a vitrine, que
 * é onde a escolha é feita, e o anúncio de patente nova, que é onde ela precisa
 * valer sem ser perguntada de novo. Quem ligou o giro numa quer o giro na outra.
 */
const spinStore = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    spinStore.listeners.add(listener);
    return () => {
      spinStore.listeners.delete(listener);
    };
  },
  read(): boolean {
    try {
      return window.localStorage.getItem(SPIN_KEY) === "on";
    } catch {
      // Armazenamento bloqueado é um navegador com as configurações de alguém
      // dentro, não uma falha. O padrão já é o certo.
      return false;
    }
  },
  write(value: boolean): void {
    try {
      window.localStorage.setItem(SPIN_KEY, value ? "on" : "off");
    } catch {
      // A escolha continua valendo nesta sessão.
    }
    for (const listener of spinStore.listeners) listener();
  },
};

/** Se quem está lendo pediu pras patentes girarem mesmo com movimento reduzido. */
export function usePatenteSpin(): boolean {
  return useSyncExternalStore(spinStore.subscribe, spinStore.read, () => false);
}

export function setPatenteSpin(value: boolean): void {
  spinStore.write(value);
}
