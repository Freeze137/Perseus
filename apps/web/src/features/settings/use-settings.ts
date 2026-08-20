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
   * Which programming language the code mode draws. Kept beside `language`
   * rather than inside it: one is the prose, the other is the syntax, and they
   * are chosen independently.
   */
  syntax: SyntaxChoice;
  length: number;
  /**
   * The keyboard in front of the typist.
   *
   * Unlike everything else here it describes hardware, not taste — which is
   * why it sits in settings rather than in the start bar: you set it once, on
   * the day you set up the machine, and never think about it again.
   *
   * It reaches the corpus: a run drawn for a keyboard that cannot type "ç"
   * must not contain one, so it travels on the SessionConfig too.
   */
  keyboardLayout: KeyboardLayout;
  /** The star-map keyboard under the text. */
  showKeyboard: boolean;
  /**
   * How much the interface may spend on looking alive.
   *
   * Replaced a plain `ambient` switch, which could only answer "star field or
   * no star field" — and on the machine that actually struggles, the star field
   * without its blur is usually affordable. See performance-tiers.ts for what
   * each level gives up, and for the guarantee that none of them gives up any
   * of the product.
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
      // Matches the pt-BR default beside it: the two together are the machine
      // most of the people this was built for are actually sitting at.
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
       * Carries an old `ambient: false` across to the level that means it.
       *
       * Somebody who turned the star field off did it for a reason, and that
       * reason is nearly always this one. Dropping them back to 'full' on the
       * deploy that renamed the setting would have undone a choice they made
       * deliberately, on a machine that presumably still needs it.
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
      // Hydration is deferred on purpose: reading localStorage while the store
      // is created would make the first client render disagree with the server
      // one for anybody who has settings saved.
      skipHydration: true,
    },
  ),
);

export function useSettingsHydration(): void {
  useEffect(() => {
    void useSettings.persist.rehydrate();
  }, []);
}
