import { z } from 'zod';

/**
 * Environment, parsed once at boot.
 *
 * The service-role key bypasses row-level security, which is exactly why the
 * API holds it and the browser never does: the browser gets the anon key and
 * lives inside the policies. If this file ever ends up imported from client
 * code, that is the bug.
 *
 * Sync is optional. Without Supabase configured the app still runs — the typing
 * trainer works offline and always has — so a missing key degrades the ranking
 * rather than taking the process down.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  /** Origins allowed to call this API. Comma separated. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  /**
   * Signs run tickets. Optional so local work needs no setup; without it the
   * process signs with a secret it invents at boot, which means a restart
   * invalidates every run somebody had open. Set it anywhere with more than one
   * instance or more than one deploy a day.
   */
  RUN_TICKET_SECRET: z.string().min(32).optional(),
  /**
   * Postgres, for duels. Optional, like everything else that talks to a
   * database here: without it a duel still runs end to end — the room lives in
   * this process's memory — and only the history outlives the room.
   *
   * Deliberately a separate connection from Supabase rather than the same
   * project's pooler. A duel needs no accounts and no row-level security, so it
   * needs none of what the service-role client is for, and pointing it at a
   * plain Postgres box is a one-line change instead of a migration.
   */
  DATABASE_URL: z.string().min(12).optional(),
  /**
   * Whether to negotiate TLS to that database. Off by default because the
   * common shape is Postgres on the same host as the API, over the loopback,
   * where TLS is ceremony. Turn it on for anything the traffic leaves the box
   * to reach.
   */
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * How many proxies sit in front of this. Rate limiting counts callers by
   * address, and behind a load balancer every address is the balancer's unless
   * Express is told how far back to look.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
  /**
   * Body ceiling. A 2 000-character code run is around 90 KB of timeline, and
   * Express defaults to 100 KB — close enough that the longest honest runs were
   * one correction away from a 413 nobody would have understood.
   */
  MAX_BODY_SIZE: z.string().default('512kb'),
});

export type Env = z.infer<typeof EnvSchema> & {
  syncEnabled: boolean;
  /** Whether finished duels are written down rather than only played. */
  matchHistoryEnabled: boolean;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Failing at boot beats failing on the first request that needs the value.
    throw new Error(`invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  return {
    ...env,
    syncEnabled: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    matchHistoryEnabled: Boolean(env.DATABASE_URL),
  };
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
