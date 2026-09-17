import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  familyOf,
  LEADERBOARD_MIN_ACCURACY,
  LEADERBOARD_MIN_LENGTH,
  PATENTE_DORMANT_DAYS,
  PATENTE_MIN_RUNS,
  PATENTE_SAMPLE,
  PATENTE_WEIGHT_CAP,
  tierOf,
  type Patente,
  type RankFamily,
  type Standing,
  type SubmitErrorCode,
  type TypingResult,
} from '@perseus/contracts';
import { PostgresService } from '../db/postgres.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';

const UNIQUE_VIOLATION = '23505';
const MS_PER_DAY = 86_400_000;

/** De onde a corrida veio. Duelo pontua pelo mesmo código que o solo. */
export type RunSource = 'solo' | 'duel';

export type RecordOptions = {
  readonly source: RunSource;
  /** O bilhete, quando houve um. Duelo não tem: a sala é o relógio dele. */
  readonly runId: string | null;
  readonly timelineHash: string | null;
  readonly matchId: string | null;
};

type BestRow = { wpm: string; achieved_at: Date };
type PatenteRow = {
  wpm_avg: string;
  runs_total: number;
  last_run_at: Date;
};

/**
 * Onde uma corrida pontuada vira posição e patente.
 *
 * Uma tabela só recebe corrida solo e corrida de duelo, e isso é o ponto que
 * amarra os dois modos: os dois já eram pontuados pelo mesmo
 * `ResultsService.score` — mesmo replay, mesmo julgamento de timeline — e o que
 * faltava era o duelo ter onde contar. Sem isto, quem acabasse de duelar teria
 * que refazer sozinho o que tinha acabado de digitar pra aquilo valer alguma
 * coisa, que é o tipo de trabalho que um produto pede quando duas partes dele
 * não se conhecem.
 *
 * Nada aqui é obrigatório pro treinador. Sem banco, sem passaporte ou sem
 * segredo configurado, a corrida é pontuada e devolvida do mesmo jeito — ela só
 * não classifica ninguém.
 */
@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    private readonly db: PostgresService,
    private readonly boards: LeaderboardService,
  ) {}

  get enabled(): boolean {
    return this.db.enabled;
  }

  /**
   * Guarda a corrida e devolve onde ela deixou a pessoa.
   *
   * Tudo numa transação porque meia corrida classificada é pior que nenhuma:
   * uma linha em `runs` sem o recorde correspondente deixaria o board atrasado
   * em relação ao histórico, e a diferença só apareceria como "eu fiz esse
   * tempo e não subi" — um bug que se manifesta como injustiça.
   */
  async record(
    playerId: string,
    scored: Omit<TypingResult, 'id'>,
    options: RecordOptions,
  ): Promise<Standing | null> {
    if (!this.enabled) return null;

    const family = familyOf(scored.config.kind);
    const syntax =
      scored.config.kind === 'code' ? (scored.config.syntax ?? 'mix') : null;
    const completedAt = new Date(scored.completedAt);
    const ranks = scored.accuracy >= LEADERBOARD_MIN_ACCURACY;
    /**
     * Se esta corrida pode virar recorde. Um texto curto conta como corrida e
     * entra na média da patente; ele só não disputa o board, que é máximo e por
     * isso premiaria quem tirasse mais amostras curtas. Ver LEADERBOARD_MIN_LENGTH.
     */
    const records = ranks && scored.config.length >= LEADERBOARD_MIN_LENGTH;

    let outcome: {
      previousTier: Patente['tier'] | null;
      personalBest: boolean;
      /** O recorde vigente depois desta corrida, ou null se ainda não há um. */
      bestWpm: number | null;
      bestAt: Date;
      patente: Patente | null;
    } | null;

    try {
      outcome = await this.db.transaction(async (run) => {
        const inserted = await run<{ id: string }>(
          `insert into public.runs
             (player_id, config, corpus_version, kind, language, syntax,
              length, keyboard_layout, source, match_id,
              wpm, cpm, raw_wpm, accuracy, consistency, correct, incorrect,
              duration_ms, run_id, timeline_hash, completed_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                   $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
           returning id`,
          [
            playerId,
            JSON.stringify(scored.config),
            scored.corpusVersion,
            scored.config.kind,
            scored.config.language,
            syntax,
            scored.config.length,
            scored.config.keyboardLayout,
            options.source,
            options.matchId,
            scored.wpm,
            scored.cpm,
            scored.rawWpm,
            scored.accuracy,
            scored.consistency,
            scored.correct,
            scored.incorrect,
            scored.durationMs,
            options.runId,
            options.timelineHash,
            completedAt.toISOString(),
          ],
        );
        const runRowId = inserted[0]?.id;
        if (!runRowId) throw new Error('insert returned no id');

        // Corrida abaixo do piso é guardada e não classifica. Guardar mesmo
        // assim é o que faz o histórico pessoal ser o registro do que a pessoa
        // fez, e não só do que deu certo.
        if (!ranks) {
          return {
            previousTier: null,
            personalBest: false,
            bestWpm: null,
            bestAt: completedAt,
            patente: null,
          };
        }

        const syntaxKey = syntax ?? '';
        const previousBest = await run<BestRow>(
          `select wpm, achieved_at from public.player_bests
           where player_id = $1 and kind = $2 and language = $3 and syntax_key = $4`,
          [playerId, scored.config.kind, scored.config.language, syntaxKey],
        );
        const priorWpm = previousBest[0] ? Number(previousBest[0].wpm) : null;
        const personalBest =
          records && (priorWpm === null || scored.wpm > priorWpm);

        const previousPatente = await run<PatenteRow>(
          `select wpm_avg, runs_total, last_run_at
           from public.player_patentes where player_id = $1 and family = $2`,
          [playerId, family],
        );
        const previousTier =
          toPatente(previousPatente[0], family)?.tier ?? null;

        // Texto curto não escreve aqui. A corrida existe, aparece no histórico
        // e entra na patente logo abaixo — ela só não vira a linha que o board
        // compara, porque vinte segundos de digitação e um minuto inteiro não
        // são a mesma prova e o board guarda o melhor de todas as tentativas.
        if (records) {
          await run(
            `insert into public.player_bests
               (player_id, kind, language, syntax_key, wpm, accuracy, run_id, achieved_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8)
             on conflict (player_id, kind, language, syntax_key) do update
               set wpm = excluded.wpm,
                   accuracy = excluded.accuracy,
                   run_id = excluded.run_id,
                   achieved_at = excluded.achieved_at
             -- Só sobe. Recorde que desce com a corrida seguinte não é recorde,
             -- e o board passaria a medir a última tentativa de cada um.
             where excluded.wpm > public.player_bests.wpm`,
            [
              playerId,
              scored.config.kind,
              scored.config.language,
              syntaxKey,
              scored.wpm,
              scored.accuracy,
              runRowId,
              completedAt.toISOString(),
            ],
          );
        }

        // A patente inteira é recalculada a cada corrida em vez de ajustada:
        // ela é a média de uma janela deslizante, então a corrida que entra
        // também empurra uma pra fora, e somar a nova sem subtrair a antiga
        // seria uma média que só sobe.
        //
        // A média é ponderada pelos caracteres que a pessoa de fato acertou, e
        // não simples: uma corrida de noventa caracteres é uma amostra quatro
        // vezes menor que uma de trezentos e sessenta, e contá-las igual fazia
        // a patente medir a velocidade de rajada de quem escolhia o texto
        // curto. Pesada, cada corrida vale o tamanho da prova que ela foi.
        //
        // `correct` e não `length`: `length` é o orçamento que o gerador tentou
        // acertar, e o que importa aqui é quanto de digitação aquela corrida
        // realmente contém.
        //
        // Com teto, e o teto é o que faz a janela e o peso concordarem: a
        // janela conta cinco corridas, o peso conta caracteres, e sem limite
        // uma corrida longa pesava tanto quanto as quatro curtas ao lado dela.
        // Quem corria quatro vezes via a patente parada, segura por uma
        // corrida que já tinha acontecido. Ver PATENTE_WEIGHT_CAP.
        const patente = await run<PatenteRow>(
          `with valid as (
             select wpm, correct, completed_at from public.runs
             where player_id = $1 and family = $2 and accuracy >= $3
           ),
           recent as (
             select wpm, least(correct, $5) as weight
             from valid order by completed_at desc limit $4
           )
           insert into public.player_patentes
             (player_id, family, wpm_avg, runs_total, last_run_at)
           select $1, $2,
                  (select sum(wpm * weight) / nullif(sum(weight), 0)
                     from recent),
                  (select count(*) from valid),
                  (select max(completed_at) from valid)
           where exists (select 1 from valid)
           on conflict (player_id, family) do update
             set wpm_avg = excluded.wpm_avg,
                 runs_total = excluded.runs_total,
                 last_run_at = excluded.last_run_at
           returning wpm_avg, runs_total, last_run_at`,
          [
            playerId,
            family,
            LEADERBOARD_MIN_ACCURACY,
            PATENTE_SAMPLE,
            PATENTE_WEIGHT_CAP,
          ],
        );

        // Sem recorde novo, o recorde é o que já estava lá — inclusive quando
        // esta corrida foi curta demais pra disputar. Null é "não há nenhum",
        // que é diferente de zero e é o que a carta de resultado precisa saber
        // pra não desenhar uma posição de uma linha que não existe.
        const bestWpm = records
          ? Math.max(scored.wpm, priorWpm ?? 0)
          : priorWpm;
        const bestAt =
          personalBest || !previousBest[0]
            ? completedAt
            : previousBest[0].achieved_at;

        return {
          previousTier,
          personalBest,
          bestWpm,
          bestAt,
          patente: toPatente(patente[0], family),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Retentativa depois de resposta perdida, ou segunda aba terminando a
        // mesma corrida. Não é erro de quem digitou.
        throw new ConflictException({
          code: 'duplicate' satisfies SubmitErrorCode,
          message: 'esta corrida já estava guardada',
        });
      }
      // Guardar é o que pode falhar; pontuar já aconteceu. Quem acabou de
      // digitar recebe o resultado, sem posição.
      this.logger.error(
        `could not record run: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }

    if (!outcome || !ranks) return null;

    // Só uma corrida que escreveu em `player_bests` pode ter mudado um board.
    if (outcome.personalBest) this.boards.invalidate(scored.config);
    const board =
      outcome.bestWpm === null
        ? null
        : await this.boards.standingOf(
            scored.config,
            outcome.bestWpm,
            outcome.bestAt,
          );

    return {
      board,
      personalBest: outcome.personalBest,
      patente: outcome.patente,
      previousTier: outcome.previousTier,
    };
  }
}

function toPatente(
  row: PatenteRow | undefined,
  family: RankFamily,
): Patente | null {
  if (!row || row.runs_total < PATENTE_MIN_RUNS) return null;
  const wpm = Number(row.wpm_avg);
  return {
    family,
    tier: tierOf(family, wpm),
    wpm,
    runs: row.runs_total,
    lastRunAt: row.last_run_at.toISOString(),
    dormant:
      Date.now() - row.last_run_at.getTime() >
      PATENTE_DORMANT_DAYS * MS_PER_DAY,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}
