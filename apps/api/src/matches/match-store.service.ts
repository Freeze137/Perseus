import { Injectable, Logger } from '@nestjs/common';
import type {
  Language,
  MatchOutcome,
  MatchState,
  MatchSummary,
  SyntaxChoice,
  TextKind,
} from '@perseus/contracts';
import { PostgresService } from '../db/postgres.service';
import type { Room } from './match-registry.service';

/** As colunas como o Postgres devolve. Numeric chega como string. */
type MatchRow = {
  id: string;
  invite_code: string;
  state: string;
  kind: string;
  language: string;
  syntax: string | null;
  finished_at: Date | null;
  winner_slot: number | null;
};

type PlayerRow = {
  match_id: string;
  slot: number;
  display_name: string;
  wpm: string | null;
  cpm: string | null;
  accuracy: string | null;
  consistency: string | null;
  duration_ms: number | null;
  outcome: string | null;
};

/**
 * Onde um duelo terminado vai pra ser lembrado.
 *
 * Só os terminados. Sala que foi aberta e nunca encheu, ou encheu e foi
 * abandonada antes de alguém chegar ao fim, não é escrita — a tabela é o
 * registro dos duelos que aconteceram, e enchê-la com salas que não aconteceram
 * transformaria "quantos duelos eu joguei" numa pergunta sobre gerência de aba.
 *
 * Todo método é seguro de chamar sem banco atrás. O duelo já foi jogado quando
 * qualquer coisa aqui roda, e perder o registro dele é resultado pior do que o
 * duelo falhar seria — mas não é motivo pra derrubar a requisição que acabou de
 * entregá-lo.
 */
@Injectable()
export class MatchStoreService {
  private readonly logger = new Logger(MatchStoreService.name);

  constructor(private readonly db: PostgresService) {}

  get enabled(): boolean {
    return this.db.enabled;
  }

  /**
   * Escreve o duelo e os dois jogadores juntos.
   *
   * Numa transação só porque meio duelo é pior que nenhum: uma linha de partida
   * com um jogador apareceria no histórico de alguém como corrida contra
   * ninguém, e não existe segunda chance de arrumar — a sala já era.
   */
  async save(room: Room): Promise<void> {
    if (!this.db.enabled) return;
    if (room.state !== 'done') return;

    try {
      await this.db.transaction(async (run) => {
        await run(
          `insert into public.matches
             (id, invite_code, state, config, corpus_version, kind, language,
              syntax, created_at, started_at, finished_at, winner_slot)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           on conflict (id) do nothing`,
          [
            // A rodada, não a sala: sala que joga revanche escreve uma segunda
            // linha, e o id da sala colidiria com a primeira.
            room.roundId,
            room.inviteCode,
            room.state,
            JSON.stringify(room.config),
            room.corpusVersion,
            room.config.kind,
            room.config.language,
            room.config.kind === 'code' ? (room.config.syntax ?? 'mix') : null,
            new Date(room.createdAt).toISOString(),
            room.startsAt ? new Date(room.startsAt).toISOString() : null,
            room.finishedAt ? new Date(room.finishedAt).toISOString() : null,
            room.winnerSlot,
          ],
        );

        for (const player of room.players) {
          await run(
            `insert into public.match_players
               (match_id, slot, display_name, joined_at, finished_at,
                wpm, cpm, accuracy, consistency, duration_ms, outcome)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             on conflict (match_id, slot) do nothing`,
            [
              room.roundId,
              player.slot,
              player.displayName,
              new Date(player.joinedAt).toISOString(),
              player.finishedAt
                ? new Date(player.finishedAt).toISOString()
                : null,
              player.score?.wpm ?? null,
              player.score?.cpm ?? null,
              player.score?.accuracy ?? null,
              player.score?.consistency ?? null,
              player.score?.durationMs ?? null,
              player.outcome,
            ],
          );
        }
      });
    } catch (error) {
      // Logado e engolido. O duelo acabou e os dois jogadores têm o resultado
      // na tela; lançar aqui transformaria uma linha de histórico faltando num
      // envio falhado pra quem acabou de chegar em segundo.
      this.logger.error(
        `could not store match ${room.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Lê de volta os duelos que um browser diz serem dele.
   *
   * Não existe conta pra delimitar isto, então os ids são o escopo. É um limite
   * real e vale dizer: quem sabe um id de partida lê aquela partida. O que isso
   * expõe são dois apelidos escolhidos e duas velocidades — a mesma coisa que
   * os dois jogadores já viram — e o id é um uuid que ninguém adivinha.
   */
  async summaries(ids: readonly string[]): Promise<MatchSummary[]> {
    if (!this.db.enabled || ids.length === 0) return [];

    try {
      const matches = await this.db.query<MatchRow>(
        `select id, invite_code, state, kind, language, syntax,
                finished_at, winner_slot
           from public.matches
          where id = any($1::uuid[])
          order by finished_at desc nulls last`,
        [ids],
      );
      if (matches.length === 0) return [];

      const players = await this.db.query<PlayerRow>(
        `select match_id, slot, display_name, wpm, cpm, accuracy,
                consistency, duration_ms, outcome
           from public.match_players
          where match_id = any($1::uuid[])
          order by slot`,
        [matches.map((match) => match.id)],
      );

      return matches.map((match) => ({
        id: match.id,
        inviteCode: match.invite_code,
        kind: match.kind as TextKind,
        language: match.language as Language,
        syntax: match.syntax as SyntaxChoice | null,
        state: match.state as MatchState,
        finishedAt: match.finished_at
          ? new Date(match.finished_at).toISOString()
          : null,
        winnerSlot: match.winner_slot,
        players: players
          .filter((player) => player.match_id === match.id)
          .map((player) => ({
            slot: player.slot,
            displayName: player.display_name,
            score:
              player.wpm === null
                ? null
                : {
                    wpm: Number(player.wpm),
                    cpm: Number(player.cpm ?? 0),
                    accuracy: Number(player.accuracy ?? 0),
                    consistency: Number(player.consistency ?? 0),
                    durationMs: player.duration_ms ?? 0,
                  },
            outcome: player.outcome as MatchOutcome | null,
          })),
      }));
    } catch (error) {
      this.logger.warn(
        `could not read match history: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
