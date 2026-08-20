import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';
import { loadEnv, type Env } from '../config';

/**
 * The connection duels are written down over. Optional, and that is the point.
 *
 * Everything about a duel that matters while it is being played lives in this
 * process's memory: the room, the two players, the clock, the fan-out. This
 * only outlives it. So an API without DATABASE_URL still hosts duels end to
 * end — two friends can race on a laptop with nothing installed — and what is
 * missing is the history afterwards, which the interface says plainly rather
 * than pretending the feature is off.
 *
 * Plain Postgres rather than the Supabase client. There are no accounts in a
 * duel and no row-level policies to sit inside, so the service-role client
 * would be a heavier way to say the same thing — and this way the database can
 * be a container on a laptop or a box on a VM without either end noticing.
 */
@Injectable()
export class PostgresService implements OnModuleDestroy {
  private readonly logger = new Logger(PostgresService.name);
  private readonly env: Env = loadEnv();
  private readonly pool: Pool | null;

  constructor() {
    this.pool = this.env.DATABASE_URL
      ? new Pool({
          connectionString: this.env.DATABASE_URL,
          // Small on purpose. The whole workload is a couple of writes at the
          // end of a duel and one read when somebody opens their history; a
          // large pool here would be idle sockets against a free-tier box.
          max: 5,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          ssl: this.env.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
        })
      : null;

    if (!this.pool) {
      this.logger.warn(
        'DATABASE_URL not set — duels still run, but finished ones are not stored.',
      );
      return;
    }

    // A pool error with no listener takes the process down, and the errors it
    // emits are the ordinary ones: a database restart, a dropped idle socket.
    // Neither is a reason to stop serving a trainer that works offline.
    this.pool.on('error', (error: Error) => {
      this.logger.warn(`idle connection error: ${error.message}`);
    });
  }

  get enabled(): boolean {
    return this.pool !== null;
  }

  /**
   * Runs a statement and hands back the rows.
   *
   * Callers check `enabled` first: this returns an empty result rather than
   * throwing when there is no database, because every caller here is a write
   * that is allowed to be missing or a read that is allowed to be empty. A
   * duel is not lost because its record could not be filed.
   */
  async query<T extends QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    if (!this.pool) return [];
    const result = await this.pool.query<T>(text, params as unknown[]);
    return result.rows;
  }

  /** One connection, for the statements that have to land together. */
  async transaction<T>(
    work: (
      run: <R extends QueryResultRow>(
        text: string,
        params?: readonly unknown[],
      ) => Promise<R[]>,
    ) => Promise<T>,
  ): Promise<T | null> {
    if (!this.pool) return null;
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const value = await work(
        async <R extends QueryResultRow>(
          text: string,
          params: readonly unknown[] = [],
        ) => {
          const result = await client.query<R>(text, params as unknown[]);
          return result.rows;
        },
      );
      await client.query('commit');
      return value;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Whether the database is answering, as opposed to configured. */
  async reachable(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.query('select 1');
      return true;
    } catch (error) {
      this.logger.warn(
        `database probe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
