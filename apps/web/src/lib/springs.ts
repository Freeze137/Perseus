import type { Transition } from "motion/react";

/**
 * O vocabulário de movimento, num lugar só.
 *
 * Mola em vez de duração, pelo mesmo motivo que o cursor usa uma: tudo que se
 * move nesta interface é objeto com peso, e objeto que chega numa bezier chega
 * sobre trilhos. Mola também sobrevive a interrupção — abre a gaveta, muda de
 * ideia, fecha no meio, e ela sai de onde de fato está em vez de voltar pro
 * início pra começar outra tween.
 *
 * Ajustada logo abaixo do amortecimento crítico. Overshoot suficiente pra ler
 * como físico, nunca suficiente pra fazer quem lê esperar assentar.
 */
export const SPRING = {
  /**
   * Uma camada chegando: o diálogo de configurações, uma gaveta lateral.
   *
   * A coisa mais pesada daqui, e ainda assim assenta visualmente em menos de
   * 300 ms — painel que demora mais que isso é coreografia, e a pessoa veio
   * digitar.
   */
  panel: { type: "spring", stiffness: 320, damping: 34, mass: 0.9 },
  /** Something small snapping to a new position, like a selected segment. */
  snap: { type: "spring", stiffness: 560, damping: 40, mass: 0.7 },
  /**
   * Uma tecla viajando entre dois grupos, longe o bastante pro olho seguir.
   *
   * Amortecida logo além do crítico, de propósito. Esta move doze objetos ao
   * mesmo tempo, e doze coisas balançando em formação lê como instabilidade e
   * não como peso.
   */
  migrate: { type: "spring", stiffness: 480, damping: 38, mass: 0.75 },
} as const satisfies Record<string, Transition>;

/**
 * No que toda mola acima vira sob `prefers-reduced-motion`.
 *
 * Zero, não "mais devagar". A configuração é um pedido de nenhum movimento
 * vestibular, e um deslize suave continua sendo deslize. A opacidade fica
 * livre pra cruzar porque desvanecer não é movimento nesse sentido.
 */
export const INSTANT = { duration: 0 } as const satisfies Transition;
