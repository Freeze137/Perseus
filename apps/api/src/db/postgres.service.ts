import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';
import { loadEnv, type Env } from '../config';

/**
 * A conexão por onde o duelo é anotado. Opcional, e é esse o ponto.
 *
 * Tudo que importa num duelo enquanto ele é jogado vive na memória deste
 * processo: a sala, os dois jogadores, o relógio, o fan-out. Isto aqui só
 * sobrevive a ele. Então uma API sem DATABASE_URL continua hospedando duelo de
 * ponta a ponta — dois amigos correm num notebook sem instalar nada — e o que
 * falta é o histórico depois, que a interface diz na cara em vez de fingir que
 * a funcionalidade está desligada.
 *
 * Postgres puro em vez do cliente Supabase. Duelo não tem conta e não tem
 * política de linha pra ficar dentro, então o cliente de service role seria um
 * jeito mais pesado de dizer a mesma coisa — e assim o banco pode ser um
 * container num notebook ou uma máquina numa VM sem nenhuma das pontas notar.
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
          // Pequeno de propósito. A carga inteira são duas escritas no fim do
          // duelo e uma leitura quando alguém abre o histórico; pool grande
          // aqui seria socket ocioso contra uma máquina de plano grátis.
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

    // Erro de pool sem ouvinte derruba o processo, e os erros que ele emite são
    // os comuns: restart do banco, socket ocioso caído. Nenhum dos dois é
    // motivo pra parar de servir um treinador que funciona offline.
    this.pool.on('error', (error: Error) => {
      this.logger.warn(`idle connection error: ${error.message}`);
    });
  }

  get enabled(): boolean {
    return this.pool !== null;
  }

  /**
   * Roda um comando e devolve as linhas.
   *
   * Quem chama confere `enabled` antes: isto devolve resultado vazio em vez de
   * lançar quando não há banco, porque todo chamador aqui é uma escrita que
   * pode faltar ou uma leitura que pode vir vazia. Duelo não se perde porque o
   * registro dele não pôde ser arquivado.
   */
  async query<T extends QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    if (!this.pool) return [];
    const result = await this.pool.query<T>(text, params as unknown[]);
    return result.rows;
  }

  /** Uma conexão, pros comandos que têm que cair juntos. */
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

  /** Se o banco está respondendo, e não apenas configurado. */
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
