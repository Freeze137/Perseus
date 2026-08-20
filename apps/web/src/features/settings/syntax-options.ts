import { SyntaxSchema, type SyntaxChoice } from "@perseus/contracts";

/**
 * How each syntax is written on screen.
 *
 * Spelled out by hand rather than derived from the enum value: nobody writes
 * "Csharp" or "Cpp", and a picker that does is a picker that reads like a
 * database column. Keyed by `SyntaxChoice`, so adding a syntax to the contract
 * without naming it here is a type error rather than a blank option.
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
 * The picker's options, in contract order with 'mix' in front — it is the
 * default and the one most people want to start on. Built from the schema so
 * the list can never drift from what the generator will actually accept.
 */
export const SYNTAX_OPTIONS = [
  { value: "mix", label: SYNTAX_LABELS.mix },
  ...SyntaxSchema.options.map((value) => ({ value, label: SYNTAX_LABELS[value] })),
] as const satisfies readonly { value: SyntaxChoice; label: string }[];

export function syntaxLabel(choice: SyntaxChoice): string {
  return SYNTAX_LABELS[choice];
}
