// Writes the ambiguous-accent cases out for a human to read.
//
// Runs against dist rather than src so the corpus package itself never needs
// @types/node: it ships to a browser bundle, and a filesystem import in its
// source would be a dependency the browser can neither use nor tree-shake away
// with confidence.
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
