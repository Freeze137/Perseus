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
  side: "left" | "right";
  children: ReactNode;
};

/**
 * Um painel lateral que fica fora do caminho até ser chamado.
 *
 * A tela pertence ao texto: qualquer coisa estacionada em permanência ao lado é
 * coisa que o olho tem que ficar dispensando enquanto digita.
 *
 * Fica montado e desliza numa mola em vez de desmontar, pra um painel pego no
 * meio — aberto, repensado, fechado de novo — sair de onde de fato está. Uma
 * tween voltaria pro início de outra.
 *
 * Montado não é a mesma coisa que alcançável: o `inert` tira a subárvore inteira
 * da ordem de tabulação e da árvore de acessibilidade enquanto está fechado.
 * Antes dele, todo controle dentro de uma gaveta fechada ainda era tabulável a
 * partir da tela de digitação.
 */
export function Drawer({ open, onClose, title, side, children }: Props) {
  const level = useMotionLevel();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    setOverlayOpen(open, `drawer:${title}`);
    return () => setOverlayOpen(false, `drawer:${title}`);
  }, [open, title]);

  // O foco entra junto com o painel. Sem isso a gaveta abre num lugar onde o
  // teclado não chega, e a ordem de tabulação segue atrás dela como se nada
  // tivesse acontecido. Sair de volta é trabalho da página — ela entrega o foco
  // ao input de digitação, que é onde a próxima tecla deve cair de qualquer jeito.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <>
      <motion.div
        aria-hidden="true"
        onClick={onClose}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={transitionFor(level, { duration: 0.2 })}
        data-open={open}
        className="pointer-events-none fixed inset-0 z-20 bg-void/60 data-[open=true]:pointer-events-auto"
      />
      <motion.aside
        aria-label={title}
        inert={!open}
        data-open={open}
        initial={false}
        animate={{ x: open ? 0 : side === "left" ? "-100%" : "100%" }}
        transition={transitionFor(level, SPRING.panel)}
        className={`fixed inset-y-0 z-30 flex w-[min(22rem,88vw)] flex-col gap-5 bg-obsidian p-6 ${
          side === "left"
            ? "left-0 border-r border-slate"
            : "right-0 border-l border-slate"
        }`}
      >
        <header className="flex items-center justify-between">
          <h2 className="label">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={`Fechar ${title}`}
            className="grid h-8 w-8 place-items-center rounded-sm text-lg leading-none text-ash transition-colors hover:bg-slate hover:text-bone"
          >
            ✕
          </button>
        </header>
        {children}
      </motion.aside>
    </>
  );
}
