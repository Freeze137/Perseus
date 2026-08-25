import type { KeyboardLayout } from '@perseus/contracts';

/**
 * O que um teclado consegue pôr na tela, do ponto de vista do corpus.
 *
 * Os layouts são reduzidos a isto em vez de filtrados um por um de propósito:
 * ABNT2 e US-International arrumam as teclas bem diferente e alcançam
 * exatamente os mesmos caracteres, então texto sorteado pra um tem que ser o
 * texto sorteado pro outro. Separar os pools por nome de layout daria dois
 * textos diferentes pro mesmo seed, e faria cada layout novo virar versão nova
 * de corpus mesmo sem digitar nada novo.
 *
 * 'full'  — todo caractere dos bancos, acento incluído.
 * 'ascii' — ASCII imprimível, mais a quebra de linha e o tab de que código é
 *           feito. Sem tecla morta, então nada de "á", "ç", "ã".
 */
export type Reach = 'full' | 'ascii';

const REACH: Record<KeyboardLayout, Reach> = {
  abnt2: 'full',
  'us-intl': 'full',
  us: 'ascii',
};

/**
 * ASCII imprimível e os dois espaços em branco que um snippet contém.
 *
 * Escrito como faixa em vez de lista do que exclui: a pergunta é o que um
 * teclado US comum *consegue* produzir, e isso é um bloco contíguo. Qualquer
 * coisa fora dele precisa de tecla morta ou sequência de composição.
 */
const ASCII = /^[\x20-\x7E\n\t]*$/;

export function reachOf(layout: KeyboardLayout): Reach {
  return REACH[layout];
}

/** Se todo caractere de `text` dá pra digitar com esse alcance. */
export function reaches(reach: Reach, text: string): boolean {
  return reach === 'full' || ASCII.test(text);
}
