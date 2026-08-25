"use client";

import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { setOverlayOpen } from "@/lib/overlay-bus";
import { SPRING } from "@/lib/springs";
import { transitionFor } from "@/features/settings/performance-tiers";
import { useMotionLevel } from "@/features/settings/use-motion-level";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/** Saída é tween, não mola: overshoot depois que quem lê já desviou o olhar. */
const LEAVE = { duration: 0.14, ease: [0.4, 0, 1, 1] } as const;

/**
 * Construído sobre o `<dialog>` nativo: prisão de foco, Escape, inércia da
 * página atrás e a camada de topo vêm todos da plataforma em vez de virem da
 * gente, que é como acabam corretos.
 *
 * ---
 *
 * **O conteúdo fica montado, exatamente como as gavetas.**
 *
 * Uma versão disto punha o painel atrás de `AnimatePresence`, então abrir o
 * diálogo montava a subárvore inteira — o painel de conta, o mapa de teclado,
 * cada uma das doze teclas se registrando na árvore de projeção do Motion — no
 * único frame em que a animação de abertura tinha que começar. As gavetas nunca
 * pareceram pesadas porque nunca foram feitas assim: elas estão sempre no DOM e
 * só deslizam. Agora isto combina com elas. Abrir é uma animação e mais nada.
 *
 * Enquanto o diálogo está fechado, o `display: none` que o próprio browser
 * aplica num `<dialog>` fechado mantém a subárvore fora da árvore de
 * acessibilidade, fora da ordem de tabulação e fora do render, então a
 * permanência não custa nada depois da primeira montagem.
 *
 * `close()` espera a saída terminar, porque ele tira o elemento da camada de
 * topo no frame em que é chamado e apagaria o painel no meio da saída. O Escape
 * é interceptado pelo `onCancel` pelo mesmo motivo: o fechamento da plataforma é
 * instantâneo, e instantâneo é a única coisa que a saída não pode ser.
 *
 * O véu é desenhado aqui em vez de deixado pro `::backdrop`, que o React não
 * alcança e que só deixa de existir no `close()` — ou seja, depois de o painel
 * já ter ido, deixando uma tela escura e vazia atrás.
 */
export function Modal({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const level = useMotionLevel();
  const still = level === "none";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
  }, [open]);

  // Avisa o campo de estrelas pra descansar: ele está totalmente coberto, e o
  // loop de render dele disputaria frames com a animação deste painel.
  useEffect(() => {
    setOverlayOpen(open, `modal:${title}`);
    return () => setOverlayOpen(false, `modal:${title}`);
  }, [open, title]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-full max-h-full w-full max-w-full overflow-visible bg-transparent p-0 text-bone backdrop:bg-transparent"
    >
      <motion.div
        aria-hidden="true"
        onClick={onClose}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={transitionFor(level, { duration: 0.18 })}
        // Sem `backdrop-filter`. Blur de tela inteira não pode ser cacheado
        // enquanto algo atrás dele se move, e o que está atrás aqui é um canvas
        // animado — então o compositor reborrava a viewport inteira a cada
        // frame, ao lado do painel tentando animar por cima. As gavetas nunca
        // tiveram um e nunca pareceram pesadas, e foi essa comparação que achou
        // isto. Um véu sólido separa igual.
        className="absolute inset-0 bg-void/85"
      />

      {/* Anchored near the top rather than centred. The panel's content can
          change height while it is open — the keyboard consequence appears and
          disappears — and a centred box answers that by moving everything
          already on screen half the difference. Anchored, it grows downward
          into empty space and nothing the reader is looking at shifts. */}
      <div className="pointer-events-none absolute inset-0 grid items-start justify-items-center p-4 pt-[max(1rem,8vh)]">
        <motion.div
          initial={false}
          animate={
            open
              ? { opacity: 1, scale: 1, y: 0 }
              : {
                  // O lugar de repouso de onde o painel sai na mola e pra onde
                  // volta na tween. Longe o bastante pra chegar ler como chegar.
                  opacity: 0,
                  scale: still ? 1 : 0.94,
                  y: still ? 0 : 12,
                }
          }
          transition={transitionFor(level, open ? SPRING.panel : LEAVE)}
          onAnimationComplete={() => {
            if (!open) ref.current?.close();
          }}
          className="scroll-silent pointer-events-auto max-h-full w-[min(30rem,100%)] overflow-y-auto rounded-md border border-slate bg-obsidian p-6"
        >
          <header className="mb-4 flex items-center justify-between">
            <h2 className="label">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid h-8 w-8 place-items-center rounded-sm text-ash transition-colors hover:bg-slate hover:text-bone"
            >
              ✕
            </button>
          </header>
          {children}
        </motion.div>
      </div>
    </dialog>
  );
}
