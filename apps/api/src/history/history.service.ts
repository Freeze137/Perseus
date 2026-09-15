import { Injectable, Logger } from '@nestjs/common';
import type {
  HistoryQuery,
  HistoryResponse,
  StoredResult,
} from '@perseus/contracts';
import { LEADERBOARD_MIN_ACCURACY } from '@perseus/contracts';
import { PostgresService } from '../db/postgres.service';

/** As colunas como o Postgres devolve. `numeric` chega como string. */
type RunRow = {
  id: string;
  kind: string;
  language: string;
  syntax: string | null;
  wpm: string;
  cpm: string;
  accuracy: string;
  consistency: string;
  duration_ms: number;
  completed_at: Date;
};

/**
 * Lê pra pessoa as corridas dela.
 *
 * O escopo é o passaporte, e é um limite real que vale dizer em voz alta: quem
 * tem o passaporte lê o histórico daquela identidade. O que antes era garantido
 * por uma política de linha no banco agora é garantido por esta cláusula — e é
 * por isso que o `player_id` vem do cabeçalho conferido, nunca do corpo ou da
 * query. O dia em que alguém aceitar um id vindo do cliente aqui é o dia em que
 * o endpoint entrega o histórico de todo mundo.
 *
 * Toda corrida aparece, inclusive a que não classificou. O histórico é o
 * registro do que a pessoa fez, e esconder a corrida ruim faria a única coisa
 * que o produto se proibiu: bajular.
 */
@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(private readonly db: PostgresService) {}

  async read(
    playerId: string,
    query: HistoryQuery,
  ): Promise<HistoryResponse> {
    if (!this.db.enabled) return { entries: [], best: null };

    try {
      const rows = await this.db.query<RunRow>(
        `select id, kind, language, syntax, wpm, cpm, accuracy, consistency,
                duration_ms, completed_at
         from public.runs
         where player_id = $1 and ($2::text is null or kind = $2)
         order by completed_at desc
         limit $3`,
        [playerId, query.kind ?? null, query.limit],
      );

      // O melhor sai de uma consulta própria e não do topo da lista: a lista é
      // recente-primeiro e limitada, então o recorde de alguém que digita todo
      // dia estaria fora dela na maioria das vezes.
      const best = await this.db.query<{ wpm: string; accuracy: string }>(
        `select wpm, accuracy from public.runs
         where player_id = $1 and ($2::text is null or kind = $2)
           and accuracy >= $3
         order by wpm desc, completed_at asc
         limit 1`,
        [playerId, query.kind ?? null, LEADERBOARD_MIN_ACCURACY],
      );

      return {
        entries: rows.map(toStored),
        best: best[0]
          ? { wpm: Number(best[0].wpm), accuracy: Number(best[0].accuracy) }
          : null,
      };
    } catch (error) {
      this.logger.error(
        `history read failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { entries: [], best: null };
    }
  }
}

function toStored(row: RunRow): StoredResult {
  return {
    id: row.id,
    kind: row.kind as StoredResult['kind'],
    language: row.language as StoredResult['language'],
    syntax: row.syntax as StoredResult['syntax'],
    wpm: Number(row.wpm),
    cpm: Number(row.cpm),
    accuracy: Number(row.accuracy),
    consistency: Number(row.consistency),
    durationMs: row.duration_ms,
    completedAt: row.completed_at.toISOString(),
  };
}
