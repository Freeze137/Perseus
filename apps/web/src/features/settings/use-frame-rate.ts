"use client";

import { useEffect, useRef, useState } from "react";
import {
  createHistogram,
  record,
  summarize,
  type FrameReport,
} from "./frame-report";

export type { FrameReport } from "./frame-report";

/**
 * Quadros descartados no começo da amostra.
 *
 * Os primeiros quadros de uma corrida não são a máquina digitando: são o
 * componente montando, a primeira animação partindo e o navegador decidindo
 * layout. Contá-los inflava a perda em toda corrida — e sempre no mesmo
 * sentido, o que fazia o aviso parecer confirmar a si mesmo.
 *
 * Meio segundo a 120 Hz, ou um segundo inteiro a 60.
 */
const WARMUP_FRAMES = 60;

/**
 * Mede o que a máquina conseguiu enquanto a pessoa digitava — e, tão importante
 * quanto, o que ela chegou a ter permissão de conseguir.
 *
 * **Uma taxa de quadros sozinha não é prova de máquina lenta**, que foi o erro
 * da primeira versão disto. Um painel de 30 Hz reporta 30 fps mantendo o tempo
 * perfeitamente. O mesmo faz um notebook em economia de bateria, porque Chrome
 * e Edge cortam a frequência do callback pela metade ali de propósito, e o mesmo
 * faz o macOS em Low Power Mode. Dizer a qualquer um dos três que o hardware
 * está sofrendo seria a interface inventar um problema e vender a cura.
 *
 * Por isso a amostra é julgada contra si mesma. Ver frame-report.ts para a
 * conta, e para as duas condições que o aviso precisa cumprir antes de aparecer.
 *
 * `deviceMemory` e `hardwareConcurrency` eram o outro instrumento óbvio e são
 * piores que qualquer um: descrevem o hardware, não o hardware rodando esta
 * página neste navegador com esta configuração — e a causa mais comum de uma
 * taxa genuinamente ruim aqui é a aceleração por hardware estar desligada, que
 * nenhuma API de dispositivo reporta.
 *
 * **Nada aqui encosta no caminho crítico da tecla.** Por quadro é uma subtração
 * e um incremento num histograma de tamanho fixo — sem alocação, sem setState.
 * O hook re-renderiza exatamente uma vez, quando a corrida acaba.
 */
export function useFrameRate(active: boolean): FrameReport | null {
  const [report, setReport] = useState<FrameReport | null>(null);
  const buckets = useRef(createHistogram());

  useEffect(() => {
    if (!active) return;

    const histogram = buckets.current;
    histogram.fill(0);

    let frames = 0;
    let warmed = 0;
    let previous = performance.now();
    let startedAt = 0;
    /**
     * Tempo somado só enquanto a aba esteve à vista.
     *
     * O relógio de parede do começo ao fim contaria os minutos em que a página
     * ficou escondida, e com eles uma taxa de quadros que a máquina nunca foi
     * convidada a entregar.
     */
    let visibleMs = 0;
    let watching = true;

    /**
     * O navegador estrangula o requestAnimationFrame numa aba de fundo ou numa
     * janela sem foco — chega a um quadro por segundo, e chega a zero. Esses
     * intervalos não são a máquina falhando, são o navegador economizando, e
     * contá-los como quadro perdido é acusar alguém por ter trocado de aba.
     */
    const pause = () => {
      if (!watching) return;
      watching = false;
      if (startedAt > 0) visibleMs += performance.now() - startedAt;
    };

    const resume = () => {
      if (watching) return;
      watching = true;
      // O primeiro quadro depois da volta traz o buraco inteiro dentro dele.
      previous = performance.now();
      startedAt = previous;
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") pause();
      else resume();
    };

    let frame = requestAnimationFrame(function step(now: number) {
      const delta = now - previous;
      previous = now;

      if (watching) {
        if (warmed < WARMUP_FRAMES) {
          warmed += 1;
          // O relógio da amostra só começa quando o aquecimento termina, senão
          // o fps sairia dividido por um tempo que não foi medido.
          if (warmed === WARMUP_FRAMES) startedAt = now;
        } else {
          frames += 1;
          record(histogram, delta);
        }
      }

      frame = requestAnimationFrame(step);
    });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);

      pause();
      setReport(summarize(histogram, frames, visibleMs));
    };
  }, [active]);

  return report;
}
