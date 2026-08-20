import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv, type Env } from '../config';

/**
 * Whatever `createClient` hands back, named.
 *
 * Spelled as the factory's own return type rather than as `SupabaseClient`: the
 * two differ in their default generic parameters, and pinning it to the factory
 * means a client library upgrade cannot quietly widen this to `any`.
 */
type CallerClient = ReturnType<typeof createClient>;

/** How long a verified token is trusted without asking Supabase again. */
const TOKEN_CACHE_MS = 60_000;
/** Ceiling on the token cache, so it cannot be grown without bound. */
const TOKEN_CACHE_MAX = 5_000;

/**
 * The one place that holds the service-role key.
 *
 * `admin` bypasses row-level security and is used only for writes the server
 * has already validated and for calling `leaderboard()`, which is the one
 * deliberate opening in the policies.
 *
 * `asCaller` is the opposite tool: a client carrying the caller's own token, so
 * the database applies their policies. Anything reading a person's own rows
 * goes through it. The rule that decides between the two is simple — if the
 * answer is "the rows that belong to whoever is asking", the database should be
 * the one enforcing that, not this process.
 */
@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly env: Env = loadEnv();
  private readonly client: SupabaseClient | null;
  /** token → (user id, when the answer goes stale). */
  private readonly tokens = new Map<
    string,
    { userId: string; until: number }
  >();

  constructor() {
    this.client =
      this.env.SUPABASE_URL && this.env.SUPABASE_SERVICE_ROLE_KEY
        ? createClient(
            this.env.SUPABASE_URL,
            this.env.SUPABASE_SERVICE_ROLE_KEY,
            {
              auth: { persistSession: false, autoRefreshToken: false },
            },
          )
        : null;

    if (!this.client) {
      this.logger.warn(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — results sync and the leaderboard are disabled.',
      );
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** Full access. Only for writes the server has verified itself. */
  admin(): SupabaseClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'sync is not configured on this server',
      );
    }
    return this.client;
  }

  /**
   * A client that acts as the caller, inside their own row-level policies.
   *
   * Built per request rather than cached: it carries one person's credentials,
   * and a cached one is a cross-user data leak waiting for a stale entry.
   */
  asCaller(accessToken: string): CallerClient {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ServiceUnavailableException(
        'sync is not configured on this server',
      );
    }
    const client: CallerClient = createClient(
      this.env.SUPABASE_URL,
      // The anon key would do here too; what decides the permissions is the
      // Authorization header below, which puts the request inside the policies
      // regardless of which key opened the connection.
      this.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      },
    );
    return client;
  }

  /**
   * Resolves a bearer token to a user id, or null if it is not a valid one.
   *
   * Answers are held for a minute. Every authenticated request used to cost a
   * round trip to Supabase before it could begin — on submit, in front of a
   * database write, doubling the latency of the one call that matters. A minute
   * is short enough that a revoked session stops working while somebody is
   * still looking at the screen, and long enough that a burst of requests from
   * one person costs one verification.
   */
  async userIdFrom(accessToken: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.tokens.get(accessToken);
    if (cached && cached.until > now) return cached.userId;

    const { data, error } = await this.admin().auth.getUser(accessToken);
    if (error || !data.user) {
      // Failures are not cached: a token that just failed because Supabase
      // hiccuped should get another chance on the next request, and caching a
      // "no" would turn one bad moment into a minute of them.
      this.tokens.delete(accessToken);
      return null;
    }

    if (this.tokens.size >= TOKEN_CACHE_MAX) this.sweepTokens(now);
    this.tokens.set(accessToken, {
      userId: data.user.id,
      until: now + TOKEN_CACHE_MS,
    });
    return data.user.id;
  }

  /**
   * Whether the database is actually answering, as opposed to configured.
   *
   * `enabled` says credentials exist. This says a query completes — the
   * distinction a readiness probe is for.
   */
  async reachable(): Promise<boolean> {
    if (!this.client) return false;
    const { error } = await this.client
      .from('profiles')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    if (error) {
      this.logger.warn(`database probe failed: ${error.message}`);
      return false;
    }
    return true;
  }

  private sweepTokens(now: number): void {
    for (const [token, entry] of this.tokens) {
      if (entry.until <= now) this.tokens.delete(token);
    }
    // Still full of live entries: drop the lot rather than grow forever. The
    // cost is one round trip per caller, once.
    if (this.tokens.size >= TOKEN_CACHE_MAX) this.tokens.clear();
  }
}
