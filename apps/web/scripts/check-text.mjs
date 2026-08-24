// Acusa texto de interface começando em letra minúscula.
//
//   node scripts/check-text.mjs
//
// Existe porque a correção manual não se sustenta: a próxima tela nasce com o
// mesmo descuido e ninguém relê o site inteiro por causa de uma palavra. Roda
// no CI, junto do lint.
//
// O trabalho difícil aqui não é achar minúscula — é não gritar à toa. Um
// verificador que reclama de trinta coisas certas para cada uma errada é
// desligado na primeira semana, e aí não protege mais nada. Por isso ele lê a
// tag em volta antes de reclamar: `.label` e `uppercase` sobem a caixa no CSS,
// e a string minúscula embaixo deles está correta.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'src');

/** Props que sempre carregam texto visível ou lido em voz alta. */
const TEXT_PROPS =
  /\b(label|title|alt|placeholder|aria-label|ariaLabel)=(?:"([^"]+)"|'([^']+)')/g;

/** Um nó de texto JSX: o que vive entre > e < e tem letra de verdade. */
const JSX_TEXT = />([^<>{}\n][^<>{}]*)</g;

/**
 * Classes que já sobem a caixa no CSS.
 *
 * `.label` está em globals.css com text-transform: uppercase, e `uppercase` é
 * o utilitário do Tailwind. Uma string minúscula dentro de qualquer uma das
 * duas aparece em maiúscula na tela, e reclamar dela seria pedir para o autor
 * escrever "PRECISÃO" no código e depois vê-lo passar de novo pelo transform.
 */
const RAISES_CASE = /className="[^"]*\b(label|uppercase)\b/;

/**
 * Coisas que legitimamente começam em minúscula.
 *
 * E-mails, siglas técnicas, unidades e identificadores de código que caíram
 * dentro de um template. Nenhum deles é uma frase de interface.
 */
const ALLOWED = [
  /^[\w.+-]+@[\w.-]+$/, // e-mail
  /^(px|ms|wpm|ppm|cpm|fps|kb|mb|https?|www|npm|pnpm)\b/i,
  /^[a-z]+[A-Z]/, // camelCase — identificador, não frase
  /^[a-z_]+(\.[a-z_]+)+/i, // algo.pontuado.assim — idem
];

/**
 * Componentes que sobem a caixa por conta própria.
 *
 * O verificador lê texto, não CSS através de componentes. `<Key>esc</Key>`
 * renderiza um <kbd> com `uppercase`, e sem esta lista o autor seria obrigado
 * a escrever `<Key>ESC</Key>` — duplicando no código uma decisão que já está
 * na folha de estilo, e que passaria a existir em dois lugares para divergir
 * no dia em que um deles mudasse.
 */
const RAISING_COMPONENTS = /<(Key)\b/;

/**
 * Sinais de que o trecho é código, não frase.
 *
 * A varredura casa `>` com `<` sem entender JSX, então uma comparação dentro
 * de um `if` vira, aos olhos dela, um nó de texto. Ponto e vírgula, atribuição
 * e parênteses não aparecem numa frase de interface.
 */
const LOOKS_LIKE_CODE = /[;={}()]|\r|\n[^\S\n]*\S+[^\S\n]*\n/;

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx$/.test(path)) files.push(path);
  }
})(SRC);

const startsLower = (text) => {
  const first = [...text.trim()][0];
  return Boolean(first) && /\p{Ll}/u.test(first);
};

/**
 * Os atributos da tag que abre este trecho de texto.
 *
 * Procura para trás pelo último `<` antes do texto e devolve tudo até o `>`.
 * Não é um parser de JSX e não precisa ser: a pergunta é só se esta tag traz
 * uma classe que sobe a caixa.
 */
function openingTag(source, index) {
  const start = source.lastIndexOf('<', index);
  if (start === -1) return '';
  return source.slice(start, index + 1);
}

const findings = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const lineAt = (index) => source.slice(0, index).split('\n').length;

  const check = (text, index, kind) => {
    const value = text.trim();
    if (!/\p{L}/u.test(value)) return;
    if (!startsLower(value)) return;
    if (LOOKS_LIKE_CODE.test(text)) return;
    if (ALLOWED.some((pattern) => pattern.test(value))) return;

    const tag = openingTag(source, index);
    if (RAISES_CASE.test(tag)) return;
    if (RAISING_COMPONENTS.test(tag)) return;
    // Uma tag de fechamento antes do texto significa que a frase começou antes
    // dele: "<Key>enter</Key> repete o mesmo texto" é uma frase só, e a parte
    // depois do </Key> continua em minúscula porque está no meio dela.
    if (/^<\//.test(tag)) return;
    // E se o que veio antes não era tag nenhuma, isto não é um nó de texto.
    if (!/^<\/?[A-Za-z]/.test(tag)) return;
    findings.push({
      file: relative(ROOT, file).replace(/\\/g, '/'),
      line: lineAt(index),
      kind,
      text: value.slice(0, 72),
    });
  };

  for (const match of source.matchAll(JSX_TEXT)) {
    check(match[1], match.index ?? 0, 'texto');
  }
  for (const match of source.matchAll(TEXT_PROPS)) {
    check(match[2] ?? match[3] ?? '', match.index ?? 0, match[1]);
  }
}

if (findings.length === 0) {
  console.log(`check-text: ${files.length} arquivos, nenhum texto em minúscula.`);
  process.exit(0);
}

console.error(`check-text: ${findings.length} texto(s) de interface em minúscula\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.kind}]  ${JSON.stringify(f.text)}`);
}
console.error('\nVer docs/convencoes-de-texto.md. Se a caixa vem do CSS, a tag');
console.error('precisa da classe que sobe (label ou uppercase) para o verificador ver.');
process.exit(1);
