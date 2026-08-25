import type { SessionConfig, TextKind } from "@perseus/contracts";
import { syntaxLabel } from "@/features/settings/syntax-options";

/**
 * Como a sala está configurada, numa linha.
 *
 * A mesma frase é querida em três lugares — o lobby, a tela de convite e o
 * histórico — e duelo em que as duas pessoas discordam sobre o que vão digitar é
 * a única confusão que esta funcionalidade consegue causar de verdade. Está
 * escrita uma vez aqui pras três não descolarem.
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

/** O endereço que o amigo tem que abrir. Montado a partir da aba em que é lido. */
export function inviteLink(code: string): string {
  if (typeof window === "undefined") return `/duelo/${code}`;
  return `${window.location.origin}/duelo/${code}`;
}
