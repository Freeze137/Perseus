'use client';

import type { TextKind } from '@perseus/contracts';
import { keyStats, metrics, type Session } from '@perseus/engine';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { SyncState } from '@/features/sync/use-result-sync';
import type { FrameReport } from '@/features/settings/use-frame-rate';
import { TIERS, type PerformanceTier } from '@/features/settings/performance-tiers';

type Props = {
  session: Session;
  /** Only used to say what the numbers mean — code and prose do not compare. */
  kind: TextKind;
  /** Whether this run made it onto the board, and honestly when it did not. */
  sync: SyncState;
  /** What the machine actually managed during the run. Null if unmeasured. */
  frames: FrameReport | null;
  tier: PerformanceTier;
  /** Steps the interface down one level. Offered, never taken. */
  onEase: () => void;
  onRestart: () => void;
  onNewText: () => void;
};

const WEAK_KEYS = 8;

/**
 * Shown the instant the last character lands — nobody should have to click to
 * find out how they did. Enter repeats the same text, N draws a new one.
 */
export function ResultCard({
  session,
  kind,
  sync,
  frames,
  tier,
  onEase,
  onRestart,
  onNewText,
}: Props) {
  const isCode = kind === 'code';
  const stats = useMemo(() => metrics(session), [session]);
  const weak = useMemo(
    () => keyStats(session).filter((key) => key.errors > 0).slice(0, WEAK_KEYS),
    [session],
  );
  // Offered only when the machine genuinely missed frames its own display was
  // ready to give it, and there is a lighter level left to move to. A steady
  // 30 fps on a 30 Hz panel is not a problem and is never mentioned.
  const struggled = frames !== null && frames.struggling && tier !== 'minimal';
  const nextTier: PerformanceTier = tier === 'full' ? 'light' : 'minimal';

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        onRestart();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onRestart, onNewText]);

  return (
    // Announced once, at the end — reading metrics aloud mid-run would be noise.
    <section aria-live="polite" className="flex flex-col gap-8">
      <Block delay={0} className="flex items-end gap-8">
        <p className="flex items-baseline gap-2">
          <span className="display text-8xl tabular-nums text-mint">
            {Math.round(stats.wpm)}
          </span>
          <span className="label">ppm</span>
        </p>
        <p className="flex items-baseline gap-2 pb-2">
          <span className="display text-4xl tabular-nums text-bone">
            {Math.round(stats.accuracy)}%
          </span>
          <span className="label">precisão</span>
        </p>
      </Block>

      {/* Said once, in the place where somebody would otherwise compare a code
          run against a prose one and conclude they had got slower. */}
      {isCode ? (
        <Block delay={20}>
          <p className="max-w-prose text-sm leading-relaxed text-ash">
            Em código, prefira o <strong className="text-bone">cpm</strong>. O ppm
            divide por cinco caracteres, uma medida herdada da prosa em inglês —
            e <code className="font-mono text-bone">!==</code> ou uma chave que
            fecha não são um quinto de palavra. A indentação automática também não
            entra na conta: ela apareceu sozinha. Por isso resultados de código
            não disputam o mesmo ranking que texto.
          </p>
        </Block>
      ) : null}

      <Block delay={40}>
        <div className="edge-rule" />
      </Block>

      <Block delay={80}>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-5">
          <Stat label="Consistência" value={`${Math.round(stats.consistency)}%`} />
          <Stat
            label="CPM"
            value={String(Math.round(stats.cpm))}
            tone={isCode ? 'lead' : 'plain'}
          />
          <Stat label="PPM bruto" value={String(Math.round(stats.rawWpm))} />
          <Stat label="Acertos" value={String(stats.correct)} />
          <Stat
            label="Erros"
            value={String(stats.incorrect)}
            tone={stats.incorrect > 0 ? 'warm' : 'plain'}
          />
        </dl>
      </Block>

      <Block delay={120}>
        <div className="flex flex-col gap-2">
          <h3 className="label">Teclas fracas</h3>
          {weak.length === 0 ? (
            <p className="text-sm text-ash">Nenhum erro. Texto limpo do começo ao fim.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {weak.map((key) => (
                <li
                  key={key.key}
                  title={`${key.errors} erro(s) em ${key.typed} tentativa(s)`}
                  className="min-w-7 rounded-sm bg-slate px-2 py-1 text-center font-mono text-sm text-rust"
                >
                  {key.key === ' ' ? '␣' : key.key}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Block>

      {/* Said plainly. A run that failed to sync is still a real run, and
          pretending it was saved would be the one lie this screen could tell. */}
      {sync === 'idle' || sync === 'off' ? null : (
        <Block delay={140}>
          <p className="text-sm text-ash">
            {sync === 'sending' ? 'Enviando para o ranking…' : null}
            {sync === 'sent' ? 'Resultado registrado no ranking.' : null}
            {/* A queued run is not a lost run, and saying "falhou" about one
                that is sitting safely in fila would be the screen lying in the
                pessimistic direction. */}
            {sync === 'queued' ? (
              <span>
                Sem conexão com o ranking agora. A corrida ficou guardada e sobe
                sozinha na próxima vez que você abrir o treinador.
              </span>
            ) : null}
            {sync === 'stale' ? (
              <span>
                Esta aba está uma versão atrás do servidor, que por isso não
                consegue conferir a corrida. Recarregue a página — as próximas
                entram normalmente.
              </span>
            ) : null}
            {sync === 'failed' ? (
              <span className="text-rust">
                Não entrou no ranking desta vez. O resultado acima continua
                valendo — ele foi medido aqui.
              </span>
            ) : null}
          </p>
        </Block>
      )}

      {/* The machine's own report, said the way every other number on this
          screen is said: measured here, stated plainly, with the decision left
          to the person it belongs to. It is not an error and it is not styled
          as one — a slow machine is a fact, and the run above it still counts
          for exactly as much as anybody else's. */}
      {struggled ? (
        <Block delay={150}>
          <div className="flex flex-col gap-2 border-t border-slate pt-3">
            {/* Diz o que foi medido e nada além. A versão anterior anunciava
                "213 de 250 possíveis" com um teto que vinha de intervalos
                arredondados para milissegundos inteiros — numa tela de 240 Hz
                isso inventava 250, e transformava o erro de arredondamento em
                perda. O tempo perdido entra porque é o número que a pessoa
                sentiu; a porcentagem sozinha não diz se foi um susto ou meio
                minuto de imagem que não apareceu. */}
            <p className="max-w-prose text-sm leading-relaxed text-bone">
              Durante esta corrida sua tela manteve{' '}
              <span className="font-mono font-semibold tabular-nums text-rust">
                {frames.ceiling} Hz
              </span>
              , e {Math.round(frames.missed * 100)}% dos quadros não
              acompanharam — {(frames.lostMs / 1000).toFixed(1)} segundos de
              imagem que não apareceu. O resultado acima não foi afetado: ele é
              medido pelo relógio, não pela tela.
            </p>
            {/* Named because it is the likeliest cause and the only one this
                button cannot fix. A machine with software rendering will still
                stutter at 'mínimo', and letting somebody step down twice
                looking for a fix that was never in here would be the interface
                wasting their time politely. */}
            <p className="max-w-prose text-sm leading-relaxed text-ash">
              Vale conferir se a aceleração de hardware está ligada no
              navegador. Desligada, ela derruba o desempenho de qualquer nível
              daqui — e é a causa mais comum quando o aparelho parece capaz.
            </p>
            <div>
              <Button variant="quiet" size="sm" onClick={onEase}>
                Passar para {TIERS[nextTier].label.toLowerCase()}
              </Button>
            </div>
          </div>
        </Block>
      ) : null}

      <Block delay={160} className="flex items-center gap-3">
        <Button variant="edge" size="md" onClick={onRestart}>
          ⏎ Repetir mesmo texto
        </Button>
        <Button variant="ghost" size="md" onClick={onNewText}>
          Novo texto
        </Button>
      </Block>
    </section>
  );
}

function Block({
  delay,
  className = '',
  children,
}: {
  delay: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`result-block ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: string;
  /** 'lead' marks the figure that actually matters for this run. */
  tone?: 'plain' | 'warm' | 'lead';
}) {
  const colour =
    tone === 'warm' ? 'text-rust' : tone === 'lead' ? 'text-mint' : 'text-bone';
  return (
    <div className="flex flex-col gap-1">
      <dt className="label">{label}</dt>
      <dd className={`display text-2xl tabular-nums ${colour}`}>
        {value}
      </dd>
    </div>
  );
}
