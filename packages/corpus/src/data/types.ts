/** Frase completa e bem pontuada. Nunca fragmento. */
export type Phrase = {
  readonly id: string;
  readonly text: string;
  /** Register: cotidiano, técnico, jornalístico, literário. */
  readonly tags: readonly string[];
};
