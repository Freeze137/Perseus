"use client";

import type {
  KeyboardLayout,
  Language,
  SyntaxChoice,
  TextKind,
} from "@perseus/contracts";
import { useEffect } from "react";
import { create } from "zustand";
import type { PerformanceTier } from "./performance-tiers";
import { persist } from "zustand/middleware";

export type Settings = {
  language: Language;
  kind: TextKind;
  /**
   * Qual linguagem de programação o modo código sorteia. Fica ao lado de
   * `language` e não dentro: uma é a prosa, a outra é a sintaxe, e são
   * escolhidas de forma independente.
   */
  syntax: SyntaxChoice;
  length: number;
  /**
   * O teclado na frente da pessoa.
   *
   * Ao contrário de tudo aqui, descreve hardware e não gosto — que é por que
   * fica nas configurações e não na barra de início: você seta uma vez, no dia
   * em que montou a máquina, e nunca mais pensa nisso.
   *
   * Alcança o corpus: corrida sorteada pra um teclado que não digita "ç" não
   * pode conter um, então ele viaja no SessionConfig também.
   */
  keyboardLayout: KeyboardLayout;
  /** O teclado em mapa estelar embaixo do texto. */
  showKeyboard: boolean;
  /**
   * Quanto a interface pode gastar pra parecer viva.
   *
   * Substituiu um interruptor `ambient` simples, que só respondia "campo de
   * estrelas ou nenhum campo de estrelas" — e na máquina que de fato sofre, o
   * campo sem o blur costuma caber. Ver performance-tiers.ts pra o que cada
   * nível entrega, e pra garantia de que nenhum deles entrega nada do produto.
   */
  performance: PerformanceTier;
  setLanguage: (language: Language) => void;
  setKind: (kind: TextKind) => void;
  setSyntax: (syntax: SyntaxChoice) => void;
  setLength: (length: number) => void;
  setKeyboardLayout: (layout: KeyboardLayout) => void;
  setShowKeyboard: (show: boolean) => void;
  setPerformance: (tier: PerformanceTier) => void;
};

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      language: "pt-BR",
      kind: "words",
      syntax: "mix",
      length: 180,
      // Combina com o default pt-BR ao lado: os dois juntos são a máquina em
      // que a maioria das pessoas pra quem isto foi feito está sentada.
      keyboardLayout: "abnt2",
      showKeyboard: true,
      performance: "full",
      setLanguage: (language) => set({ language }),
      setKind: (kind) => set({ kind }),
      setSyntax: (syntax) => set({ syntax }),
      setLength: (length) => set({ length }),
      setKeyboardLayout: (keyboardLayout) => set({ keyboardLayout }),
      setShowKeyboard: (showKeyboard) => set({ showKeyboard }),
      setPerformance: (performance) => set({ performance }),
    }),
    {
      name: "perseus:settings",
      version: 1,
      /**
       * Leva um `ambient: false` antigo pro nível que quer dizer aquilo.
       *
       * Quem desligou o campo de estrelas fez por um motivo, e o motivo é quase
       * sempre este. Devolver a pessoa pro 'full' no deploy que renomeou a
       * configuração desfaria uma escolha deliberada, numa máquina que
       * presumivelmente ainda precisa dela.
       */
      migrate: (persisted, version) => {
        if (version >= 1) return persisted as Settings;
        const old = persisted as Partial<Settings> & { ambient?: boolean };
        const { ambient, ...rest } = old;
        return {
          ...rest,
          performance: ambient === false ? "minimal" : "full",
        } as Settings;
      },
      // A hidratação é adiada de propósito: ler o localStorage enquanto a store
      // é criada faria o primeiro render do cliente discordar do do servidor pra
      // quem tem configuração salva.
      skipHydration: true,
    },
  ),
);

export function useSettingsHydration(): void {
  useEffect(() => {
    void useSettings.persist.rehydrate();
  }, []);
}
