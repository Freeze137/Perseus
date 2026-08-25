import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CORPUS_VERSION,
  LEADERBOARD_MIN_ACCURACY,
  TIMELINE_LIMITS,
  type SubmitErrorCode,
  type SubmitResult,
  type TypingResult,
} from '@perseus/contracts';
import { generate } from '@perseus/corpus';
import {
  checkTimeline,
  isFinished,
  metrics,
  replay,
  ReplayError,
} from '@perseus/engine';
import { SupabaseService } from '../supabase/supabase.service';
import { RunTicketService } from '../runs/run-ticket.service';

/** Código de violação de unicidade do Postgres. É como chega um envio repetido. */
const UNIQUE_VIOLATION = '23505';

/**
 * O que o servidor sabe sobre quando a corrida aconteceu de verdade.
 *
 * O timestamp do bilhete é o relógio do próprio servidor; `now` é o relógio do
 * servidor no envio. Entre os dois eles limitam quanto tempo pode ter passado
 * enquanto a digitação acontecia, que é a única parte da timeline do cliente
 * que dá pra checar contra algo que o cliente não controla.
 */
export type RunAnchor = { readonly issuedAt: number; readonly now: number };

/**
 * Tudo que a pontuação lê de verdade: um texto pra regerar e uma timeline pra
 * reproduzir contra ele.
 *
 * Mais estreito que SubmitResult de propósito. Duelo é pontuado por exatamente
 * este código e não tem bilhete pra oferecer — a sala é o que lhe dá identidade
 * e relógio — então a assinatura diz o que o trabalho precisa em vez de nomear
 * o único chamador que por acaso carrega mais.
 */
export type Scoreable = Pick<
  SubmitResult,
  'config' | 'corpusVersion' | 'keystrokes'
>;

/**
 * O portão entre uma alegação e um registro.
 *
 * Envio é timeline, não pontuação. Isto regera o texto que a corrida deveria
 * estar digitando, reproduz a timeline contra ele e deriva os números aqui.
 * Tudo que o cliente acreditava sobre a própria velocidade é jogado fora na
 * entrada — que é o único motivo pelo qual um ranking compartilhado vale ser
 * mostrado pra alguém.
 *
 * Reproduzir prova os caracteres. Não diz nada sobre o relógio, e o relógio
 * continua sendo do cliente: o `checkTimeline` é o que fica entre um replay
 * correto e qualquer velocidade que o falsificador queira. Nenhum dos dois
 * distingue um script paciente digitando em ritmo humano de um humano, e
 * nenhum arranjo destas checagens distinguiria — isso é propriedade do
 * problema, não buraco no código.
 */
@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly tickets: RunTicketService,
  ) {}

  async submit(userId: string, payload: SubmitResult): Promise<TypingResult> {
    const now = Date.now();
    const ticket = this.tickets.verify(payload.run, now);
    if (!ticket.ok) throw refuse('run_ticket', ticket.reason);

    const scored = this.score(payload, { issuedAt: ticket.issuedAt, now });

    const { data, error } = await this.supabase
      .admin()
      .from('results')
      .insert({
        user_id: userId,
        run_id: payload.run.id,
        // Duas corridas do mesmo texto na mesma velocidade são possíveis; a
        // mesma timeline no milissegundo é uma gravação sendo arquivada duas vezes.
        timeline_hash: timelineHash(userId, payload),
        config: payload.config,
        corpus_version: payload.corpusVersion,
        kind: payload.config.kind,
        language: payload.config.language,
        syntax:
          payload.config.kind === 'code'
            ? (payload.config.syntax ?? 'mix')
            : null,
        wpm: scored.wpm,
        cpm: scored.cpm,
        raw_wpm: scored.rawWpm,
        accuracy: scored.accuracy,
        consistency: scored.consistency,
        correct: scored.correct,
        incorrect: scored.incorrect,
        duration_ms: scored.durationMs,
        completed_at: scored.completedAt,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        // Não é erro causado por quem digitou: uma retentativa depois de
        // resposta perdida cai aqui, e uma segunda aba terminando a mesma
        // corrida também.
        throw new ConflictException({
          code: 'duplicate' satisfies SubmitErrorCode,
          message: 'this run was already stored',
        });
      }
      this.logger.error(`insert failed: ${error.message}`);
      throw new BadRequestException('could not store the result');
    }

    return { id: data.id as string, ...scored };
  }

  /**
   * Reproduz, julga e pontua um envio. Pura — sem banco, então é a parte que dá
   * pra testar sem um.
   *
   * `anchor` é opcional pra pontuação poder ser exercitada sozinha, mas o
   * caminho HTTP sempre passa: sem ele o único relógio na sala é o que quem
   * enviou escreveu.
   */
  score(payload: Scoreable, anchor?: RunAnchor): Omit<TypingResult, 'id'> {
    // Corpus antigo produz texto diferente pra mesma semente, então envio que
    // alega uma versão que este build não regera não dá pra verificar. É
    // recusado em vez de guardado contra texto que ninguém reproduz.
    if (payload.corpusVersion !== CORPUS_VERSION) {
      throw new BadRequestException({
        code: 'corpus_version' satisfies SubmitErrorCode,
        message: `corpus version ${payload.corpusVersion} cannot be verified by this server (expected ${CORPUS_VERSION})`,
        expected: CORPUS_VERSION,
      });
    }

    const target = generate(payload.config);
    if (target.length === 0) {
      throw refuse('invalid_timeline', 'that config produces no text');
    }

    let session;
    try {
      session = replay(
        target,
        // `correct` é preenchido pelo replay contra o alvo de verdade.
        payload.keystrokes.map((k) => ({ ...k, correct: false })),
        { autoIndent: payload.config.kind === 'code' },
      );
    } catch (error) {
      if (error instanceof ReplayError)
        throw refuse('invalid_timeline', error.message);
      throw error;
    }

    if (!isFinished(session)) {
      throw refuse(
        'invalid_timeline',
        'the run did not reach the end of the text',
      );
    }

    // Julgado antes de pontuado. Derivar números de uma timeline que mão
    // nenhuma produziu e só depois decidir o que fazer com eles deixaria a
    // decisão a cargo dos números que por acaso saíram.
    const verdict = checkTimeline(session.keystrokes, TIMELINE_LIMITS);
    if (!verdict.ok) throw refuse('implausible', verdict.reason);

    const stats = metrics(session, session.finishedAt ?? 0);
    if (!Number.isFinite(stats.wpm) || stats.elapsedMs <= 0) {
      throw refuse('implausible', 'the timeline has no duration');
    }

    if (anchor) {
      // A única checagem que o cliente não escreve como contornar: seja como
      // for que a timeline esteja vestida, a corrida não pode ter durado mais
      // que o relógio de parede que este servidor observou entre entregar o
      // bilhete e receber o resultado.
      const watched = anchor.now - anchor.issuedAt;
      if (stats.elapsedMs > watched + TIMELINE_LIMITS.clockSlackMs) {
        throw refuse(
          'implausible',
          'the run claims more time than passed since it started',
        );
      }
    }

    return {
      config: payload.config,
      corpusVersion: payload.corpusVersion,
      wpm: round(stats.wpm),
      cpm: round(stats.cpm),
      rawWpm: round(stats.rawWpm),
      accuracy: round(stats.accuracy),
      consistency: round(stats.consistency),
      correct: stats.correct,
      incorrect: stats.incorrect,
      durationMs: Math.round(stats.elapsedMs),
      // O momento em que o servidor aceitou, não um momento que o cliente
      // nomeou. Hora de conclusão escolhida pelo cliente é posição escolhida
      // pelo cliente no ranking do dia.
      completedAt: new Date().toISOString(),
    };
  }

  /** Se uma corrida pontuada é boa o bastante pra aparecer no ranking. */
  static ranks(result: Pick<TypingResult, 'accuracy'>): boolean {
    return result.accuracy >= LEADERBOARD_MIN_ACCURACY;
  }
}

function refuse(code: SubmitErrorCode, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

/**
 * A impressão digital da corrida em si, no escopo do dono.
 *
 * O id do usuário está dentro do hash pra duas pessoas que por acaso produzam a
 * mesma timeline — texto curto, ritmo idêntico — não se bloquearem, enquanto
 * uma pessoa reenviando a própria gravação colide com ela mesma.
 */
function timelineHash(userId: string, payload: SubmitResult): string {
  const timeline = payload.keystrokes
    .map((k) => `${k.index}:${k.at}:${k.char}`)
    .join('|');
  return createHash('sha256')
    .update(`${userId}|${JSON.stringify(payload.config)}|${timeline}`)
    .digest('hex');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
