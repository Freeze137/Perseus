/**
 * SQL não vira programa: vira banco.
 *
 * Os snippets são PostgreSQL — `uuid`, `timestamptz`, `interval`,
 * `gen_random_uuid()` — que é o dialeto do Neon, onde o ranking mora. SQLite
 * aceitaria metade e mentiria sobre a outra, então a checagem sobe um Postgres
 * de verdade compilado pra WASM (PGlite): sem serviço, sem container, e ainda
 * assim o mesmo parser e o mesmo planejador.
 *
 * Cada snippet ganha um banco novo com o schema abaixo. Compartilhar um só
 * faria a ordem dos testes importar, e o primeiro DDL a rodar mudaria o chão
 * dos outros dezenove.
 */
import { PGlite } from '@electric-sql/pglite';

/** O schema que os snippets assumem, coerente com sql-002 até sql-005. */
const SCHEMA = `
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  wpm numeric(5, 2) NOT NULL,
  accuracy numeric(5, 2) NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leaderboard (
  username text PRIMARY KEY,
  wpm numeric(5, 2) NOT NULL,
  accuracy numeric(5, 2) NOT NULL
);

INSERT INTO users (id, username) VALUES
  ('11111111-1111-1111-1111-111111111111', 'ana'),
  ('22222222-2222-2222-2222-222222222222', 'rafael'),
  ('33333333-3333-3333-3333-333333333333', 'quiet');

INSERT INTO results (user_id, wpm, accuracy, completed_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 82.5, 97.0, now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111111', 88.0, 94.5, now() - interval '1 day'),
  ('11111111-1111-1111-1111-111111111111', 91.2, 98.1, now()),
  ('22222222-2222-2222-2222-222222222222', 74.0, 92.0, now() - interval '3 days'),
  ('22222222-2222-2222-2222-222222222222', 79.4, 96.2, now()),
  ('11111111-1111-1111-1111-111111111111', 60.0, 88.0, now() - interval '400 days');

INSERT INTO leaderboard (username, wpm, accuracy) VALUES ('ana', 88.0, 94.5);
`;

const ANA = '11111111-1111-1111-1111-111111111111';
const RAFAEL = '22222222-2222-2222-2222-222222222222';

function ok(condition, what) {
  if (!condition) throw new Error(`failed: ${what}`);
}

function same(got, wanted, what) {
  if (got !== wanted) {
    throw new Error(
      `failed: ${what} (got ${JSON.stringify(got)}, wanted ${JSON.stringify(wanted)})`,
    );
  }
}

/**
 * Por snippet: os parâmetros que a query pede e o que o resultado tem que ser.
 * DDL não devolve linha, então a checagem dele interroga o catálogo.
 */
/*
 * sql-001 fica de fora e não por descuido: ele lê `results.country`, e o
 * `CREATE TABLE results` do próprio banco — sql-002 — não define essa coluna.
 * Os dois snippets discordam entre si, e escolher um aqui seria o verificador
 * decidindo calado uma questão de conteúdo. sql-002 até sql-005 também ficam
 * de fora por enquanto: o DDL deles recria o schema que os outros assumem.
 */
export const CASES = {
  'sql-006': {
    check: async (rows) => {
      // As corridas recentes caem em -3, -2, -1 e hoje; a de -400 dias é o quinto.
      same(rows.length, 5, 'cinco dias distintos');
      same(Number(rows[0].runs), 2, 'hoje tem duas corridas');
    },
  },
  'sql-007': {
    check: async (rows) => {
      same(rows.length, 1, 'só um usuário sem corrida');
      same(rows[0].username, 'quiet', 'é o quiet');
    },
  },
  'sql-008': {
    params: [ANA],
    check: async (rows) => {
      same(rows.length, 4, 'as corridas da ana');
      same(rows[0].gained, null, 'a primeira não tem anterior');
      same(Number(rows[1].gained), 22.5, 'ganho entre a primeira e a segunda');
    },
  },
  'sql-009': {
    check: async (rows) => {
      same(rows.length, 7, 'sete dias');
      const total = rows.reduce((sum, row) => sum + Number(row.runs), 0);
      same(total, 5, 'a corrida de 400 dias fica de fora da semana');
    },
  },
  'sql-010': {
    check: async (rows, db) => {
      const found = await db.query(
        "SELECT indexdef FROM pg_indexes WHERE indexname = 'results_recent_idx'",
      );
      same(found.rows.length, 1, 'o índice existe');
      ok(found.rows[0].indexdef.includes('WHERE'), 'e é parcial');
    },
  },
  'sql-011': {
    params: ['ana', 95.0, 99.0],
    check: async (rows, db) => {
      const after = await db.query("SELECT wpm FROM leaderboard WHERE username = 'ana'");
      same(Number(after.rows[0].wpm), 95, 'melhorou o recorde');
      await db.query(
        `INSERT INTO leaderboard (username, wpm, accuracy) VALUES ('ana', 10, 10)
         ON CONFLICT (username) DO UPDATE
           SET wpm = excluded.wpm, accuracy = excluded.accuracy
         WHERE excluded.wpm > leaderboard.wpm;`,
      );
      const worse = await db.query("SELECT wpm FROM leaderboard WHERE username = 'ana'");
      same(Number(worse.rows[0].wpm), 95, 'recorde pior não entra');
    },
  },
  'sql-012': {
    check: async (rows) => {
      same(rows.length, 1, 'uma linha');
      same(Number(rows[0].median), 82.5, 'a mediana das cinco recentes');
      ok(Number(rows[0].top_five) > Number(rows[0].median), 'p95 acima da mediana');
    },
  },
  'sql-013': {
    check: async (rows) => {
      same(rows.length, 2, 'um melhor por usuário que correu');
      const best = Object.fromEntries(rows.map((row) => [row.username, Number(row.wpm)]));
      same(best.ana, 91.2, 'o melhor da ana');
      same(best.rafael, 79.4, 'o melhor do rafael');
    },
  },
  'sql-014': {
    check: async (rows, db) => {
      const column = await db.query(
        `SELECT column_default FROM information_schema.columns
         WHERE table_name = 'results' AND column_name = 'consistency'`,
      );
      same(column.rows.length, 1, 'a coluna existe');
      const constraint = await db.query(
        "SELECT 1 FROM pg_constraint WHERE conname = 'results_accuracy_range'",
      );
      same(constraint.rows.length, 1, 'a restrição existe');
    },
  },
  'sql-015': {
    check: async (rows) => {
      same(rows.length, 5, 'até três por usuário, e quiet não aparece');
      same(rows[0].username, 'ana', 'ordenado por nome');
      same(Number(rows[0].wpm), 91.2, 'melhor primeiro dentro do usuário');
    },
  },
  'sql-016': {
    before: `UPDATE results SET accuracy = 104.0 WHERE user_id = '${RAFAEL}';`,
    check: async (rows) => {
      same(rows.length, 2, 'duas linhas corrigidas');
      ok(rows.every((row) => Number(row.accuracy) === 100), 'todas voltaram para cem');
    },
  },
  'sql-017': {
    check: async (rows) => {
      same(rows.length, 1, 'só a ana tem três corridas ou mais');
      same(Number(rows[0].runs), 4, 'contou as quatro');
      same(Number(rows[0].clean), 2, 'duas acima de 95');
    },
  },
  'sql-018': {
    check: async (rows, db) => {
      const left = await db.query('SELECT count(*)::int AS c FROM results');
      same(left.rows[0].c, 5, 'só a de 400 dias saiu');
    },
  },
  'sql-019': {
    check: async (rows, db) => {
      const view = await db.query('SELECT * FROM personal_best ORDER BY wpm DESC');
      same(view.rows.length, 2, 'um por usuário que correu');
      same(Number(view.rows[0].wpm), 91.2, 'o melhor de todos');
    },
  },
  'sql-020': {
    check: async (rows) => {
      same(rows.length, 2, 'um por usuário que correu');
      const ana = rows.find((row) => row.username === 'ana');
      same(ana.history.length, 4, 'as corridas no histórico');
      ok(ana.history[0].wpm !== undefined, 'o objeto tem wpm');
    },
  },
};

export async function checkSql(entries, formatProblems, indent) {
  const results = new Map();

  for (const { snippet } of entries) {
    const plan = CASES[snippet.id];
    const problems = formatProblems(snippet.code, indent);

    const db = await PGlite.create();
    try {
      await db.exec(SCHEMA);
      if (plan.before) await db.exec(plan.before);
      const result = plan.params
        ? await db.query(snippet.code, plan.params)
        : await db.exec(snippet.code);
      const rows = plan.params ? result.rows : (result.at(-1)?.rows ?? []);
      await plan.check(rows, db);
    } catch (error) {
      problems.push(String(error.message).split('\n').slice(0, 2).join(' / '));
    } finally {
      await db.close();
    }

    results.set(snippet.id, problems);
  }

  return results;
}
