import { SyntaxSchema, type SyntaxChoice } from "@perseus/contracts";

/**
 * Como cada sintaxe é escrita na tela.
 *
 * Escrito na mão em vez de derivado do valor do enum: ninguém escreve "Csharp"
 * ou "Cpp", e um seletor que escreve é um seletor que lê como coluna de banco.
 * Chaveado por `SyntaxChoice`, então adicionar uma sintaxe no contrato sem
 * nomeá-la aqui é erro de tipo e não opção em branco.
 */
export const SYNTAX_LABELS: Record<SyntaxChoice, string> = {
  mix: "Mistura",
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
  rust: "Rust",
  go: "Go",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  csharp: "C#",
  cpp: "C++",
  c: "C",
  ruby: "Ruby",
  php: "PHP",
  bash: "Bash",
  sql: "SQL",
};

/**
 * As opções do seletor, na ordem do contrato com 'mix' na frente — é o padrão e
 * o que a maioria quer pra começar. Montadas a partir do schema pra lista nunca
 * descolar do que o gerador de fato aceita.
 */
export const SYNTAX_OPTIONS = [
  { value: "mix", label: SYNTAX_LABELS.mix },
  ...SyntaxSchema.options.map((value) => ({ value, label: SYNTAX_LABELS[value] })),
] as const satisfies readonly { value: SyntaxChoice; label: string }[];

export function syntaxLabel(choice: SyntaxChoice): string {
  return SYNTAX_LABELS[choice];
}
