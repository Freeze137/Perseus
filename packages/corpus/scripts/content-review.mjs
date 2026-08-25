// Escreve os casos de acento ambíguo pra uma pessoa ler.
//
// Roda contra o dist e não contra o src pro pacote do corpus nunca precisar de
// @types/node: ele vai pra um bundle de browser, e um import de sistema de
// arquivos no fonte dele seria uma dependência que o browser não usa nem
// consegue remover por tree-shaking com confiança.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewMarkdown, validate } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../../../content-review.md');

const { errors, review } = validate();
writeFileSync(target, reviewMarkdown(review), 'utf8');

console.log(`content-review.md: ${review.length} caso(s) ambíguo(s) -> ${target}`);
console.log(`erros: ${errors.length}`);

for (const error of errors) {
  console.log(`  ${error.bank}  ${error.id}  [${error.rule}]  ${error.detail}`);
}

process.exit(errors.length === 0 ? 0 : 1);
