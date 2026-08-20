# PERSEUS — Product Context

## Register

**Product.** Design serves the task. The screen belongs to the text being typed;
every other element is summoned when wanted and gone the rest of the time. There
is no marketing surface — the trainer is the whole product.

## What it is

A browser typing trainer for Brazilian Portuguese and English, for prose and for
code. Fifteen programming languages with real auto-indentation, five text modes,
a deterministic corpus, and a server that refuses to take the client's word for
its own score.

The name is a constellation, and the product teaches a map: the planned virtual
keyboard is drawn as a star chart where each key's brightness reflects the
typist's real command of it.

## Users & purpose

**Who.** People who type for a living, and specifically people who type code.
The pt-BR corpus is not a translation of the English one — both banks are
written natively, because the rhythm of a language is most of what is being
trained.

**Context of use.** One sitting, full attention, keyboard under both hands. Runs
last from thirty seconds to a couple of minutes. The user is in flow and the
interface must not ask for any of it.

**The job.** Get measurably faster and more accurate at the characters they
actually type — including the ones their own keyboard makes expensive.

**Primary task per screen.** There is one screen. Its task is the run in
progress. Settings, ranking and session stats are overlays over that one task,
never destinations.

## Personality

**Honest · precise · astronomical.**

The product does not flatter. A corrected mistake still counts against accuracy,
because it happened, and hiding that would patronise the learner. The
verification layer says plainly what it cannot detect rather than implying it
catches everything. Documentation states the limits of its own claims.

Restraint is the house style: true black, mineral greens that run cold to warm,
no gradient and no grain on the page because both lift pure black into grey. The
atmosphere comes from the star field — light on black, not black made lighter.

## Anti-references

- **Generic Monkeytype.** Grey on grey, an endless config toolbar, no visual
  opinion at all. The obvious trap of the category, and the one to stay furthest
  from.
- **Duolingo gamification.** Mascots, confetti, streak flames, a badge for every
  correct keystroke. Collides head-on with the principle of not flattering the
  learner.

Two more worth naming even though they were not flagged: the SaaS dashboard
(identical card grids, giant metric with a small label, gradient on top) and the
neon hacker terminal — the second is dangerous precisely because the palette is
already black and green, which puts the cliché one lazy step away. The greens
are mineral, not neon, and that distinction is load-bearing.

## Accessibility

**Target: WCAG 2.2 AA.**

- Body text ≥ 4.5:1. The muted `ash` (#6e7f87) measures 4.76:1 on `obsidian` and
  5.05:1 on `void` — it passes, with little margin. Do not push it lighter.
- Visible label and accessible name must agree (2.5.3), which matters here
  because most controls are icon-or-select shaped.
- Focus is always visible: 2px emerald, 2px offset, defined once on
  `:focus-visible`.
- Overlays use the native `<dialog>` so focus trapping, Escape and the top layer
  come from the platform.
- Every animation needs a `prefers-reduced-motion` alternative. The caret
  already switches its spring for a near-instant one.

## Strategic design principles

1. **The character must land in the same frame as the keypress.** Nothing may
   enter the keystroke's critical path — not React state, not a canvas, not an
   animation. This outranks every other principle here.
2. **A control that lies is worse than one that is missing.** Ship the control
   when the thing it switches exists, not before.
3. **Say what the system actually did, with its numbers.** Warnings state the
   real count rather than a hardcoded approximation that starts lying the first
   time the data changes.
4. **Show the constraint rather than describing it.** The product is about keys;
   where a keyboard's reach can be drawn, draw it.
5. **Motion conveys state.** Overlays that arrive with weight read as summoned;
   decoration that conveys nothing does not ship.

## Current state

Phase 1 complete. Keyboard layout (ABNT2 / US / US-International) reaches the
corpus at `CORPUS_VERSION` 4. Account and ranking are built and tested but not
yet pointed at a database. The trainer runs fully offline without Supabase
credentials.

The 1v1 duel is built and runs end to end with no database at all: a private
room behind an invite code, both players generating the same text from the same
seed, live carets over SSE, and both timelines scored by the same server-side
replay a solo run gets. Names are chosen per match — a duel asks for no account.
What is still missing is a database for the history and a deploy. See
`docs/DUELO.md`.

Next: the star-map keyboard with a mastery heatmap, timed tests, sharing,
progress. See `docs/PHASE-2.md`.
