import { KeyboardLayoutSchema, type KeyboardLayout } from "@perseus/contracts";

/**
 * What a key costs on a given layout.
 *
 * Three states, not four. An earlier draft carried an 'altgr' state on the
 * strength of the advice this app used to print — that ABNT2 reaches braces
 * through AltGr. It does not: `[` and `]` sit right of P and Ç, and `{` and `}`
 * are Shift away from them, which is what every keyboard charges for a brace.
 * AltGr on ABNT2 buys ² ³ £ ¢ ¬ — nothing anybody types in code. The state was
 * describing a keyboard that does not exist, so it is gone.
 */
export type KeyReach = "direct" | "dead" | "none";

export type KeySample = {
  /** The character as it lands in the text. */
  char: string;
  reach: KeyReach;
  /** The actual sequence, for the tooltip and the screen reader. */
  how: string;
};

export type LayoutInfo = {
  /** Full name, for prose. */
  label: string;
  /** Short name, for the segmented control where three must fit on one row. */
  short: string;
  /** How to recognise this keyboard without looking it up. */
  tell: string;
  keys: readonly KeySample[];
};

/**
 * The same twelve characters on every layout, in the same order.
 *
 * Fixed on purpose: the panel exists to be compared across the three, and a
 * sample set that changed per layout would compare nothing. Four are the
 * accents Portuguese cannot do without; the rest are what code is made of.
 *
 * The backtick earns its place over any second bracket. On both Brazilian and
 * US-International keyboards it is a dead key, which means every template
 * literal in JavaScript costs a press of the space bar to escape — the single
 * most-hit friction in this whole table, and invisible until somebody names it.
 */
export const LAYOUTS: Record<KeyboardLayout, LayoutInfo> = {
  abnt2: {
    label: "ABNT2 — Brasil",
    short: "ABNT2",
    tell: "Tem tecla Ç própria, à direita do L, e uma tecla a mais ao lado do shift esquerdo.",
    keys: [
      { char: "á", reach: "dead", how: "´ e depois a" },
      { char: "ã", reach: "dead", how: "~ e depois a" },
      { char: "ê", reach: "dead", how: "^ e depois e" },
      { char: "ç", reach: "direct", how: "tecla própria, à direita do L" },
      { char: "{", reach: "direct", how: "shift + [" },
      { char: "}", reach: "direct", how: "shift + ]" },
      { char: "[", reach: "direct", how: "tecla à direita do ´" },
      { char: "]", reach: "direct", how: "tecla à direita do ~" },
      { char: "'", reach: "direct", how: "tecla própria" },
      { char: '"', reach: "direct", how: "shift + '" },
      { char: "`", reach: "dead", how: "` e depois espaço" },
      { char: "\\", reach: "direct", how: "tecla ao lado do shift esquerdo" },
    ],
  },
  us: {
    label: "US — americano",
    short: "US",
    tell: "Não tem Ç nem tecla morta. É o teclado da maioria dos notebooks importados.",
    keys: [
      { char: "á", reach: "none", how: "nenhuma sequência produz este caractere" },
      { char: "ã", reach: "none", how: "nenhuma sequência produz este caractere" },
      { char: "ê", reach: "none", how: "nenhuma sequência produz este caractere" },
      { char: "ç", reach: "none", how: "nenhuma sequência produz este caractere" },
      { char: "{", reach: "direct", how: "shift + [" },
      { char: "}", reach: "direct", how: "shift + ]" },
      { char: "[", reach: "direct", how: "tecla própria" },
      { char: "]", reach: "direct", how: "tecla própria" },
      { char: "'", reach: "direct", how: "tecla própria" },
      { char: '"', reach: "direct", how: "shift + '" },
      { char: "`", reach: "direct", how: "tecla própria" },
      { char: "\\", reach: "direct", how: "tecla própria" },
    ],
  },
  "us-intl": {
    label: "US Internacional",
    short: "US Intl",
    tell: "Mesmo teclado físico do US, mas ' \" ` ~ ^ passam a esperar a próxima tecla.",
    keys: [
      { char: "á", reach: "dead", how: "' e depois a" },
      { char: "ã", reach: "dead", how: "~ e depois a" },
      { char: "ê", reach: "dead", how: "^ e depois e" },
      { char: "ç", reach: "dead", how: "' e depois c" },
      { char: "{", reach: "direct", how: "shift + [" },
      { char: "}", reach: "direct", how: "shift + ]" },
      { char: "[", reach: "direct", how: "tecla própria" },
      { char: "]", reach: "direct", how: "tecla própria" },
      { char: "'", reach: "dead", how: "' e depois espaço" },
      { char: '"', reach: "dead", how: 'shift + \' e depois espaço' },
      { char: "`", reach: "dead", how: "` e depois espaço" },
      { char: "\\", reach: "direct", how: "tecla própria" },
    ],
  },
};

/**
 * How each cost is named, and the order the groups are stacked in.
 *
 * Ordered by what it costs the hand, cheapest first, so switching layouts reads
 * as keys falling down the list rather than shuffling inside it.
 */
export const REACH_GROUPS = [
  {
    reach: "direct" as const,
    title: "Direta",
    note: "Um toque, ou um shift.",
  },
  {
    reach: "dead" as const,
    title: "Tecla morta",
    note: "Dois toques: a tecla espera a próxima.",
  },
  {
    reach: "none" as const,
    title: "Fora de alcance",
    note: "Este teclado não produz. Some do sorteio.",
  },
] satisfies readonly { reach: KeyReach; title: string; note: string }[];

/**
 * The picker's options, built from the schema so the list cannot drift from
 * what the corpus will actually accept. ABNT2 leads because it is the default.
 */
export const LAYOUT_OPTIONS = KeyboardLayoutSchema.options.map((value) => ({
  value,
  label: LAYOUTS[value].label,
  short: LAYOUTS[value].short,
})) as readonly { value: KeyboardLayout; label: string; short: string }[];

export function layoutLabel(layout: KeyboardLayout): string {
  return LAYOUTS[layout].label;
}
