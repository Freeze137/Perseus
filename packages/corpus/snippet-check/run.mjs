/**
 * Prova que todo snippet do banco compila e faz o que promete.
 *
 * O teste que já existia guarda o *formato* — ASCII, ids únicos, indentação
 * coerente, snippet inteiro e não linha solta. Nada ali sabe se o código roda.
 * Um snippet que não compila é uma pessoa treinando um erro com a confiança de
 * quem está treinando o certo, e essa é a única falha do banco que o próprio
 * banco não consegue enxergar.
 *
 * Cada snippet é embrulhado no que a linguagem dele exige (ver syntaxes.mjs),
 * ganha as asserções de `asserts/<sintaxe>.txt` e é executado de verdade. Roda
 * fora do Vitest de propósito: o que ele chama são quinze toolchains, não
 * funções, e o tempo disso não pertence à suíte que alguém roda em watch.
 *
 * Uso:
 *   node snippet-check/run.mjs                 todas as sintaxes com asserções
 *   node snippet-check/run.mjs --syntax=rust   só uma
 *   node snippet-check/run.mjs --keep          não apaga o diretório de trabalho
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SYNTAXES, className } from './syntaxes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LF = '\n';
const TAB = '\t';

const require = createRequire(import.meta.url);
const distPath = join(HERE, '..', 'dist', 'data', 'snippets.js');
if (!existsSync(distPath)) {
  console.error('O pacote não está buildado. Rode `pnpm build` no @perseus/corpus.');
  process.exit(1);
}
const { SNIPPETS } = require(distPath);

const only = process.argv
  .find((argument) => argument.startsWith('--syntax='))
  ?.slice('--syntax='.length);
const keep = process.argv.includes('--keep');
/** No CI toolchain ausente é falha; na máquina de quem escreve, é um pulo. */
const requireAll = process.argv.includes('--require-all');

/**
 * Lê `asserts/<sintaxe>.txt`, que é uma sequência de `//== <id>` seguida do
 * código que exercita aquele snippet.
 *
 * Formato de texto e não de módulo porque o corpo é escrito na linguagem do
 * snippet, não em JavaScript — o arquivo de Ruby tem Ruby dentro.
 */
function readAsserts(syntax) {
  const path = join(HERE, 'asserts', `${syntax}.txt`);
  if (!existsSync(path)) return new Map();
  const blocks = new Map();
  let id = null;
  let body = [];
  const flush = () => {
    if (id) blocks.set(id, body.join(LF).trim());
  };
  for (const line of readFileSync(path, 'utf8').replace(/\r/g, '').split(LF)) {
    const header = /^\/\/== ([a-z0-9-]+)/.exec(line);
    if (header) {
      flush();
      id = header[1];
      body = [];
      continue;
    }
    body.push(line);
  }
  flush();
  return blocks;
}

/** O que dá pra saber do snippet sem executá-lo. */
function formatProblems(code, indent) {
  const problems = [];
  if (!/^[\x20-\x7E\n\t]*$/.test(code)) problems.push('caractere fora do ASCII');
  if (code !== code.trim()) problems.push('espaço nas pontas');

  const usesTab = code.split(LF).some((line) => line.startsWith(TAB));
  if (indent === 'tab') {
    if (!usesTab && /^ /m.test(code)) problems.push('espaço onde a linguagem usa tab');
  } else if (indent !== null) {
    if (code.includes(TAB)) problems.push('tab onde a linguagem usa espaço');
    for (const line of code.split(LF)) {
      const width = line.length - line.trimStart().length;
      if (line.trim() && width % indent !== 0) {
        problems.push(`indentação não é múltiplo de ${indent}: "${line.trim().slice(0, 32)}"`);
        break;
      }
    }
  }
  return problems;
}

function shorten(text) {
  return String(text)
    .replace(/\r/g, '')
    .split(LF)
    .filter((line) => line.trim())
    .slice(0, 3)
    .join(' / ')
    .slice(0, 400);
}

function attempt(step, cwd) {
  try {
    execFileSync(step.cmd, step.args, {
      cwd,
      stdio: 'pipe',
      timeout: 180_000,
      // Só a sondagem usa: é como se pergunta a um compilador se ele conhece um
      // padrão sem inventar um arquivo pra isso.
      ...(step.input === undefined ? {} : { input: step.input }),
    });
    return null;
  } catch (error) {
    const output = [error.stdout?.toString() ?? '', error.stderr?.toString() ?? '']
      .join(LF)
      .trim();
    return shorten(output || error.message);
  }
}

const CSPROJ = [
  '<Project Sdk="Microsoft.NET.Sdk">',
  '  <PropertyGroup>',
  '    <OutputType>Exe</OutputType>',
  '    <TargetFramework>net8.0</TargetFramework>',
  '    <Nullable>enable</Nullable>',
  '    <ImplicitUsings>disable</ImplicitUsings>',
  '    <StartupObject>Snip</StartupObject>',
  '  </PropertyGroup>',
  '</Project>',
].join(LF);

/** As linguagens comuns: um arquivo por snippet, compila e roda. */
function checkOne(syntax, config, snippet, test, work) {
  const problems = formatProblems(snippet.code, config.indent);

  const home = join(work, snippet.id);
  mkdirSync(home, { recursive: true });

  const stem = config.filename ?? 'snip';
  const file = join(home, `${stem}.${config.ext}`);
  writeFileSync(file, config.wrap(snippet.code, test), 'utf8');

  // O tsc emite `.js`; sem isto o Node leria o resultado como CommonJS.
  if (syntax === 'typescript') {
    writeFileSync(join(home, 'package.json'), '{ "type": "module" }', 'utf8');
  }
  if (config.project) {
    writeFileSync(join(home, 'snip.csproj'), CSPROJ, 'utf8');
  }

  for (const step of config.steps(file, home)) {
    const failure = attempt(step, home);
    if (failure) {
      problems.push(failure);
      break;
    }
  }
  return problems;
}

/**
 * Kotlin à parte: o compilador sobe uma JVM por invocação, e vinte invocações
 * são minutos que não provam nada a mais que uma. Compila o lote inteiro de uma
 * vez e roda cada classe depois.
 */
function checkKotlin(config, entries, work) {
  const results = new Map();
  const sources = [];

  for (const { snippet, test } of entries) {
    results.set(snippet.id, formatProblems(snippet.code, config.indent));
    const file = join(work, `${className(snippet.id)}.kt`);
    writeFileSync(file, config.wrap(snippet.code, test), 'utf8');
    sources.push(file);
  }

  const out = join(work, 'classes');
  mkdirSync(out, { recursive: true });

  const compiled = attempt(config.batch.compile(sources, out), work);
  if (compiled) {
    // Falha de compilação nomeia o arquivo, então cada snippet leva o pedaço da
    // mensagem que é dele. Sem isso um erro afundaria os vinte juntos.
    for (const { snippet } of entries) {
      const mine = compiled.includes(`${className(snippet.id)}.kt`);
      if (mine) results.get(snippet.id).push(compiled);
    }
    if (![...results.values()].some((problems) => problems.length)) {
      for (const { snippet } of entries) results.get(snippet.id).push(compiled);
    }
    return results;
  }

  for (const { snippet } of entries) {
    const failure = attempt(config.batch.run(snippet.id, out), work);
    if (failure) results.get(snippet.id).push(failure);
  }
  return results;
}

const work = mkdtempSync(join(tmpdir(), 'perseus-snippets-'));
let failed = 0;
let checked = 0;
const skipped = [];

try {
  for (const [syntax, config] of Object.entries(SYNTAXES)) {
    if (only && syntax !== only) continue;

    // SQL guarda os casos num módulo e não num `.txt`: exercitar uma query
    // exige um banco povoado e uma asserção sobre linhas, não código na
    // linguagem do snippet.
    const asserts = config.database
      ? new Map(Object.keys((await import('./sql.mjs')).CASES).map((id) => [id, null]))
      : readAsserts(syntax);

    const pool = SNIPPETS.filter((snippet) => snippet.syntax === syntax);
    const entries = pool
      .filter((snippet) => asserts.has(snippet.id))
      .map((snippet) => ({ snippet, test: asserts.get(snippet.id) }));

    const missing = pool.length - entries.length;
    if (entries.length === 0) {
      skipped.push(`${syntax} (${pool.length} sem asserção)`);
      continue;
    }

    // Sem a toolchain, a máquina não tem o que provar sobre esta linguagem.
    // Localmente isso é um pulo anotado; no CI é falha, senão o portão passaria
    // verde no dia em que uma toolchain sumisse da imagem do runner.
    if (config.probe && attempt(config.probe, work)) {
      if (requireAll) {
        console.log(`\n${syntax}\n  FALTA a toolchain (${config.probe.cmd})`);
        failed += entries.length;
        checked += entries.length;
      } else {
        skipped.push(`${syntax} (sem ${config.probe.label ?? config.probe.cmd})`);
      }
      continue;
    }

    const home = join(work, syntax);
    mkdirSync(home, { recursive: true });

    console.log(`\n${syntax}`);
    let results;
    if (config.database) {
      const { checkSql } = await import('./sql.mjs');
      results = await checkSql(entries, formatProblems, config.indent);
    } else if (config.batch) {
      results = checkKotlin(config, entries, home);
    } else {
      results = new Map(
        entries.map(({ snippet, test }) => [
          snippet.id,
          checkOne(syntax, config, snippet, test, home),
        ]),
      );
    }

    for (const { snippet } of entries) {
      checked += 1;
      const problems = results.get(snippet.id) ?? [];
      if (problems.length) {
        failed += 1;
        console.log(`  FAIL ${snippet.id}  ${problems.join(' | ')}`);
      } else {
        console.log(`  ok   ${snippet.id}`);
      }
    }
    if (missing > 0) {
      console.log(`  (${missing} sem asserção, não checados)`);
    }
  }
} finally {
  if (keep) console.log(`\ndiretório de trabalho: ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

console.log(`\n${checked} snippets executados, ${failed} falharam.`);
if (skipped.length) console.log(`sem asserção ainda: ${skipped.join(', ')}`);
process.exit(failed ? 1 : 0);
