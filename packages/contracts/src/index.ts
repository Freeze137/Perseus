import { z } from 'zod';

export const LanguageSchema = z.enum(['pt-BR', 'en']);
export type Language = z.infer<typeof LanguageSchema>;

/**
 * The physical keyboard in front of the typist.
 *
 * A different axis from `Language` again: the prose is Portuguese or English,
 * the syntax is Rust or Go, and this is the hardware that has to produce them.
 * It is here rather than in the web app's settings alone because it changes
 * which characters are reachable, and therefore which text may be drawn — and
 * anything that changes the text has to travel with the config the server
 * regenerates from.
 *
 * 'abnt2'   — the Brazilian layout. Reaches everything: Ç has its own key and
 *             the accents come off the dead keys ´ ` ~ ^. Brackets are direct
 *             and braces are Shift away, as on any keyboard — AltGr buys
 *             ² ³ £ ¢ ¬ here and nothing that appears in code.
 * 'us'      — the plain American layout. ASCII and nothing else: there is no
 *             key sequence on it that produces "á" or "ç".
 * 'us-intl' — the American layout with dead keys. Same accents as ABNT2, and
 *             the same direct brackets as 'us' — at the price of ' and "
 *             becoming dead keys themselves.
 */
export const KeyboardLayoutSchema = z.enum(['abnt2', 'us', 'us-intl']);
export type KeyboardLayout = z.infer<typeof KeyboardLayoutSchema>;

export const TextKindSchema = z.enum([
  'words',
  'quote',
  'punctuation',
  'numbers',
  'code',
]);
export type TextKind = z.infer<typeof TextKindSchema>;

/**
 * A programming language, which is a different axis from `Language`.
 *
 * `Language` is the human language the prose is written in; this is the syntax
 * a code snippet is written in. They never constrain each other — a Brazilian
 * and an American type the same Rust — so they are kept as separate fields
 * rather than folded into one "language" the way a single enum would tempt.
 */
export const SyntaxSchema = z.enum([
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'java',
  'kotlin',
  'swift',
  'csharp',
  'cpp',
  'c',
  'ruby',
  'php',
  'bash',
  'sql',
]);
export type Syntax = z.infer<typeof SyntaxSchema>;

/** What the user picks. 'mix' draws across every syntax inside one run. */
export const SyntaxChoiceSchema = z.union([SyntaxSchema, z.literal('mix')]);
export type SyntaxChoice = z.infer<typeof SyntaxChoiceSchema>;

/**
 * Everything needed to reproduce a test exactly. The seed is what makes a run
 * shareable: same config, same text, for anyone opening the link.
 */
export const SessionConfigSchema = z.object({
  language: LanguageSchema,
  kind: TextKindSchema,
  /** Character budget the generator aims for. */
  length: z.int().min(10).max(2_000),
  seed: z.string().min(1).max(64),
  durationMs: z.int().positive().nullable().default(null),
  /**
   * Only read when `kind` is 'code'; null everywhere else. Carried on every
   * config rather than on a separate code-only type so that one seed plus one
   * config still reproduces one text, whatever the kind.
   */
  syntax: SyntaxChoiceSchema.nullable().default(null),
  /**
   * The keyboard the run was typed on. Read by every prose builder and by none
   * of the code one — see KeyboardLayoutSchema.
   *
   * Defaulted rather than required so a config can still be written by hand
   * without naming it, and defaulted to ABNT2 because that is the keyboard the
   * default pt-BR corpus was written for.
   */
  keyboardLayout: KeyboardLayoutSchema.default('abnt2'),
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

/**
 * The corpus generation that produced a text.
 *
 * A seed alone stops being enough the moment results are stored: the same seed
 * and config yield different text after the banks change, so a saved run would
 * silently start replaying something its owner never typed. Bump this whenever
 * a builder changes or the banks are edited, and old results keep pointing at
 * the corpus they were actually run against.
 *
 * 1 — the original banks, with `words` and `numbers` built from loose tokens.
 * 2 — every mode drawn from whole sentences; `code` and the snippet bank added.
 * 3 — ten more syntaxes in the snippet bank. Nothing existing was edited, but
 *     'mix' draws from a bank twice the size, so every old mixed run replays
 *     against a corpus it never saw.
 * 4 — `keyboardLayout` joined the config, and the prose pools are now drawn
 *     per reach. A US-layout run draws from the subset its keyboard can type,
 *     so the same seed and language no longer name one text on their own.
 */
export const CORPUS_VERSION = 4;

export const TypingResultSchema = z.object({
  id: z.uuid(),
  config: SessionConfigSchema,
  /** Which corpus generation produced the text. See CORPUS_VERSION. */
  corpusVersion: z.int().positive(),
  wpm: z.number().nonnegative(),
  /** Correct characters per minute. The honest figure for a code run. */
  cpm: z.number().nonnegative(),
  rawWpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  correct: z.int().nonnegative(),
  incorrect: z.int().nonnegative(),
  durationMs: z.int().nonnegative(),
  completedAt: z.iso.datetime(),
});
export type TypingResult = z.infer<typeof TypingResultSchema>;

/**
 * One committed character, as it goes over the wire.
 *
 * `correct` is absent on purpose. The client knows it, but a leaderboard that
 * believed the client would be a leaderboard of whoever opened the console
 * first — the server recomputes it against the text it regenerates itself.
 */
export const SubmittedKeystrokeSchema = z.object({
  /** One grapheme. Longer than a code point because "ã" can arrive composed. */
  char: z.string().min(1).max(8),
  /**
   * Milliseconds on the client's own clock, monotonic within one run.
   *
   * Whole milliseconds, not the fractional figure `performance.now()` returns.
   * The extra decimals change no score anybody can perceive and cost four bytes
   * on every keystroke of every run, which on a long text is most of the
   * difference between a request that fits in the body limit and one that does
   * not. Capped at six hours: past that it is not a typing run.
   */
  at: z.int().nonnegative().max(21_600_000),
  index: z.int().nonnegative(),
});
export type SubmittedKeystroke = z.infer<typeof SubmittedKeystrokeSchema>;

/**
 * What a human hand can actually do, and the slack around the clock.
 *
 * These are the numbers that decide whether a timeline is refused, so they are
 * written down once, here, next to the schema they guard rather than inside the
 * service that happens to enforce them today.
 *
 * They are deliberately generous. A ceiling that clips the fastest real typist
 * is worse than one a determined bot can sit under: the first breaks the sport
 * for the people it exists for, and the second only forces the cheat to be slow
 * enough to be uninteresting. Nothing here pretends to catch a bot that types
 * at a believable speed in real time — that is not detectable from a timeline,
 * and claiming otherwise would be the wrong kind of comfort.
 */
export const TIMELINE_LIMITS = {
  /**
   * Characters per minute, averaged over the whole run. The verified human
   * record is around 1 080 (216 wpm on prose); this leaves a wide margin over
   * it and still refuses the six-figure numbers a forged clock produces.
   */
  maxCpm: 1_500,
  /**
   * Floor on the *median* gap between keystrokes. The median rather than the
   * minimum because rollover is real: two keys genuinely land within a few
   * milliseconds of each other when fingers overlap. A median under this is a
   * machine, not a fast hand.
   */
  minMedianGapMs: 22,
  /**
   * Gaps longer than this are somebody answering the door, not typing. They are
   * left out of the rhythm score rather than counted as terrible rhythm.
   */
  afkGapMs: 3_000,
  /**
   * Floor on the coefficient of variation of the gaps. Human rhythm wanders;
   * a loop with a fixed sleep does not. Only applied once there are enough
   * keystrokes for the figure to mean anything.
   */
  minGapVariation: 0.06,
  /** Below this many keystrokes, variation is noise and is not judged. */
  variationSampleFloor: 30,
  /**
   * How far the claimed duration may exceed the wall clock the server itself
   * measured between issuing the run ticket and receiving the submission.
   * Covers clock skew and a slow upload, nothing more.
   */
  clockSlackMs: 30_000,
} as const;

/**
 * The server's permission to open a run, handed out before the typing starts.
 *
 * It is signed and stateless: the server keeps no table of open runs, it just
 * refuses anything it did not sign. What it buys is not detection of a fast
 * fake — see TIMELINE_LIMITS for why that is not on offer — but a ceiling on
 * volume. One result per ticket, one ticket per request, and a run that claims
 * to have taken longer than the clock the server watched is refused.
 */
export const RunTicketSchema = z.object({
  id: z.uuid(),
  /** Server epoch milliseconds, from the server's own clock. */
  issuedAt: z.int().positive(),
  /** HMAC over the two fields above. Meaningless to the client. */
  signature: z.string().min(16).max(128),
});
export type RunTicket = z.infer<typeof RunTicketSchema>;

/** How long a ticket can sit unused before it stops opening a run. */
export const RUN_TICKET_TTL_MS = 4 * 60 * 60 * 1_000;

/**
 * What the client sends up when sync is on.
 *
 * It sends what it did, not how it scored. The server regenerates the target
 * from `config` and `corpusVersion`, replays this timeline against it, and
 * computes the numbers itself; nothing the client claims about its own speed
 * is stored. The owner comes from the session token, never from the payload.
 */
export const SubmitResultSchema = z.object({
  config: SessionConfigSchema,
  corpusVersion: z.int().positive(),
  /** The ticket taken out when the run started. One result per ticket. */
  run: RunTicketSchema,
  /** Capped: no legitimate run is longer, and an unbounded array is a DoS. */
  keystrokes: z.array(SubmittedKeystrokeSchema).min(1).max(5_000),
});
export type SubmitResult = z.infer<typeof SubmitResultSchema>;

/**
 * Why a submission was refused, in a form the client can branch on.
 *
 * The message is for a human reading a log; this is for the interface deciding
 * what to say. `corpus_version` in particular is not the typist's fault — their
 * tab was open across a deploy — and telling them to reload is a different
 * screen from telling them the run looked forged.
 */
export const SubmitErrorCodeSchema = z.enum([
  /** The tab is running a corpus this server can no longer regenerate. */
  'corpus_version',
  /** Missing, forged or expired run ticket. */
  'run_ticket',
  /** This run was already stored. */
  'duplicate',
  /** The timeline is not something a hand produced. */
  'implausible',
  /** The timeline does not replay against the text it names. */
  'invalid_timeline',
]);
export type SubmitErrorCode = z.infer<typeof SubmitErrorCodeSchema>;

/** The body a refused submission carries, alongside the HTTP status. */
export const ApiErrorBodySchema = z.object({
  code: SubmitErrorCodeSchema,
  message: z.string(),
  /** Set on 'corpus_version': what this server can actually verify. */
  expected: z.int().positive().optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export const LeaderboardEntrySchema = z.object({
  rank: z.int().positive(),
  username: z.string().min(1).max(32),
  wpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  achievedAt: z.iso.datetime(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

/**
 * What a board is scoped to.
 *
 * Code and prose never share one: five characters is a word in English prose
 * and nothing at all in Rust, so a single ordering would rank the two against a
 * ruler that only fits one of them.
 */
export const LeaderboardQuerySchema = z.object({
  kind: TextKindSchema.default('words'),
  language: LanguageSchema.default('pt-BR'),
  syntax: SyntaxChoiceSchema.nullable().default(null),
  /** Days back to consider. Null means all time. */
  windowDays: z.int().positive().max(365).nullable().default(null),
  limit: z.int().positive().max(200).default(50),
});
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;

/**
 * One of your own past runs, as the history endpoint returns it.
 *
 * Results were write-only until this existed: the table recorded every run and
 * offered its owner no way to read one back, so the only record a typist had of
 * their own progress was whatever was still on screen. This is read through the
 * caller's own token, inside the row-level policies, rather than with the
 * service key — your history is exactly the rows the database already agrees
 * are yours.
 */
export const StoredResultSchema = z.object({
  id: z.uuid(),
  kind: TextKindSchema,
  language: LanguageSchema,
  syntax: SyntaxChoiceSchema.nullable(),
  wpm: z.number().nonnegative(),
  cpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  durationMs: z.int().nonnegative(),
  completedAt: z.iso.datetime(),
});
export type StoredResult = z.infer<typeof StoredResultSchema>;

export const HistoryQuerySchema = z.object({
  kind: TextKindSchema.optional(),
  limit: z.int().positive().max(100).default(20),
});
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

/** A personal history plus the bests derived from it, in one round trip. */
export const HistoryResponseSchema = z.object({
  entries: z.array(StoredResultSchema),
  best: z
    .object({
      wpm: z.number().nonnegative(),
      accuracy: z.number().min(0).max(100),
    })
    .nullable(),
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

/**
 * A board plus whether it is a board at all right now.
 *
 * An empty array used to mean both "nobody has ranked yet" and "the database
 * did not answer", which are opposite things to tell somebody: the first is an
 * invitation and the second is an apology. The status makes them different
 * again, and keeps the failure honest instead of dressing it as an empty list.
 */
export const LeaderboardStatusSchema = z.enum(['ok', 'unavailable']);
export type LeaderboardStatus = z.infer<typeof LeaderboardStatusSchema>;

export const LeaderboardResponseSchema = z.object({
  status: LeaderboardStatusSchema,
  entries: z.array(LeaderboardEntrySchema),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;

/** The accuracy floor a run must clear to appear on a board at all. */
export const LEADERBOARD_MIN_ACCURACY = 90;

/* ---------------------------------------------------------------------------
 * Duel — private 1v1
 *
 * Two people, one text, one invite code. The text is never sent over the wire:
 * it is a pure function of the seed and the config, both of which the server
 * hands to both players, so the two clients generate the same characters by
 * construction. That property is why `packages/corpus` is deterministic.
 *
 * The live progress that travels between them is decoration. The score is the
 * same server-side replay a solo run gets — see SubmitResultSchema — because a
 * placing that came from the realtime channel would be a placing the client
 * could type into the console, while the solo one could not.
 * ------------------------------------------------------------------------- */

/** A duel is two people. Not a lobby size — a rule the whole flow assumes. */
export const MATCH_PLAYERS = 2;

/**
 * The invite alphabet, with the ambiguous glyphs removed.
 *
 * A code is read aloud or retyped from a screenshot at least as often as it is
 * clicked, and 0/O and 1/I are exactly the pairs that fail there.
 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 6;

/**
 * The pause between the room filling and the text unlocking.
 *
 * Both clients already have the text; what they are waiting for is each other's
 * hands. Five seconds is long enough to sit up and short enough that nobody
 * alt-tabs during it.
 */
export const MATCH_COUNTDOWN_MS = 5_000;

/**
 * How long the second typist has after the first one finishes.
 *
 * The alternative rules are both worse: ending the duel on the first finish
 * takes the run away from somebody three words from the end, and waiting
 * forever lets a closed tab hold the room open.
 */
export const MATCH_GRACE_MS = 30_000;

/**
 * How often a client publishes its caret position.
 *
 * Below this the eye cannot tell the difference and the traffic doubles. The
 * updates are lossy on purpose — a dropped one costs a frame of somebody
 * else's progress bar, and the score does not come from here.
 */
export const MATCH_PROGRESS_MS = 200;

/** A room nobody joins is swept rather than kept. */
export const MATCH_LOBBY_TTL_MS = 15 * 60_000;

/**
 * The ceiling on a whole duel, counted from the countdown.
 *
 * Reached only when both tabs are gone before either finished, which is the one
 * case the grace period cannot close: the grace clock never starts.
 */
export const MATCH_MAX_RUN_MS = 20 * 60_000;

/** How many finished duels a browser keeps in its own history list. */
export const MATCH_HISTORY_MAX = 50;

/**
 * The name a player wears for one duel.
 *
 * Chosen per match rather than taken from an account: a duel needs no login,
 * and asking two friends to create accounts before they can race is the whole
 * feature's worth of friction. It is stored with the match afterwards, which is
 * what makes the history readable a month later.
 */
export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  // No control characters, including the bidi overrides that let a name
  // rearrange the line it is printed on.
  .regex(/^[^\p{C}]+$/u, 'name contains control characters');

export const InviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(INVITE_CODE_LENGTH)
  .regex(/^[A-Z2-9]+$/, 'not an invite code');

/**
 * 'lobby'     — created, waiting for the second player.
 * 'countdown' — both in, text on screen, keys not accepted yet.
 * 'running'   — typing.
 * 'done'      — scored, winner decided, written down.
 * 'abandoned' — the room died before anybody finished. No winner, no record.
 */
export const MatchStateSchema = z.enum([
  'lobby',
  'countdown',
  'running',
  'done',
  'abandoned',
]);
export type MatchState = z.infer<typeof MatchStateSchema>;

/**
 * How one player's duel ended.
 *
 * 'unfinished' is the interesting one: they were still typing when the grace
 * period ran out. It is stated as a fact — the text was not finished in time —
 * rather than as a joke at their expense, because the rest of this product does
 * not needle people who did badly and this is not the place to start.
 */
export const MatchOutcomeSchema = z.enum([
  'won',
  'lost',
  /** Both finished at the same score, to the second decimal. */
  'draw',
  /** Did not reach the end of the text inside the grace period. */
  'unfinished',
  /** The room died before anybody finished. */
  'abandoned',
]);
export type MatchOutcome = z.infer<typeof MatchOutcomeSchema>;

/** What the server derived from one player's timeline. Never what they claimed. */
export const MatchScoreSchema = z.object({
  wpm: z.number().nonnegative(),
  cpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  durationMs: z.int().nonnegative(),
});
export type MatchScore = z.infer<typeof MatchScoreSchema>;

export const MatchPlayerSchema = z.object({
  /** 1 is the host, 2 is whoever took the invite. */
  slot: z.int().min(1).max(MATCH_PLAYERS),
  displayName: DisplayNameSchema,
  joinedAt: z.iso.datetime(),
  /**
   * The caret index this player last published. Decoration: it drives the
   * other person's progress bar and nothing else, and it is deliberately not
   * an input to the score.
   */
  progress: z.int().nonnegative(),
  finishedAt: z.iso.datetime().nullable(),
  score: MatchScoreSchema.nullable(),
  outcome: MatchOutcomeSchema.nullable(),
});
export type MatchPlayer = z.infer<typeof MatchPlayerSchema>;

export const MatchSchema = z.object({
  id: z.uuid(),
  inviteCode: InviteCodeSchema,
  state: MatchStateSchema,
  /** Including the seed, which the server picks. Both clients build from it. */
  config: SessionConfigSchema,
  corpusVersion: z.int().positive(),
  createdAt: z.iso.datetime(),
  /** Epoch ms the keys unlock at. Null until the room fills. */
  startsAt: z.int().positive().nullable(),
  /** Epoch ms the grace period ends. Null until somebody finishes. */
  graceEndsAt: z.int().positive().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  winnerSlot: z.int().min(1).max(MATCH_PLAYERS).nullable(),
  players: z.array(MatchPlayerSchema).max(MATCH_PLAYERS),
  /**
   * The server's clock when this snapshot was written.
   *
   * Every snapshot carries it so the client can hold an offset against its own
   * clock and count the same countdown the server is counting. Two browsers
   * whose clocks disagree by ten seconds would otherwise start ten seconds
   * apart — on the same text, with the same server, and no way to tell.
   */
  serverNow: z.int().positive(),
});
export type Match = z.infer<typeof MatchSchema>;

/**
 * What the host asks for. Not a full SessionConfig: the seed is the server's to
 * pick, because a client that chose the seed could draw the text, type it once
 * offline, and then open the room.
 */
export const CreateMatchSchema = z.object({
  displayName: DisplayNameSchema,
  language: LanguageSchema,
  kind: TextKindSchema,
  length: z.int().min(10).max(2_000),
  syntax: SyntaxChoiceSchema.nullable().default(null),
  keyboardLayout: KeyboardLayoutSchema.default('abnt2'),
});
export type CreateMatch = z.infer<typeof CreateMatchSchema>;

export const JoinMatchSchema = z.object({ displayName: DisplayNameSchema });
export type JoinMatch = z.infer<typeof JoinMatchSchema>;

/**
 * The room, the slot, and the only proof of being in it.
 *
 * The token is what separates a player from a spectator holding the same code.
 * Without one, anybody who read the invite over a shoulder could publish
 * progress as either player and submit a timeline in their name.
 */
export const MatchCredentialsSchema = z.object({
  match: MatchSchema,
  slot: z.int().min(1).max(MATCH_PLAYERS),
  token: z.string().min(16).max(256),
});
export type MatchCredentials = z.infer<typeof MatchCredentialsSchema>;

export const MatchProgressSchema = z.object({
  index: z.int().nonnegative().max(2_000),
});
export type MatchProgress = z.infer<typeof MatchProgressSchema>;

/** The same timeline a solo run submits, minus the ticket: the room is one. */
export const SubmitMatchRunSchema = z.object({
  keystrokes: z.array(SubmittedKeystrokeSchema).min(1).max(5_000),
});
export type SubmitMatchRun = z.infer<typeof SubmitMatchRunSchema>;

/**
 * What travels down the stream.
 *
 * Two shapes rather than one: a whole snapshot whenever the room changes state,
 * and a bare position whenever somebody's caret moves. The second is the
 * frequent one — five a second per player — and sending the entire match with
 * every caret step would be most of the bandwidth for none of the information.
 */
export const MatchEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('match'), match: MatchSchema }),
  z.object({
    type: z.literal('progress'),
    slot: z.int().min(1).max(MATCH_PLAYERS),
    index: z.int().nonnegative(),
    serverNow: z.int().positive(),
  }),
]);
export type MatchEvent = z.infer<typeof MatchEventSchema>;

/** One finished duel as the history list reads it back. */
export const MatchSummarySchema = z.object({
  id: z.uuid(),
  inviteCode: InviteCodeSchema,
  kind: TextKindSchema,
  language: LanguageSchema,
  syntax: SyntaxChoiceSchema.nullable(),
  state: MatchStateSchema,
  finishedAt: z.iso.datetime().nullable(),
  winnerSlot: z.int().min(1).max(MATCH_PLAYERS).nullable(),
  players: z.array(
    z.object({
      slot: z.int().min(1).max(MATCH_PLAYERS),
      displayName: DisplayNameSchema,
      score: MatchScoreSchema.nullable(),
      outcome: MatchOutcomeSchema.nullable(),
    }),
  ),
});
export type MatchSummary = z.infer<typeof MatchSummarySchema>;

/**
 * Reading a history is a batch, not a request per duel.
 *
 * The browser is the one holding the list of which duels are its own — there is
 * no account to hang them on — so it hands the ids back and the server returns
 * the ones it still has.
 */
export const MatchSummariesQuerySchema = z.object({
  ids: z.array(z.uuid()).min(1).max(MATCH_HISTORY_MAX),
});
export type MatchSummariesQuery = z.infer<typeof MatchSummariesQuerySchema>;

export const MatchSummariesResponseSchema = z.object({
  status: LeaderboardStatusSchema,
  matches: z.array(MatchSummarySchema),
});
export type MatchSummariesResponse = z.infer<
  typeof MatchSummariesResponseSchema
>;

/**
 * Why a duel request was refused, in a form the interface can branch on.
 *
 * Separate from SubmitErrorCode because these are answers about a room rather
 * than about a timeline — and a room that is full needs a different screen from
 * a timeline that did not replay. A duel submission can still be refused for
 * any SubmitErrorCode reason: the scoring path is the same one.
 */
export const MatchErrorCodeSchema = z.enum([
  'match_not_found',
  'match_full',
  /** Already running, already scored, or swept. */
  'match_closed',
  /** Missing, forged, or for a different room. */
  'match_token',
  /** This slot already submitted its run. */
  'already_finished',
  /** The keys are not unlocked yet. */
  'not_started',
]);
export type MatchErrorCode = z.infer<typeof MatchErrorCodeSchema>;
