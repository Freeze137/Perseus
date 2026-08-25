import { TextKindSchema, type TextKind } from "@perseus/contracts";

/**
 * Como cada tipo de texto é escrito na tela.
 *
 * Tirado da barra de início pros rótulos morarem num lugar só: duas listas
 * escritas à mão teriam descolado na primeira vez que uma delas fosse traduzida.
 */
export const KIND_LABELS: Record<TextKind, string> = {
  words: "Palavras",
  quote: "Frase",
  punctuation: "Pontuação",
  numbers: "Números",
  code: "Código",
};

/** Na ordem do contrato, pro seletor nunca discordar do gerador. */
export const KIND_OPTIONS: readonly { value: TextKind; label: string }[] =
  TextKindSchema.options.map((value) => ({ value, label: KIND_LABELS[value] }));
