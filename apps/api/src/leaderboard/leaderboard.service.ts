import { Injectable, Logger } from '@nestjs/common';
import {
  familyOf,
  PATENTE_DORMANT_DAYS,
  PATENTE_MIN_RUNS,
  tierOf,
  type LeaderboardEntry,
  type LeaderboardQuery,
  type LeaderboardResponse,
  type RankFamily,
} from '@perseus/contracts';
import { PostgresService } from '../db/postgres.service';

const MS_PER_DAY = 86_400_000;

/**
 * Por quanto tempo um board sai da memória antes de ser pedido de novo.
 *
 * Ranking é classificação de corridas de um minuto; ninguém distingue dez
 * segundos de idade de "agora". Curto o bastante pro seu recorde novo aparecer
 * enquanto você ainda está procurando por ele.
 */
const CACHE_MS = 20_000;
/** Teto de boards distintos guardados. Quinze sintaxes vezes cinco modos, e sobe. */
const CACHE_MAX = 200;

type BoardRow = {
  rank: string;
  username: string;
  wpm: string;
  accuracy: string;
  achieved_at: Date;
  wpm_avg: string | null;
  runs_total: number | null;
  last_run_at: Date | null;
};

/**
 * O board, lido do Postgres que a API já usa pro duelo.
 *
 * O que havia aqui antes lia uma função `leaderboard()` por um cliente que
 * precisava de um projeto que este deploy não tem — então o board respondia
 * "desligado" desde sempre, com a implementação inteira pronta atrás. Agora ele
 * lê a mesma conexão em que o duelo escreve, e a única coisa que decide se o
 * ranking existe é haver um `DATABASE_URL`.
 *
 * Não há row-level security no caminho, e não é esquecimento: quem conecta
 * aqui é esta API, como dona, e nenhum navegador fala com este banco. A cerca
 * que a 0001 precisava construir com políticas, aqui é a ausência de uma
 * segunda porta.
 */
@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);
  private readonly cache = new Map<
    string,
    { until: number; response: LeaderboardResponse }
  >();

  constructor(private readonly db: PostgresService) {}

  /**
   * Lê um board, dizendo se é um board ou uma queda.
   *
   * Os caminhos de falha devolvem `unavailable` sem entradas, e não lista
   * vazia. Eram o mesmo valor, e isso fazia a tela dizer "seja o primeiro a
   * pontuar" quando a verdade era "o banco não respondeu" — um convite e um
   * pedido de desculpa dividindo um formato só.
   */
  async read(query: LeaderboardQuery): Promise<LeaderboardResponse> {
    if (!this.db.enabled) return { status: 'unavailable', entries: [] };

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

  /**
   * Em que posição um resultado cai, sem ler o board inteiro.
   *
   * Duas contagens em vez de uma varredura ordenada: é o que deixa a carta de
   * resultado dizer "34º de 210" logo depois de uma corrida, na mesma ida e
   * volta do envio, sem paginar até achar a própria linha.
   */
  async standingOf(
    query: Pick<LeaderboardQuery, 'kind' | 'language' | 'syntax'>,
    wpm: number,
    achievedAt: Date,
  ): Promise<{ position: number; total: number }> {
    if (!this.db.enabled) return { position: 1, total: 0 };
    const key = syntaxKey(query);

    const rows = await this.db.query<{ ahead: string; total: string }>(
      `select
         count(*) filter (
           where b.wpm > $4 or (b.wpm = $4 and b.achieved_at < $5)
         )::text as ahead,
         count(*)::text as total
       from public.player_bests b
       where b.kind = $1 and b.language = $2 and b.syntax_key = $3`,
      [query.kind, query.language, key, wpm, achievedAt.toISOString()],
    );

    const row = rows[0];
    return {
      position: Number(row?.ahead ?? 0) + 1,
      total: Number(row?.total ?? 0),
    };
  }

  /** Esquece os boards que uma corrida nova acabou de tornar desatualizados. */
  invalidate(query: Pick<LeaderboardQuery, 'kind' | 'language' | 'syntax'>): void {
    const prefix = `${query.kind}|${query.language}|${syntaxKey(query)}|`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  private async fetch(query: LeaderboardQuery): Promise<LeaderboardResponse> {
    const since =
      query.windowDays === null
        ? null
        : new Date(Date.now() - query.windowDays * MS_PER_DAY).toISOString();
    const family = familyOf(query.kind);

    try {
      const rows = await this.db.query<BoardRow>(
        `with board as (
           select b.player_id, b.wpm, b.accuracy, b.achieved_at,
                  row_number() over (
                    order by b.wpm desc, b.achieved_at asc
                  )::text as rank
           from public.player_bests b
           where b.kind = $1 and b.language = $2 and b.syntax_key = $3
             and ($4::timestamptz is null or b.achieved_at >= $4)
         )
         select board.rank, p.username::text as username,
                board.wpm, board.accuracy, board.achieved_at,
                pat.wpm_avg, pat.runs_total, pat.last_run_at
         from board
         join public.players p on p.id = board.player_id
         -- Esquerda porque patente é opcional: quem tem recorde e ainda não
         -- tem cinco corridas na família aparece no board sem emblema, que é
         -- uma coisa diferente de não aparecer.
         left join public.player_patentes pat
           on pat.player_id = board.player_id and pat.family = $5
         order by board.wpm desc, board.achieved_at asc
         limit least($6::int, 200)`,
        [
          query.kind,
          query.language,
          syntaxKey(query),
          since,
          family,
          query.limit,
        ],
      );

      return { status: 'ok', entries: rows.map((row) => toEntry(row, family)) };
    } catch (error) {
      // O board é decoração em cima de um treinador que funciona sem ele, então
      // banco fora do ar é logado e reportado como indisponível em vez de
      // lançado — a corrida que a pessoa acabou de fazer não merece um 500.
      this.logger.error(
        `leaderboard read failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: 'unavailable', entries: [] };
    }
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.cache) {
      if (entry.until <= now) this.cache.delete(key);
    }
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
  }
}

function toEntry(row: BoardRow, family: RankFamily): LeaderboardEntry {
  const runs = row.runs_total ?? 0;
  const ranked = runs >= PATENTE_MIN_RUNS && row.last_run_at !== null;
  const age = row.last_run_at ? Date.now() - row.last_run_at.getTime() : 0;

  return {
    rank: Number(row.rank),
    username: row.username,
    wpm: Number(row.wpm),
    accuracy: Number(row.accuracy),
    achievedAt: row.achieved_at.toISOString(),
    tier: ranked ? tierOf(family, Number(row.wpm_avg)) : null,
    // Dormência é sobre a patente, não sobre a linha. A velocidade é fato e
    // fica; o emblema é afirmação sobre hoje, e apaga.
    dormant: ranked && age > PATENTE_DORMANT_DAYS * MS_PER_DAY,
  };
}

/** Só código tem sintaxe. Em prosa a chave é vazia, nunca nula: ver a 0006. */
function syntaxKey(
  query: Pick<LeaderboardQuery, 'kind' | 'syntax'>,
): string {
  if (query.kind !== 'code') return '';
  return query.syntax ?? 'mix';
}

/** Todo campo que delimita o board, e nada mais. */
function cacheKey(query: LeaderboardQuery): string {
  return [
    query.kind,
    query.language,
    syntaxKey(query),
    query.windowDays,
    query.limit,
  ].join('|');
}
