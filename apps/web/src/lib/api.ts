import {
  HistoryResponseSchema,
  LeaderboardResponseSchema,
  MatchCredentialsSchema,
  MatchSchema,
  MatchSummariesResponseSchema,
  RunTicketSchema,
  TypingResultSchema,
  type CreateMatch,
  type HistoryQuery,
  type HistoryResponse,
  type JoinMatch,
  type LeaderboardQuery,
  type LeaderboardResponse,
  type Match,
  type MatchCredentials,
  type MatchSummariesResponse,
  type RunTicket,
  type SubmitMatchRun,
  type SubmitResult,
  type TypingResult,
} from "@perseus/contracts";
import { z } from "zod";

const CONFIGURED_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Onde a API de pontuação está. */
function base(): string {
  return CONFIGURED_BASE;
}

/**
 * A API que pontua.
 *
 * Resultado não vai daqui pro Supabase. Vai pela API, que regera o texto,
 * reproduz a timeline e deriva os números sozinha — um browser que escrevesse o
 * próprio ppm direto na tabela transformaria o ranking numa lista de quem abriu
 * o console primeiro.
 *
 * Leitura é outra história e vai pelo mesmo caminho só por consistência: o
 * ranking é uma função do banco, e passar por um lugar só mantém o formato de
 * um ranking definido uma vez.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /**
     * A metade legível por máquina de uma recusa, quando o servidor mandou uma.
     *
     * A mensagem é pra log; isto é o que a interface ramifica. Corrida recusada
     * porque a aba está um deploy atrás precisa de "recarregue a página", e
     * corrida recusada como implausível precisa de outra coisa inteira —
     * separar as duas pela prosa significaria ler as frases do servidor.
     */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True quando tentar de novo mais tarde tem chance de funcionar. */
  get retryable(): boolean {
    if (this.status === 429 || this.status >= 500) return true;
    // Falha de rede chega sem status nenhum.
    return this.status === 0;
  }
}

async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  init: RequestInit = {},
): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await fetch(`${base()}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  } catch (error) {
    // API inalcançável não é bug no payload. Status 0 leva essa distinção pro
    // chamador, que é quem decide se tenta de novo.
    throw new ApiError(
      error instanceof Error ? error.message : "network request failed",
      0,
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const shape =
      typeof body === "object" && body !== null
        ? (body as { message?: unknown; code?: unknown })
        : {};
    const message =
      shape.message === undefined ? response.statusText : String(shape.message);
    const code = typeof shape.code === "string" ? shape.code : null;
    throw new ApiError(message, response.status, code);
  }

  // Validado na entrada além da saída: servidor que mudou de formato tem que
  // quebrar aqui, alto, e não três componentes depois.
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError("unexpected response shape", 502);
  return parsed.data;
}

const HealthSchema = z.object({
  status: z.string(),
  sync: z.boolean(),
  corpusVersion: z.int(),
});

export async function health() {
  return request("/health", HealthSchema);
}

export async function submitResult(
  payload: SubmitResult,
  accessToken: string,
): Promise<TypingResult> {
  return request("/results", TypingResultSchema, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
}

export async function readLeaderboard(
  query: Partial<LeaderboardQuery>,
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }
  return request(`/leaderboard?${params}`, LeaderboardResponseSchema);
}

/**
 * Abre uma corrida com o servidor, no momento em que o primeiro caractere é
 * digitado.
 *
 * O bilhete que volta é sob o que o envio é arquivado. É a identidade que o
 * servidor dá a esta corrida, e é o que torna impossível arquivar a mesma duas
 * vezes e dá à duração um relógio pra ser conferida — ver o serviço de bilhete
 * do lado da API pra o que ele faz e, mais útil, o que ele não alega provar.
 */
export async function startRun(accessToken: string): Promise<RunTicket> {
  return request("/runs", RunTicketSchema, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

/** Suas corridas passadas, da mais nova, com as melhores ao lado. */
export async function readHistory(
  accessToken: string,
  query: Partial<HistoryQuery> = {},
): Promise<HistoryResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }
  return request(`/results/mine?${params}`, HistoryResponseSchema, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

/* ---------------------------------------------------------------------------
 * Duels
 *
 * Mesma regra do caminho solo, pelo mesmo motivo: o que sobe é a timeline, e o
 * servidor decide quem ganhou. As posições ao vivo que viajam durante a corrida
 * são um segundo canal, que perde pacote, e do qual nenhum resultado sai.
 * ------------------------------------------------------------------------- */

/** Abre uma sala. A semente volta do servidor; não é pedida. */
export async function createMatch(
  payload: CreateMatch,
): Promise<MatchCredentials> {
  return request("/matches", MatchCredentialsSchema, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** O que tem atrás de um código de convite, antes de a pessoa escolher um nome. */
export async function previewMatch(code: string): Promise<Match> {
  return request(`/matches/code/${encodeURIComponent(code)}`, MatchSchema);
}

export async function joinMatch(
  code: string,
  payload: JoinMatch,
): Promise<MatchCredentials> {
  return request(
    `/matches/code/${encodeURIComponent(code)}/join`,
    MatchCredentialsSchema,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

const MatchSeatSchema = z.object({
  match: MatchSchema,
  slot: z.int().min(1).max(2),
});

/** A sala como este jogador a vê — o que uma aba recarregada pede. */
export async function readMatch(
  id: string,
  token: string,
): Promise<{ match: Match; slot: number }> {
  return request(`/matches/${id}`, MatchSeatSchema, {
    headers: { authorization: `Bearer ${token}` },
  });
}

/**
 * Publica uma posição de cursor.
 *
 * Respondido com 204, então não passa pelo `request` — não há corpo pra validar
 * nem schema pra conferir. Falha é engolida por quem chama, de propósito: este
 * é o canal decorativo, e cinco destes por segundo não podem interromper a
 * digitação de alguém pra reclamar de um.
 */
export async function publishProgress(
  id: string,
  token: string,
  index: number,
): Promise<void> {
  await fetch(`${base()}/matches/${id}/progress`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ index }),
  });
}

/** A timeline terminada. Pontuada no servidor, exatamente como corrida solo. */
export async function finishMatch(
  id: string,
  token: string,
  keystrokes: SubmitMatchRun["keystrokes"],
): Promise<Match> {
  return request(`/matches/${id}/finish`, MatchSchema, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ keystrokes } satisfies SubmitMatchRun),
  });
}

/**
 * Os duelos que este browser jogou.
 *
 * Os ids vêm do armazenamento local e não de uma conta, porque duelo nunca
 * pediu uma. Perder o armazenamento do browser perde a lista, não os duelos —
 * o servidor continua com eles, e quem ainda tiver um link lê de volta.
 */
export async function readMatchHistory(
  ids: readonly string[],
): Promise<MatchSummariesResponse> {
  return request("/matches/history", MatchSummariesResponseSchema, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

/**
 * Encerra o duelo deste lado.
 *
 * Duelo é duas pessoas, então sair não libera cadeira — fecha a sala. O
 * servidor responde com a partida resolvida, que é o que a tela desenha: o fim
 * é um fato que voltou, não um que o cliente desenhou sozinho.
 */
export async function leaveMatch(id: string, token: string): Promise<Match> {
  return request(`/matches/${id}/leave`, MatchSchema, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

/**
 * Sorteia outro texto pra sala, e opcionalmente muda o tamanho.
 *
 * É de quem criou, e só no lobby — o servidor garante as duas coisas. Omitir o
 * tamanho mantém o que a sala já tem, que é o que "outro texto" quer dizer
 * quando ninguém mexeu no tamanho.
 */
export async function reseedMatch(
  id: string,
  token: string,
  length?: number,
): Promise<Match> {
  return request(`/matches/${id}/text`, MatchSchema, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(length === undefined ? {} : { length }),
  });
}

/**
 * Pede outra rodada na mesma sala.
 *
 * A resposta é a sala, e qual das duas telas desenhar se lê no estado dela:
 * ainda `done` quer dizer que o outro não pediu, `countdown` quer dizer que
 * pediu e o próximo duelo está começando.
 */
export async function requestRematch(
  id: string,
  token: string,
): Promise<Match> {
  return request(`/matches/${id}/rematch`, MatchSchema, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

/**
 * O stream de eventos de um duelo.
 *
 * `EventSource` não seta header, então o token viaja na query string — o único
 * lugar em que faz isso. A API o esconde dos próprios logs; o que ele vale é
 * uma cadeira numa sala efêmera, e morre junto com a sala.
 */
export function matchStreamUrl(id: string, token: string): string {
  return `${base()}/matches/${id}/stream?token=${encodeURIComponent(token)}`;
}
