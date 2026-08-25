import { KeyboardLayoutSchema, type KeyboardLayout } from "@perseus/contracts";

/**
 * O que uma tecla custa num dado layout.
 *
 * Três estados, não quatro. Um rascunho anterior carregava um estado 'altgr'
 * apoiado no conselho que este app imprimia — que o ABNT2 alcança chaves pelo
 * AltGr. Não alcança: `[` e `]` ficam à direita do P e do Ç, e `{` e `}` estão a
 * um Shift deles, que é o que todo teclado cobra por uma chave. AltGr no ABNT2
 * compra ² ³ £ ¢ ¬ — nada que alguém digite em código. O estado descrevia um
 * teclado que não existe, então foi embora.
 */
export type KeyReach = "direct" | "dead" | "none";

export type KeySample = {
  /** O caractere como ele cai no texto. */
  char: string;
  reach: KeyReach;
  /** A sequência de verdade, pro tooltip e pro leitor de tela. */
  how: string;
};

export type LayoutInfo = {
  /** Nome completo, pra prosa. */
  label: string;
  /** Nome curto, pro controle segmentado onde três têm que caber numa linha. */
  short: string;
  /** Como reconhecer este teclado sem ir procurar. */
  tell: string;
  keys: readonly KeySample[];
};

/**
 * Os mesmos doze caracteres em todo layout, na mesma ordem.
 *
 * Fixos de propósito: o painel existe pra ser comparado entre os três, e um
 * conjunto de amostra que mudasse por layout não compararia nada. Quatro são os
 * acentos sem os quais o português não vive; o resto é do que código é feito.
 *
 * A crase ganha o lugar de qualquer segundo colchete. Nos teclados brasileiro e
 * US-International ela é tecla morta, o que significa que todo template literal
 * em JavaScript custa um toque na barra de espaço pra escapar — o atrito mais
 * batido desta tabela inteira, e invisível até alguém nomeá-lo.
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
 * Como cada custo é nomeado, e a ordem em que os grupos são empilhados.
 *
 * Ordenados pelo que custam à mão, do mais barato, pra trocar de layout ler
 * como teclas caindo pela lista e não se embaralhando dentro dela.
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
 * As opções do seletor, montadas a partir do schema pra lista não descolar do
 * que o corpus de fato aceita. ABNT2 vem primeiro porque é o padrão.
 */
export const LAYOUT_OPTIONS = KeyboardLayoutSchema.options.map((value) => ({
  value,
  label: LAYOUTS[value].label,
  short: LAYOUTS[value].short,
})) as readonly { value: KeyboardLayout; label: string; short: string }[];

export function layoutLabel(layout: KeyboardLayout): string {
  return LAYOUTS[layout].label;
}
