/**
 * Como cada linguagem do banco vira um programa que roda.
 *
 * Um snippet não é um arquivo: é uma função, um método ou uma query, guardada
 * do jeito que aparece na tela de quem digita. Provar que ele funciona exige
 * devolver em volta dele exatamente o que o banco assume — os imports, a
 * classe, o `main` — e nada além, senão o teste passaria a provar o invólucro.
 *
 * `wrap` monta o arquivo. `steps` são os comandos, em ordem, e todos precisam
 * sair com zero. `indent` é a unidade que aquela linguagem escreve; `null`
 * significa que a linguagem alinha por coluna e não por nível, que é o caso do
 * SQL.
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const LF = '\n';

/** O tsc do próprio repositório, e não um global que pode ser outra versão. */
const TSC = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');

/**
 * `python3` no Linux do runner, `python` no Windows de quem escreve. Resolvido
 * uma vez: sondar por snippet custaria vinte processos pra responder a mesma
 * pergunta.
 */
const PYTHON = (() => {
  for (const candidate of ['python3', 'python']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Tenta o próximo.
    }
  }
  return 'python3';
})();

/**
 * Os pacotes da biblioteca padrão que o banco de Go alcança. `fmt` e `os` são
 * fixos porque o próprio `check` os usa.
 */
const GO_PACKAGES = [
  'bufio',
  'bytes',
  'context',
  'errors',
  'io',
  'math',
  'sort',
  'strconv',
  'strings',
  'sync',
  'time',
  'unicode',
];

function goImports(body) {
  const used = GO_PACKAGES.filter((name) =>
    new RegExp(`\\b${name}\\.[A-Z]`).test(body),
  );
  return ['fmt', 'os', ...used].sort();
}

const indented = (text, spaces) =>
  text
    .split(LF)
    .map((line) => (line.trim() ? ' '.repeat(spaces) + line : line))
    .join(LF);

const lines = (...parts) => parts.join(LF) + LF;

/** Um `check` na língua de cada uma, pra assertiva não virar dependência. */
const CHECKS = {
  c: lines(
    'static void check(int ok, const char *what) {',
    '    if (!ok) {',
    '        fprintf(stderr, "failed: %s\\n", what);',
    '        exit(1);',
    '    }',
    '}',
  ),
  js: lines(
    'function check(ok, what) {',
    '  if (!ok) throw new Error("failed: " + what);',
    '}',
  ),
};

export const SYNTAXES = {
  python: {
    probe: { cmd: PYTHON, args: ['--version'] },
    ext: 'py',
    indent: 4,
    wrap: (code, test) => lines(code, '', test),
    steps: (file) => [{ cmd: PYTHON, args: [file] }],
  },

  typescript: {
    probe: { cmd: 'node', args: ['--version'] },
    ext: 'ts',
    indent: 2,
    // `export {}` faz o arquivo ser módulo: sem isso os snippets compartilham o
    // escopo global e o `check` de um colide com o do outro.
    wrap: (code, test) =>
      lines(
        code,
        '',
        'function check(ok: boolean, what: string): void {',
        '  if (!ok) throw new Error("failed: " + what);',
        '}',
        '',
        test,
        '',
        'export {};',
      ),
    steps: (file, dir) => [
      {
        cmd: 'node',
        args: [
          TSC,
          '--strict',
          '--noUncheckedIndexedAccess',
          '--exactOptionalPropertyTypes',
          '--noImplicitOverride',
          '--target',
          'ES2023',
          '--lib',
          'ES2023,DOM',
          '--module',
          'ESNext',
          '--moduleResolution',
          'bundler',
          '--outDir',
          dir,
          file,
        ],
      },
      // O `package.json` que o run.mjs escreve ao lado faz o `.js` emitido ser
      // lido como módulo.
      { cmd: 'node', args: [file.replace(/\.ts$/, '.js')] },
    ],
  },

  javascript: {
    probe: { cmd: 'node', args: ['--version'] },
    ext: 'mjs',
    indent: 2,
    wrap: (code, test) => lines(code, '', CHECKS.js, '', test),
    steps: (file) => [{ cmd: 'node', args: [file] }],
  },

  java: {
    probe: { cmd: 'java', args: ['-version'] },
    ext: 'java',
    indent: 4,
    // Os snippets são nível de método, do jeito que java-001 já era: sem classe
    // e sem import. O invólucro devolve os dois.
    wrap: (code, test) =>
      lines(
        'import java.io.*;',
        'import java.nio.charset.*;',
        'import java.nio.file.*;',
        'import java.util.*;',
        'import java.util.concurrent.*;',
        'import java.util.function.*;',
        'import java.util.stream.*;',
        '',
        'public class Snip {',
        indented(code, 4),
        '',
        '    static void check(boolean ok, String what) {',
        '        if (!ok) throw new AssertionError("failed: " + what);',
        '    }',
        '',
        '    public static void main(String[] args) throws Exception {',
        indented(test, 8),
        '    }',
        '}',
      ),
    filename: 'Snip',
    steps: (file) => [{ cmd: 'java', args: [file] }],
  },

  kotlin: {
    probe: { cmd: 'kotlinc', args: ['-version'] },
    ext: 'kt',
    indent: 4,
    wrap: (code, test) =>
      lines(
        // Sem import: kotlin.* entra sozinho, e kt-003 alcança o resto pelo
        // nome completo (`kotlin.math.hypot`), que é a convenção do banco.
        code,
        '',
        'fun check(ok: Boolean, what: String) {',
        '    if (!ok) throw AssertionError("failed: " + what)',
        '}',
        '',
        'fun main() {',
        indented(test, 4),
        '}',
      ),
    // O compilador do Kotlin sobe uma JVM por invocação, então os vinte
    // snippets são compilados de uma vez só e rodados depois. Um por um levava
    // minutos que não provavam nada a mais.
    batch: {
      compile: (files, out) => ({
        cmd: 'kotlinc',
        args: [...files, '-d', out, '-nowarn'],
      }),
      run: (id, out) => ({
        cmd: 'kotlin',
        args: ['-classpath', out, `${className(id)}Kt`],
      }),
    },
  },

  swift: {
    probe: { cmd: 'swift', args: ['--version'] },
    ext: 'swift',
    indent: 4,
    wrap: (code, test) =>
      lines(
        'import Foundation',
        '',
        code,
        '',
        'func check(_ ok: Bool, _ what: String) {',
        '    if !ok {',
        '        FileHandle.standardError.write("failed: \\(what)\\n".data(using: .utf8)!)',
        '        exit(1)',
        '    }',
        '}',
        '',
        test,
      ),
    steps: (file) => [{ cmd: 'swift', args: [file] }],
  },

  go: {
    probe: { cmd: 'go', args: ['version'] },
    ext: 'go',
    indent: 'tab',
    // Import que sobra é erro de compilação em Go, então a lista sai do que o
    // snippet de fato menciona. A alternativa era importar tudo e calar cada
    // um com um identificador em branco, que enche o arquivo de linha que não
    // é do snippet nem do teste.
    wrap: (code, test) =>
      lines(
        'package main',
        '',
        'import (',
        ...goImports(code + test).map((name) => `\t"${name}"`),
        ')',
        '',
        code,
        '',
        'func check(ok bool, what string) {',
        '\tif !ok {',
        '\t\tfmt.Fprintf(os.Stderr, "failed: %s\\n", what)',
        '\t\tos.Exit(1)',
        '\t}',
        '}',
        '',
        'func main() {',
        indented(test, 0).replace(/^(?=.)/gm, '\t'),
        '}',
      ),
    steps: (file) => [{ cmd: 'go', args: ['run', file] }],
  },

  rust: {
    probe: { cmd: 'rustc', args: ['--version'] },
    ext: 'rs',
    indent: 4,
    wrap: (code, test) =>
      lines(
        // Sem `use` aqui: rs-005 traz o dele dentro do snippet, que é a
        // convenção do banco pra Rust, e repetir o import seria E0252.
        '#![allow(dead_code, unused_variables)]',
        '',
        code,
        '',
        'fn check(ok: bool, what: &str) {',
        '    if !ok {',
        '        eprintln!("failed: {}", what);',
        '        std::process::exit(1);',
        '    }',
        '}',
        '',
        'fn main() {',
        indented(test, 4),
        '}',
      ),
    steps: (file, dir) => [
      { cmd: 'rustc', args: ['--edition', '2021', '-O', file, '-o', `${dir}/snip`] },
      { cmd: `${dir}/snip`, args: [] },
    ],
  },

  csharp: {
    probe: { cmd: 'dotnet', args: ['msbuild', '-version'] },
    ext: 'cs',
    indent: 4,
    wrap: (code, test) =>
      lines(
        'using System;',
        'using System.Collections.Generic;',
        'using System.IO;',
        'using System.Linq;',
        'using System.Threading.Tasks;',
        '',
        'public static class Snip',
        '{',
        indented(code, 4),
        '',
        '    static void Check(bool ok, string what)',
        '    {',
        '        if (!ok) throw new Exception("failed: " + what);',
        '    }',
        '',
        '    public static void Main()',
        '    {',
        indented(test, 8),
        '    }',
        '}',
      ),
    filename: 'Program',
    project: true,
    steps: (file, dir) => [
      { cmd: 'dotnet', args: ['run', '--project', dir, '--verbosity', 'quiet'] },
    ],
  },

  cpp: {
    // Sonda o padrão, não o binário: g++ existir não quer dizer que ele conheça
    // C++20, e o de 2016 aceita `--version` pra depois recusar `-std=c++20` em
    // cada um dos vinte snippets.
    probe: {
      cmd: 'g++',
      args: ['-std=c++20', '-fsyntax-only', '-x', 'c++', '-'],
      input: 'int main() { return 0; }\n',
      label: 'g++ com C++20',
    },
    ext: 'cpp',
    indent: 4,
    wrap: (code, test) =>
      lines(
        // cpp-001 já traz os seus; incluir de novo é inofensivo e cobre os que
        // não trazem, como cpp-002.
        '#include <algorithm>',
        '#include <cctype>',
        '#include <cmath>',
        '#include <concepts>',
        '#include <cstdio>',
        '#include <cstdlib>',
        '#include <functional>',
        '#include <map>',
        '#include <memory>',
        '#include <numeric>',
        '#include <optional>',
        '#include <sstream>',
        '#include <stdexcept>',
        '#include <string>',
        '#include <type_traits>',
        '#include <unordered_map>',
        '#include <unordered_set>',
        '#include <variant>',
        '#include <vector>',
        '',
        'static void check(bool ok, const char *what) {',
        '    if (!ok) {',
        '        std::fprintf(stderr, "failed: %s\\n", what);',
        '        std::exit(1);',
        '    }',
        '}',
        '',
        code,
        '',
        'int main() {',
        indented(test, 4),
        '    return 0;',
        '}',
      ),
    steps: (file, dir) => [
      {
        cmd: 'g++',
        args: ['-std=c++20', '-Wall', '-Wextra', '-Werror', file, '-o', `${dir}/snip`],
      },
      { cmd: `${dir}/snip`, args: [] },
    ],
  },

  c: {
    probe: { cmd: 'gcc', args: ['--version'] },
    ext: 'c',
    indent: 4,
    // c-002 já usava size_t sem incluir stddef: os cabeçalhos são assumidos.
    wrap: (code, test) =>
      lines(
        '#include <ctype.h>',
        '#include <math.h>',
        '#include <stddef.h>',
        '#include <stdio.h>',
        '#include <stdlib.h>',
        '#include <string.h>',
        '',
        CHECKS.c,
        '',
        code,
        '',
        'int main(void) {',
        indented(test, 4),
        '    return 0;',
        '}',
      ),
    steps: (file, dir) => [
      {
        cmd: 'gcc',
        args: ['-std=c11', '-Wall', '-Wextra', '-Werror', file, '-o', `${dir}/snip`, '-lm'],
      },
      { cmd: `${dir}/snip`, args: [] },
    ],
  },

  ruby: {
    probe: { cmd: 'ruby', args: ['--version'] },
    ext: 'rb',
    indent: 2,
    wrap: (code, test) =>
      lines(
        code,
        '',
        'def check(ok, what)',
        '  raise "failed: #{what}" unless ok',
        'end',
        '',
        test,
      ),
    steps: (file) => [{ cmd: 'ruby', args: ['-w', file] }],
  },

  php: {
    probe: { cmd: 'php', args: ['--version'] },
    ext: 'php',
    indent: 4,
    wrap: (code, test) =>
      lines(
        '<?php',
        'declare(strict_types=1);',
        '',
        code,
        '',
        'function check(bool $ok, string $what): void {',
        '    if (!$ok) {',
        '        fwrite(STDERR, "failed: $what\\n");',
        '        exit(1);',
        '    }',
        '}',
        '',
        test,
      ),
    steps: (file) => [
      { cmd: 'php', args: ['-d', 'error_reporting=E_ALL', '-d', 'display_errors=1', file] },
    ],
  },

  bash: {
    probe: { cmd: 'bash', args: ['--version'] },
    ext: 'sh',
    indent: 2,
    // A shebang do snippet não pode ficar no meio do arquivo montado.
    wrap: (code, test) =>
      lines(
        '#!/usr/bin/env bash',
        'set -uo pipefail',
        '',
        'fail() {',
        '  printf "failed: %s\\n" "$1" >&2',
        '  exit 1',
        '}',
        '',
        'same() {',
        '  if [[ "$1" != "$2" ]]; then',
        '    printf "failed: %s (got %q, wanted %q)\\n" "$3" "$1" "$2" >&2',
        '    exit 1',
        '  fi',
        '}',
        '',
        code.startsWith('#!') ? code.split(LF).slice(1).join(LF).trim() : code,
        '',
        test,
        '',
        'exit 0',
      ),
    steps: (file) => [{ cmd: 'bash', args: [file] }],
  },

  // SQL não vira programa: vira banco. Ver sql.mjs.
  sql: { ext: 'sql', indent: null, database: true },
};

/** `py-006` vira `Py006`, que é como o Kotlin nomeia a classe do arquivo. */
export function className(id) {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
