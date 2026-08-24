import { TextKindSchema, type TextKind } from "@perseus/contracts";

/**
 * How each kind of text is written on screen.
 *
 * Lifted out of the start bar so the labels live in one place: two
 * hand-written lists would have drifted the first time one of them was
 * translated.
 */
export const KIND_LABELS: Record<TextKind, string> = {
  words: "Palavras",
  quote: "Frase",
  punctuation: "Pontuação",
  numbers: "Números",
  code: "Código",
};

/** In contract order, so the picker can never disagree with the generator. */
export const KIND_OPTIONS: readonly { value: TextKind; label: string }[] =
  TextKindSchema.options.map((value) => ({ value, label: KIND_LABELS[value] }));
