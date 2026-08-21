"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  onLeave: () => void;
  /** What the first press offers, before it becomes a confirmation. */
  label?: string;
  disabled?: boolean;
};

/** How long the armed state waits before going back to offering. */
const ARMED_MS = 4_000;

/**
 * Ends the duel, on the second press.
 *
 * The confirmation lives in the button rather than in a dialog. A `confirm()`
 * here would be the platform's grey box over a black screen, stealing focus in
 * the middle of a run and asking a question in a voice that is not this
 * product's — and the thing being confirmed is small enough that a second
 * press says it just as clearly.
 *
 * It disarms itself after a few seconds. An armed button that stays armed is a
 * trap: somebody comes back to the tab, presses what they think is "leave",
 * and has already left.
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
        // The accessible name carries the consequence, because the visible
        // label is short by design and a screen reader hears it out of context.
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
