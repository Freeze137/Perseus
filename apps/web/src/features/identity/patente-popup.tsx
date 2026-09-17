"use client";

import { TIERS } from "@perseus/contracts";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LiveLines } from "@/components/ui/live-lines";
import { transitionFor } from "@/features/settings/performance-tiers";
import { useMotionLevel } from "@/features/settings/use-motion-level";
import { setOverlayOpen } from "@/lib/overlay-bus";
import { SPRING } from "@/lib/springs";
import { PatenteMark } from "./patente-mark";
import { setPatenteSpin, usePatenteSpin } from "./patente-spin";
import {
  dismissArrival,
  usePatenteArrival,
  type PatenteArrival,
} from "./use-identity";

/** Saída é tween, como a dos painéis: mola depois do olhar desviado não chega. */
const LEAVE = { duration: 0.16, ease: [0.4, 0, 1, 1] } as const;

/**
 * O anúncio de uma patente.
 *
 * Existe porque a patente era a única coisa que este produto entrega e que
 * ninguém via acontecer. Ela nasce na quinta corrida válida de uma família e
 * passa a estar escrita em dois painéis que só abrem se alguém for procurar —
 * então, do lado de fora, cinco corridas e nenhuma patente são indistinguíveis
 * de cinco corridas e nenhum ranking. O que faltava não era a conta; era o
 * instante.
 *
 * Por isso ele interrompe, e por isso interrompe **uma vez**: só quando a
 * patente nasce ou troca de degrau, nunca na sexta corrida que confirma a
 * mesma. Aviso que aparece de novo depois de fechado vira aviso de cookie, e a
 * conquista que ele carrega morre junto.
 *
 * As linhas verdes em volta são o mesmo cometa que corre na borda dos painéis,
 * dobrado em duas: o aro de conic-gradient que o site inteiro usa, e por dentro
 * dois traços de menta dando a volta pelo perímetro. É o único lugar do site
 * onde a borda faz mais do que desenhar a caixa — e é o único momento em que
 * ela tem algo a comemorar.
 */
export function PatentePopup() {
  const arrival = usePatenteArrival();
  const level = useMotionLevel();
  const still = level === "none";
  const spin = usePatenteSpin();
  const ref = useRef<HTMLDialogElement>(null);

  /**
   * A última patente anunciada, guardada aqui pela saída.
   *
   * Fechar zera o anúncio na loja no mesmo frame, e a janela ainda tem uma
   * animação inteira pela frente — ler direto de `arrival` esvaziaria o
   * conteúdo antes de ele terminar de sair, que é a versão piscada do
   * fechamento.
   */
  const [shown, setShown] = useState<PatenteArrival | null>(arrival);
  if (arrival && arrival !== shown) setShown(arrival);

  const open = arrival !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
  }, [open]);

  // A janela é modal de verdade: enquanto ela está aberta, as teclas são dela e
  // não da área de digitação atrás.
  useEffect(() => {
    setOverlayOpen(open, "modal:patente");
    return () => setOverlayOpen(false, "modal:patente");
  }, [open]);

  if (!shown) return null;

  const info = TIERS[shown.patente.tier];
  const promoted = shown.previousTier !== null;
  const family = shown.patente.family === "code" ? "código" : "prosa";
  /** O emblema gira quando o movimento é permitido, ou quando foi pedido. */
  const turning = !still || spin;

  return (
    <dialog
      ref={ref}
      aria-labelledby="patente-popup-title"
      onCancel={(event) => {
        event.preventDefault();
        dismissArrival();
      }}
      className="fixed inset-0 m-0 h-full max-h-full w-full max-w-full overflow-visible bg-transparent p-0 text-bone backdrop:bg-transparent"
    >
      <motion.div
        aria-hidden="true"
        onClick={dismissArrival}
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={transitionFor(level, { duration: 0.18 })}
        className="absolute inset-0 bg-void/85"
      />

      <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
        <motion.div
          // Com entrada, ao contrário dos painéis: eles ficam montados desde o
          // carregamento e só um `animate` os abre, e esta janela nasce no
          // instante em que a patente nasce. Sem `initial` ela apareceria
          // pronta, que é a única forma de chegada que esta tela não pode ter.
          initial={
            still
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.94, y: 12 }
          }
          animate={
            open
              ? { opacity: 1, scale: 1, y: 0 }
              : { opacity: 0, scale: still ? 1 : 0.94, y: still ? 0 : 12 }
          }
          transition={transitionFor(level, open ? SPRING.panel : LEAVE)}
          onAnimationComplete={() => {
            if (!open) ref.current?.close();
          }}
          className="glow-edge patente-announce pointer-events-auto relative w-[min(26rem,100%)] overflow-hidden rounded-md px-6 py-7 text-center"
        >
          {/* As linhas vivas, as mesmas que dão a volta no painel de posição no
              fim de cada corrida. */}
          <LiveLines still={still} />

          <p className="label">{promoted ? "Você subiu" : "Nova patente"}</p>

          <div className="patente-stage mt-5 grid place-items-center">
            <div data-turning={turning} className="patente-orbit">
              <PatenteMark
                tier={shown.patente.tier}
                size={168}
                state={shown.patente.dormant ? "dormant" : "earned"}
              />
            </div>
          </div>

          <h2
            id="patente-popup-title"
            className="mt-5 flex flex-col items-center gap-1"
          >
            <span className="label">Sua patente é</span>
            <span className="display text-4xl text-mint">{info.star}</span>
          </h2>

          <p className="mt-2 font-mono text-xs uppercase tracking-wider text-ash">
            {info.designation} · {info.spectral} · {family}
          </p>

          <p className="mt-4 text-sm leading-relaxed text-ash">
            {promoted
              ? `De ${TIERS[shown.previousTier!].star} para ${info.star}, com média de ${Math.round(shown.patente.wpm)} ppm nas suas cinco corridas mais recentes.`
              : `Média de ${Math.round(shown.patente.wpm)} ppm nas suas cinco corridas válidas mais recentes de ${family}.`}
          </p>

          <div className="mt-6 flex flex-col items-center gap-3">
            <Button variant="edge" size="sm" onClick={dismissArrival}>
              Continuar
            </Button>

            {/* Mesma oferta da vitrine, e a mesma preferência por trás dela:
                movimento reduzido cala o giro, e quem quiser vê-lo mesmo assim
                pede uma vez e vale nos dois lugares. */}
            {still ? (
              <button
                type="button"
                onClick={() => setPatenteSpin(!spin)}
                className="text-xs text-ash underline decoration-slate underline-offset-4 hover:text-bone"
              >
                {spin ? "Parar de girar a patente" : "Girar a patente"}
              </button>
            ) : null}
          </div>
        </motion.div>
      </div>
    </dialog>
  );
}
