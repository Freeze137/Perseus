/**
 * Canal paralelo que avisa o campo de estrelas quando tem algo em cima dele.
 *
 * Mesmo raciocínio do barramento de teclas, na direção oposta: o canvas não
 * pode assinar estado do React, então a casca diz aqui fora se uma camada está
 * cobrindo, e o campo lê isso dentro do próprio loop.
 *
 * O que isso compra é orçamento de frame. Uma gaveta ou o diálogo de
 * configurações cobre o campo inteiro com um véu que não deixa ver através, e
 * um loop de `requestAnimationFrame` redesenhando centenas de formas embaixo de
 * uma folha opaca é trabalho que ninguém vê — trabalho que disputa frame com o
 * painel animando por cima, que é a única coisa na tela que alguém está olhando.
 */
export type OverlayListener = (covered: boolean) => void;

const listeners = new Set<OverlayListener>();

/** Quantas camadas estão abertas. Contadas, não sinalizadas: dá pra abrir uma
 *  gaveta em cima do diálogo, e o campo fica parado até a última sair. */
let depth = 0;

export function setOverlayOpen(open: boolean, id: string): void {
  const was = depth > 0;
  if (open) open_.add(id);
  else open_.delete(id);
  depth = open_.size;
  const now = depth > 0;
  if (was !== now) for (const listener of listeners) listener(now);
}

/** Com nome em vez de contado, pra abrir o mesmo painel duas vezes não vazar. */
const open_ = new Set<string>();

export function isOverlayOpen(): boolean {
  return depth > 0;
}

export function onOverlayChange(listener: OverlayListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
