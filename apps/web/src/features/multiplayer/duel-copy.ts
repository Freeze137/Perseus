import type { SessionConfig, TextKind } from "@perseus/contracts";
import { syntaxLabel } from "@/features/settings/syntax-options";

/**
 * What a room is set to, in one line.
 *
 * The same sentence is wanted in three places — the lobby, the invite screen
 * and the history — and a duel where the two people disagree about what they
 * are about to type is the one confusion this feature can actually cause. It is
 * written once here so the three cannot drift.
 */
export const KIND_LABELS: Record<TextKind, string> = {
  words: "Palavras",
  quote: "Frase",
  punctuation: "Pontuação",
  numbers: "Números",
  code: "Código",
};

export function describeConfig(config: SessionConfig): string {
  const kind = KIND_LABELS[config.kind];
  if (config.kind === "code") {
    return `${kind} · ${syntaxLabel(config.syntax ?? "mix")} · ${config.length} caracteres`;
  }
  const language = config.language === "pt-BR" ? "português" : "inglês";
  return `${kind} · ${language} · ${config.length} caracteres`;
}

/** The address a friend has to open. Built from the tab it is read in. */
export function inviteLink(code: string): string {
  if (typeof window === "undefined") return `/duelo/${code}`;
  return `${window.location.origin}/duelo/${code}`;
}
