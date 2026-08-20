import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CORPUS_VERSION } from '@perseus/contracts';
import { PostgresService } from '../db/postgres.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly postgres: PostgresService,
  ) {}

  /**
   * Says what this build can actually do, not just that it is up.
   *
   * `sync` is what the web app reads to decide whether to offer sign-in at all:
   * an API running without database credentials is a perfectly good API for a
   * trainer that works offline, and the UI should reflect that rather than
   * offering a button that fails.
   *
   * This answers from memory. It is the liveness probe — "is this process
   * serving" — and a liveness probe that touches the database restarts a
   * perfectly healthy API every time the database has a bad minute.
   */
  @Get()
  status() {
    return {
      status: 'ok',
      sync: this.supabase.enabled,
      // Duels are always available — the room lives in this process. What this
      // says is whether a finished one is written down afterwards, which is a
      // different promise and deserves its own word.
      duels: true,
      duelHistory: this.postgres.enabled,
      corpusVersion: CORPUS_VERSION,
    };
  }

  /**
   * Readiness: whether the database is answering right now.
   *
   * Separate from the one above because they are asked by different things for
   * different reasons. This one costs a query, so it belongs on a probe that
   * runs every few seconds at most, and it reports 503 when sync is configured
   * but not reachable — the state where the process is alive and cannot do the
   * job it was configured for.
   */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready() {
    const duelHistory = this.postgres.enabled
      ? (await this.postgres.reachable())
        ? 'reachable'
        : 'unreachable'
      : 'not configured';

    if (!this.supabase.enabled) {
      // Offline by configuration is a healthy state, not a degraded one.
      if (duelHistory === 'unreachable') {
        throw new ServiceUnavailableException({
          status: 'degraded',
          sync: false,
          database: 'not configured',
          duelHistory,
        });
      }
      return {
        status: 'ok',
        sync: false,
        database: 'not configured',
        duelHistory,
      };
    }

    const reachable = await this.supabase.reachable();
    if (!reachable || duelHistory === 'unreachable') {
      throw new ServiceUnavailableException({
        status: 'degraded',
        sync: true,
        database: reachable ? 'reachable' : 'unreachable',
        duelHistory,
      });
    }
    return { status: 'ok', sync: true, database: 'reachable', duelHistory };
  }
}
