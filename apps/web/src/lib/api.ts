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

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * The scoring API.
 *
 * Results do not go to Supabase from here. They go through the API, which
 * regenerates the text, replays the timeline and derives the numbers itself —
 * a browser that could write its own wpm straight into the table would make the
 * leaderboard a list of whoever opened the console first.
 *
 * Reads are a different matter and go the same way only for consistency: the
 * board is a database function, and routing it through one place keeps the
 * shape of a board defined once.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /**
     * The machine-readable half of a refusal, when the server sent one.
     *
     * The message is for a log; this is what the interface branches on. A run
     * refused because the tab is a deploy behind needs "reload the page", and a
     * run refused as implausible needs something else entirely — telling them
     * apart from prose would mean reading the server's sentences.
     */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when trying again later could plausibly work. */
  get retryable(): boolean {
    if (this.status === 429 || this.status >= 500) return true;
    // A network failure arrives with no status at all.
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
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  } catch (error) {
    // An unreachable API is not a bug in the payload. Status 0 carries that
    // distinction to the caller, which is what decides whether to try again.
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

  // Parsed on the way in as well as on the way out: a server that changed shape
  // should fail here, loudly, rather than three components later.
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
 * Opens a run with the server, at the moment the first character is typed.
 *
 * The ticket that comes back is what the submission is filed under. It is the
 * server's own identity for this run, which is what makes filing the same run
 * twice impossible and gives the eventual duration a clock to be checked
 * against — see the run ticket service on the API side for what it does and,
 * more usefully, what it does not claim to prove.
 */
export async function startRun(accessToken: string): Promise<RunTicket> {
  return request("/runs", RunTicketSchema, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

/** Your own past runs, newest first, with the best of them alongside. */
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
 * The same rule as the solo path, for the same reason: what goes up is the
 * timeline, and the server decides who won. The live positions that travel
 * during the race are a second, lossy channel that no result is derived from.
 * ------------------------------------------------------------------------- */

/** Opens a room. The seed comes back from the server; it is not asked for. */
export async function createMatch(
  payload: CreateMatch,
): Promise<MatchCredentials> {
  return request("/matches", MatchCredentialsSchema, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** What is behind an invite code, before the visitor commits to a name. */
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

/** The room as this player sees it — what a reloaded tab asks for. */
export async function readMatch(
  id: string,
  token: string,
): Promise<{ match: Match; slot: number }> {
  return request(`/matches/${id}`, MatchSeatSchema, {
    headers: { authorization: `Bearer ${token}` },
  });
}

/**
 * Publishes one caret position.
 *
 * Answered with 204, so it does not go through `request` — there is no body to
 * parse and no schema to check. Failures are swallowed by the caller on
 * purpose: this is the decorative channel, and five of these a second cannot
 * be allowed to interrupt somebody's typing to complain about one of them.
 */
export async function publishProgress(
  id: string,
  token: string,
  index: number,
): Promise<void> {
  await fetch(`${BASE}/matches/${id}/progress`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ index }),
  });
}

/** The finished timeline. Scored server-side, exactly like a solo run. */
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
 * The duels this browser has played.
 *
 * The ids come from local storage rather than from an account, because a duel
 * never asked for one. Losing the browser's storage loses the list, not the
 * duels — the server still has them, and anybody still holding a link can read
 * one back.
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
 * Ends the duel from this side.
 *
 * A duel is two people, so leaving does not free a seat — it closes the room.
 * The server answers with the settled match, which is what the screen renders:
 * the ending is a fact that came back, not one the client drew for itself.
 */
export async function leaveMatch(id: string, token: string): Promise<Match> {
  return request(`/matches/${id}/leave`, MatchSchema, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

/**
 * The event stream for a duel.
 *
 * `EventSource` cannot set headers, so the token rides in the query string —
 * the one place it does. The API redacts it from its own logs; what it is worth
 * is a seat in one ephemeral room, and it dies with the room.
 */
export function matchStreamUrl(id: string, token: string): string {
  return `${BASE}/matches/${id}/stream?token=${encodeURIComponent(token)}`;
}
