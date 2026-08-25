import { Injectable, Logger } from '@nestjs/common';
import type {
  HistoryQuery,
  HistoryResponse,
  StoredResult,
} from '@perseus/contracts';
import { z } from 'zod';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * A linha como a tabela guarda, lida em vez de suposta.
 *
 * Coluna numérica volta como string do PostgREST — `numeric` tem mais precisão
 * do que um número JSON promete — então é convertida aqui em vez de virar
 * calada um `"91.20"` três componentes depois.
 */
const RowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['words', 'quote', 'punctuation', 'numbers', 'code']),
  language: z.enum(['pt-BR', 'en']),
  syntax: z.string().nullable(),
  wpm: z.coerce.number(),
  cpm: z.coerce.number(),
  accuracy: z.coerce.number(),
  consistency: z.coerce.number(),
  duration_ms: z.coerce.number().int(),
  completed_at: z.string(),
});

/**
 * Lê pra pessoa as corridas dela.
 *
 * Pelo token de quem chamou, nunca pela chave de serviço: a política de linha
 * que diz "suas linhas e de mais ninguém" já está escrita e já é testada pelo
 * banco, e reimplementá-la aqui como um `where user_id = ...` faria o dia em
 * que alguém esquecer essa cláusula ser o dia em que o endpoint entrega o
 * histórico de todo mundo. A política é a checagem; isto só pergunta.
 */
@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async read(
    accessToken: string,
    query: HistoryQuery,
  ): Promise<HistoryResponse> {
    if (!this.supabase.enabled) return { entries: [], best: null };

    let request = this.supabase
      .asCaller(accessToken)
      .from('results')
      .select(
        'id, kind, language, syntax, wpm, cpm, accuracy, consistency, duration_ms, completed_at',
      )
      .order('completed_at', { ascending: false })
      .limit(query.limit);

    if (query.kind) request = request.eq('kind', query.kind);

    const { data, error } = await request;
    if (error) {
      this.logger.error(`history read failed: ${error.message}`);
      return { entries: [], best: null };
    }

    const rows = z.array(RowSchema).safeParse(data ?? []);
    if (!rows.success) {
      this.logger.error(
        `history shape changed: ${z.prettifyError(rows.error)}`,
      );
      return { entries: [], best: null };
    }

    const entries: StoredResult[] = rows.data.map((row) => ({
      id: row.id,
      kind: row.kind,
      language: row.language,
      syntax: row.syntax as StoredResult['syntax'],
      wpm: row.wpm,
      cpm: row.cpm,
      accuracy: row.accuracy,
      consistency: row.consistency,
      durationMs: row.duration_ms,
      completedAt: new Date(row.completed_at).toISOString(),
    }));

    return { entries, best: bestOf(entries) };
  }
}

/**
 * A melhor corrida da janela, por velocidade.
 *
 * Derivada das linhas que já foram buscadas em vez de pedida à parte: uma
 * segunda query por um número é uma segunda ida e volta, e "melhor do que você
 * está olhando" é o que alguém lendo um histórico quer dizer com melhor.
 */
function bestOf(entries: readonly StoredResult[]): HistoryResponse['best'] {
  const top = entries.reduce<StoredResult | null>(
    (best, entry) => (best === null || entry.wpm > best.wpm ? entry : best),
    null,
  );
  return top === null ? null : { wpm: top.wpm, accuracy: top.accuracy };
}
