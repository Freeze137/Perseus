import { Injectable, Logger } from '@nestjs/common';
import type {
  LeaderboardEntry,
  LeaderboardQuery,
  LeaderboardResponse,
} from '@perseus/contracts';
import { z } from 'zod';
import { SupabaseService } from '../supabase/supabase.service';

const MS_PER_DAY = 86_400_000;
/**
 * Por quanto tempo o ranking sai da memória antes de ser pedido de novo.
 *
 * Ranking é uma classificação de corridas de um minuto cada; ninguém distingue
 * dez segundos de idade de atual, e cada gaveta aberta era um `distinct on`
 * novo sobre a tabela inteira de resultados. Curto o bastante pro seu recorde
 * novo aparecer enquanto você ainda está procurando por ele.
 */
const CACHE_MS = 20_000;
/** Teto de rankings distintos guardados. Quinze sintaxes vezes cinco modos, e sobe. */
const CACHE_MAX = 200;

/**
 * O formato que a função do banco devolve, lido em vez de suposto.
 *
 * `rpc()` é tipado `any` — o cliente não tem como saber o que uma função SQL
 * escrita à mão devolve — e um `any` que saísse deste arquivo levaria junto a
 * segurança de tipo de tudo pra frente. Ler aqui transforma um desvio de schema
 * em erro na fronteira, em vez de número errado no ranking.
 */
const RowSchema = z.object({
  rank: z.coerce.number().int(),
  username: z.string(),
  wpm: z.coerce.number(),
  accuracy: z.coerce.number(),
  achieved_at: z.string(),
});

/**
 * Lê o ranking pela função do banco, não pela tabela.
 *
 * A tabela é fechada por row-level security — você lê os seus resultados e os
 * de mais ninguém — e isso vale manter. A função é a única abertura deliberada:
 * devolve um nome, uma velocidade e uma data, e nenhum caminho de volta às
 * corridas individuais de quem quer que seja.
 */
@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);
  private readonly cache = new Map<
    string,
    { until: number; response: LeaderboardResponse }
  >();

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Lê um ranking, dizendo se é um ranking ou uma queda.
   *
   * Os caminhos de falha devolvem `unavailable` sem entradas, não lista vazia.
   * Eram o mesmo valor, e isso fazia a tela dizer "seja o primeiro a pontuar"
   * quando a verdade era "o banco não respondeu" — um convite e um pedido de
   * desculpa dividindo um formato só.
   */
  async read(query: LeaderboardQuery): Promise<LeaderboardResponse> {
    if (!this.supabase.enabled) return { status: 'ok', entries: [] };

    const key = cacheKey(query);
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.until > now) return cached.response;

    const response = await this.fetch(query);
    // Queda não é cacheada: o próximo leitor tem que descobrir que voltou.
    if (response.status === 'ok') {
      if (this.cache.size >= CACHE_MAX) this.sweep(now);
      this.cache.set(key, { until: now + CACHE_MS, response });
    }
    return response;
  }

  private async fetch(query: LeaderboardQuery): Promise<LeaderboardResponse> {
    const since =
      query.windowDays === null
        ? null
        : new Date(Date.now() - query.windowDays * MS_PER_DAY).toISOString();

    const response: { data: unknown; error: { message: string } | null } =
      await this.supabase.admin().rpc('leaderboard', {
        p_kind: query.kind,
        p_language: query.language,
        // Só código tem sintaxe; pedir uma num ranking de prosa devolveria
        // nada em vez de tudo, que é o tipo errado de vazio.
        p_syntax: query.kind === 'code' ? query.syntax : null,
        p_since: since,
        p_limit: query.limit,
      });

    if (response.error) {
      this.logger.error(`leaderboard read failed: ${response.error.message}`);
      return { status: 'unavailable', entries: [] };
    }

    const rows = z.array(RowSchema).safeParse(response.data ?? []);
    if (!rows.success) {
      // O ranking é decoração em cima de um treinador que funciona sem ele,
      // então formato que não dá pra ler é logado e reportado como indisponível
      // em vez de lançado — a corrida que a pessoa acabou de fazer não merece
      // um 500.
      this.logger.error(
        `leaderboard shape changed: ${z.prettifyError(rows.error)}`,
      );
      return { status: 'unavailable', entries: [] };
    }

    const entries: LeaderboardEntry[] = rows.data.map((row) => ({
      rank: row.rank,
      username: row.username,
      wpm: row.wpm,
      accuracy: row.accuracy,
      achievedAt: new Date(row.achieved_at).toISOString(),
    }));
    return { status: 'ok', entries };
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.cache) {
      if (entry.until <= now) this.cache.delete(key);
    }
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
  }
}

/** Todo campo que delimita o ranking, e nada mais. */
function cacheKey(query: LeaderboardQuery): string {
  const syntax = query.kind === 'code' ? (query.syntax ?? 'mix') : '';
  return [
    query.kind,
    query.language,
    syntax,
    query.windowDays,
    query.limit,
  ].join('|');
}
