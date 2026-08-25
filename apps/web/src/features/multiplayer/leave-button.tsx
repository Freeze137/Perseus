"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  onLeave: () => void;
  /** O que o primeiro aperto oferece, antes de virar confirmação. */
  label?: string;
  disabled?: boolean;
};

/** Quanto o estado armado espera antes de voltar a oferecer. */
const ARMED_MS = 4_000;

/**
 * Encerra o duelo, no segundo aperto.
 *
 * A confirmação mora no botão e não num diálogo. Um `confirm()` aqui seria a
 * caixa cinza da plataforma sobre uma tela preta, roubando foco no meio de uma
 * corrida e fazendo uma pergunta numa voz que não é a deste produto — e o que
 * está sendo confirmado é pequeno o bastante pra um segundo aperto dizer com a
 * mesma clareza.
 *
 * Ele se desarma sozinho depois de alguns segundos. Botão armado que continua
 * armado é armadilha: a pessoa volta pra aba, aperta o que acha que é "sair", e
 * já saiu.
 */
export function LeaveButton({
  onLeave,
  label = "Encerrar duelo",
  disabled = false,
}: Props) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!armed) return;
    timer.current = window.setTimeout(() => setArmed(false), ARMED_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [armed]);

  const press = useCallback(() => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onLeave();
  }, [armed, onLeave]);

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="quiet"
        size="sm"
        onClick={press}
        disabled={disabled}
        // O nome acessível carrega a consequência, porque o rótulo visível é
        // curto por desenho e um leitor de tela o ouve fora de contexto.
        aria-label={
          armed ? "Confirmar: encerrar o duelo para os dois" : label
        }
        data-armed={armed}
        className="data-[armed=true]:text-rust"
      >
        {armed ? "Encerrar mesmo?" : label}
      </Button>

      {/* Said only while it matters. A permanent warning about a button nobody
          pressed is noise the rest of the time. */}
      {armed ? (
        <span aria-live="polite" className="text-xs text-ash">
          Acaba para os dois
        </span>
      ) : null}
    </span>
  );
}
