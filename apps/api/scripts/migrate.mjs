/**
 * Aplica as migrações que rodam em Postgres comum.
 *
 * Existe porque o banco de produção é alcançável de um lugar só — de dentro da
 * máquina que tem o `DATABASE_URL` — e colar SQL à mão num editor web é o tipo
 * de passo que funciona na primeira vez e é esquecido na segunda. Rodar isto é
 * `fly ssh console -a perseus-api -C "node scripts/migrate.mjs"`.
 *
 * Idempotente por construção: cada arquivo aplicado é anotado em
 * `schema_migrations`, e rodar de novo não faz nada. As próprias migrações
 * também são escritas com `if not exists`, então as duas defesas se sobrepõem
 * de propósito — a tabela protege contra reaplicar, e o `if not exists` protege
 * contra um banco em que a tabela de controle ainda não existia.
 *
 * A lista é explícita, e não uma varredura do diretório. As `0001`–`0003`
 * referenciam o schema `auth` do Supabase e falhariam aqui; varrer a pasta
 * significaria descobrir isso em produção, no meio de um deploy. O que roda em
 * Postgres comum está nomeado abaixo, e nada mais.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const ORDER = ['0004_matches', '0005_rematch', '0006_ranking'];

const here = dirname(fileURLToPath(import.meta.url));
const folder = join(here, '..', '..', '..', 'supabase', 'migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não está setada — nada a migrar.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
});

const client = await pool.connect();
let failed = false;

try {
  await client.query(`
    create table if not exists public.schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await client.query('select name from public.schema_migrations');
  const applied = new Set(rows.map((row) => row.name));

  for (const name of ORDER) {
    if (applied.has(name)) {
      console.log(`· ${name} já aplicada`);
      continue;
    }

    const sql = await readFile(join(folder, `${name}.sql`), 'utf8');
    // Uma transação por arquivo: migração que falha no meio não deixa metade
    // de um schema para o próximo deploy descobrir.
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query(
        'insert into public.schema_migrations (name) values ($1)',
        [name],
      );
      await client.query('commit');
      console.log(`✓ ${name} aplicada`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
} catch (error) {
  failed = true;
  console.error(`✗ falhou: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  client.release();
  await pool.end();
}

process.exit(failed ? 1 : 0);
