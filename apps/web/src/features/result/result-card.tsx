'use client';

import type { TextKind } from '@perseus/contracts';
import { keyStats, metrics, type Session } from '@perseus/engine';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { TIERS } from '@perseus/contracts';
import { PatenteMark } from '@/features/identity/patente-mark';
import type { SyncResult } from '@/features/sync/use-result-sync';
import type { FrameReport } from '@/features/settings/use-frame-rate';
import {
  TIERS as PERFORMANCE_TIERS,
  type PerformanceTier,
} from '@/features/settings/performance-tiers';

type Props = {
  session: Session;
  /** Só serve pra dizer o que os números querem dizer — código e prosa não se comparam. */
  kind: TextKind;
  /** Se esta corrida entrou no ranking, e onde ela deixou quem digitou. */
  sync: SyncResult;
  /** O que a máquina de fato conseguiu durante a corrida. Null se não medido. */
  frames: FrameReport | null;
  tier: PerformanceTier;
  /** Desce a interface um nível. Oferecido, nunca tomado. */
  onEase: () => void;
  onRestart: () => void;
  onNewText: () => void;
};

const WEAK_KEYS = 8;

/**
 * Aparece no instante em que o último caractere cai — ninguém devia ter que
 * clicar pra saber como foi. Enter repete o mesmo texto, N sorteia outro.
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
  const { state: syncState, standing } = sync;
  const isCode = kind === 'code';
  const stats = useMemo(() => metrics(session), [session]);
  const weak = useMemo(
    () => keyStats(session).filter((key) => key.errors > 0).slice(0, WEAK_KEYS),
    [session],
  );
  // Oferecido só quando a máquina de fato perdeu frames que a própria tela
  // estava pronta pra dar, e ainda existe um nível mais leve pra onde ir. Um
  // 30 fps firme numa tela de 30 Hz não é problema e nunca é mencionado.
  const struggled = frames !== null && frames.struggling && tier !== 'minimal';
  const nextTier: PerformanceTier = tier === 'full' ? 'light' : 'minimal';

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Enter em cima de um botão pertence ao botão. Sem esta linha, chegar de
      // Tab em "Novo texto" e apertar Enter fazia as duas coisas — o clique e
      // o reinício daqui — e a tela obedecia a um comando que ninguém deu.
      if (event.target instanceof HTMLElement && event.target.closest('button')) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        onRestart();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onRestart, onNewText]);

  return (
    // Anunciado uma vez, no fim — ler métrica em voz alta no meio seria ruído.
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
          <Stat
            label="Consistência"
            value={`${Math.round(stats.consistency)}%`}
            hint={
              <>
                <p>
                  Quanto o seu ritmo variou de um segundo para o outro. 100 é a
                  mesma quantidade de teclas em todo segundo da corrida. Pausa
                  de mais de três segundos sai da conta: ela já custou PPM, e
                  cobrar de novo mediria a interrupção, não a digitação.
                </p>
                <p className="mt-2">
                  <strong className="text-bone">Em código</strong> ela cai
                  quando o texto alterna palavra e símbolo —{' '}
                  <code className="font-mono text-bone">!==</code> custa mais
                  que qualquer letra ao lado dele, e a conta é por segundo.
                </p>
                <p className="mt-2">
                  <strong className="text-bone">No duelo</strong> não vale
                  ponto. Ela diz se a sua velocidade é sua ou foi sorte de um
                  trecho fácil.
                </p>
              </>
            }
          />
          <Stat
            label="CPM"
            value={String(Math.round(stats.cpm))}
            tone={isCode ? 'lead' : 'plain'}
            hint={
              <>
                <p>
                  Caracteres corretos por minuto. A mesma corrida do PPM, sem
                  dividir por cinco. Só o que saiu certo entra, e a indentação
                  automática fica de fora: ela apareceu sozinha.
                </p>
                <p className="mt-2">
                  <strong className="text-bone">Em código</strong> é a régua
                  honesta. O PPM chama cinco caracteres de palavra, uma medida
                  herdada da prosa em inglês, e uma chave que fecha não é um
                  quinto de palavra.
                </p>
                <p className="mt-2">
                  <strong className="text-bone">No duelo</strong> não vale
                  ponto — o servidor compara PPM mesmo quando o texto é código.
                  Os dois sobem pelo mesmo motivo, porque os dois contam só o
                  acerto, mas quem decide a partida é o PPM.
                </p>
              </>
            }
          />
          <Stat
            label="PPM bruto"
            value={String(Math.round(stats.rawWpm))}
            hint={
              <>
                <p>
                  Tudo que você digitou dividido por cinco, por minuto, tecla
                  errada incluída. É a velocidade da mão antes de descontar o
                  preço do erro.
                </p>
                <p className="mt-2">
                  <strong className="text-bone">Em código</strong> costuma abrir
                  mais distância do PPM que em prosa: símbolo erra mais que
                  letra, e cada erro sai da conta que vale.
                </p>
                <p className="mt-2">
                  <strong className="text-bone">No duelo</strong> não vale
                  ponto, e é por isso que ele interessa. A distância entre ele e
                  o seu PPM é exatamente o que os erros cobraram — corrida que
                  você já fez e não levou. Ganha o maior PPM.
                </p>
              </>
            }
          />
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

      {/* Onde esta corrida deixou você.
          Vem na mesma resposta do envio de propósito: uma segunda requisição
          faria a posição chegar depois da tela que ela deveria explicar. */}
      {standing ? (
        <Block delay={120}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <p className="flex items-baseline gap-2">
              <span className="display text-3xl tabular-nums text-bone">
                {standing.position}º
              </span>
              <span className="label">de {standing.total}</span>
            </p>

            {standing.personalBest ? (
              <p className="text-sm text-mint">Seu melhor neste modo.</p>
            ) : null}

            {standing.patente ? (
              <p className="flex items-center gap-3">
                <PatenteMark
                  tier={standing.patente.tier}
                  size={34}
                  state="earned"
                />
                <span className="flex flex-col leading-tight">
                  <span className="text-sm text-bone">
                    {TIERS[standing.patente.tier].star}
                  </span>
                  <span className="font-mono text-xs text-ash">
                    {standing.previousTier &&
                    standing.previousTier !== standing.patente.tier
                      ? `de ${TIERS[standing.previousTier].star}`
                      : `média de ${Math.round(standing.patente.wpm)} ppm`}
                  </span>
                </span>
              </p>
            ) : null}
          </div>
        </Block>
      ) : null}

      {/* Said plainly. A run that failed to sync is still a real run, and
          pretending it was saved would be the one lie this screen could tell. */}
      {syncState === 'idle' || syncState === 'off' ? null : (
        <Block delay={140}>
          <p className="text-sm text-ash">
            {syncState === 'sending' ? 'Enviando para o ranking…' : null}
            {syncState === 'sent' ? 'Resultado registrado no ranking.' : null}
            {/* A queued run is not a lost run, and saying "falhou" about one
                that is sitting safely in fila would be the screen lying in the
                pessimistic direction. */}
            {syncState === 'queued' ? (
              <span>
                Sem conexão com o ranking agora. A corrida ficou guardada e sobe
                sozinha na próxima vez que você abrir o treinador.
              </span>
            ) : null}
            {syncState === 'stale' ? (
              <span>
                Esta aba está uma versão atrás do servidor, que por isso não
                consegue conferir a corrida. Recarregue a página — as próximas
                entram normalmente.
              </span>
            ) : null}
            {syncState === 'failed' ? (
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
                Passar para {PERFORMANCE_TIERS[nextTier].label.toLowerCase()}
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
  hint,
}: {
  label: string;
  value: string;
  /** 'lead' marca o número que de fato importa nesta corrida. */
  tone?: 'plain' | 'warm' | 'lead';
  /** Para o número cujo nome não diz o que ele mede. Acertos e erros dizem. */
  hint?: ReactNode;
}) {
  const colour =
    tone === 'warm' ? 'text-rust' : tone === 'lead' ? 'text-mint' : 'text-bone';
  return (
    <div className="flex flex-col gap-1">
      <dt className="label flex items-center gap-1.5">
        {label}
        {hint ? <Hint term={label}>{hint}</Hint> : null}
      </dt>
      <dd className={`display text-2xl tabular-nums ${colour}`}>
        {value}
      </dd>
    </div>
  );
}
