/** A complete, correctly punctuated sentence — never a fragment. */
export type Phrase = {
  readonly id: string;
  readonly text: string;
  /** Register: cotidiano, técnico, jornalístico, literário. */
  readonly tags: readonly string[];
};
