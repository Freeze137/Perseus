"use client";

import { keyStats, metrics, type Session } from "@perseus/engine";
import { useMemo } from "react";

type Props = {
  session: Session;
  now: number;
};

/** Teclas mostradas na lista de teclas fracas — o bastante pra agir, poucas o bastante pra ler. */
const WEAK_KEYS = 5;

export function LiveStatsPanel({ session, now }: Props) {
  const stats = useMemo(() => metrics(session, now), [session, now]);
  const weak = useMemo(
    () => keyStats(session).filter((key) => key.errors > 0).slice(0, WEAK_KEYS),
    [session],
  );

  return (
    <>
      <dl className="flex flex-col gap-3 text-sm">
        <Row label="Precisão" value={`${Math.round(stats.accuracy)}%`} live />
        <Row label="Acertos" value={String(stats.correct)} />
        <Row label="Erros" value={String(stats.incorrect)} warm={stats.incorrect > 0} />
        <Row label="Consist." value={`${Math.round(stats.consistency)}%`} />
      </dl>

      <div className="rule" />

      <div className="flex flex-col gap-2">
        <h3 className="label">Teclas fracas</h3>
        {weak.length === 0 ? (
          <p className="text-sm text-ash">Nenhum erro nesta sessão.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {weak.map((key) => (
              <li
                key={key.key}
                title={`${key.errors} erro(s) em ${key.typed}`}
                className="min-w-7 rounded-sm bg-slate px-2 py-1 text-center font-mono text-sm text-rust"
              >
                {key.key === " " ? "␣" : key.key}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Row({
  label,
  value,
  live = false,
  warm = false,
}: {
  label: string;
  value: string;
  live?: boolean;
  warm?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ash">{label}</dt>
      <dd
        className={`display text-lg ${
          warm ? "text-rust" : live ? "text-mint" : "text-bone"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
