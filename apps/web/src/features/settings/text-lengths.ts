/**
 * The three sizes a text comes in, named rather than numbered.
 *
 * Here rather than inside the training bar because the duel lobby offers the
 * same choice, and two lists would be two lists to keep in step — "Médio"
 * meaning 180 characters in one screen and 200 in the other is the kind of
 * drift nobody notices until somebody compares two runs that were never
 * comparable.
 *
 * Strings because that is what a `Select` speaks; the callers convert.
 */
export const TEXT_LENGTHS = [
  { value: "90", label: "Curto" },
  { value: "180", label: "Médio" },
  { value: "360", label: "Longo" },
] as const;
