'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type Props = {
  /** O que está sendo explicado. Vira o nome acessível do botão. */
  term: string;
  children: ReactNode;
};

/**
 * O "?" que explica um número sem tirar ninguém da tela.
 *
 * Abre no mouse e também no foco, porque um atalho que só existe pra quem tem
 * mouse é meia explicação. Fica aberto enquanto o ponteiro estiver no botão ou
 * dentro do balão — quem começou a ler uma frase precisa poder chegar ao fim
 * dela — e fecha no Escape. Os três são o que a 1.4.13 pede de conteúdo que
 * aparece no hover.
 *
 * `title` faria o mesmo em uma linha e foi recusado: ele não aceita CSS, não
 * abre no teclado, e o atraso dele é do sistema operacional.
 */
export function Hint({ term, children }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Na captura e com a propagação cortada: enquanto este balão está por
      // cima, o Escape é dele. Sem isso a mesma tecla que fecha a explicação
      // chegaria em quem escuta o documento atrás dela.
      event.stopPropagation();
      setOpen(false);
      root.current?.querySelector('button')?.focus();
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [open]);

  return (
    <span
      ref={root}
      className="relative inline-flex"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={`O que é ${term}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        // O clique é pra tela de toque, onde não existe hover. No teclado o
        // foco já abriu, e o Enter aqui não faz nada que já não esteja feito.
        onClick={() => setOpen((was) => !was)}
        className="hint-key relative grid h-4 w-4 shrink-0 place-items-center rounded-full border border-slate text-[0.625rem] font-semibold leading-none tracking-normal text-ash hover:border-emerald hover:text-mint focus-visible:text-mint"
      >
        <span aria-hidden="true">?</span>
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="hint-balloon absolute bottom-full z-20 mb-2 w-[min(22rem,70vw)] rounded-xl border border-slate bg-obsidian p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ash"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
