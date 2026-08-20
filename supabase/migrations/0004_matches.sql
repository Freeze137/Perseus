-- PERSEUS — duels.
--
-- Two tables that record 1v1 matches between two friends. Nothing here
-- references `auth.users` or `public.profiles`, and that is deliberate: a duel
-- asks for a name, not an account. Both people type under whatever name they
-- picked for that match, and the name is stored on the row rather than joined
-- in, so the history stays readable even though there is nobody to join to.
--
-- The consequence, stated plainly: these two tables run on any Postgres on
-- their own. Migrations 0001-0003 do not — they reference Supabase's `auth`
-- schema. If this database is a plain Postgres box, this file is the only one
-- of the four that applies, and the solo leaderboard is simply not part of it.
--
-- A row is written here only when a duel actually finished. Rooms that were
-- opened and abandoned live and die in the API's memory and are never written:
-- a table of duels that did not happen is not a history of anything.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- matches
--
-- `config` carries the whole SessionConfig, seed included, which is what makes
-- the text of a past duel reproducible — the same property the solo results
-- table relies on, for the same reason. `corpus_version` is what keeps that
-- claim honest after the banks change.
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id              uuid primary key,
  invite_code     text not null unique
                  check (invite_code ~ '^[A-Z2-9]{6}$'),

  state           text not null
                  check (state in ('done', 'abandoned')),

  config          jsonb not null,
  corpus_version  integer not null,

  -- Lifted out of config so a history list can be filtered without a jsonb
  -- lookup per row, exactly as on `results`.
  kind            text not null
                  check (kind in ('words', 'quote', 'punctuation', 'numbers', 'code')),
  language        text not null check (language in ('pt-BR', 'en')),
  syntax          text,

  created_at      timestamptz not null default now(),
  -- When the keys unlocked, not when the room was opened.
  started_at      timestamptz,
  finished_at     timestamptz,

  -- Null on a draw and on an abandoned room. Which of the two it is can be
  -- read off `state`, so there is no third column saying so.
  winner_slot     smallint check (winner_slot in (1, 2))
);

-- The history list reads newest first and only ever wants finished duels.
create index if not exists matches_finished_idx
  on public.matches (finished_at desc)
  where state = 'done';

-- ---------------------------------------------------------------------------
-- match_players
--
-- Two rows per match, keyed by slot. Slot 1 is the host; slot 2 took the
-- invite. The scores are the server's own — replayed from the timeline the
-- browser sent, never the numbers the browser drew on screen — which is the
-- same rule the solo path is built on and the reason a duel result is worth
-- keeping at all.
--
-- The numbers are nullable because 'unfinished' is a real ending: somebody who
-- did not reach the end of the text inside the grace period has an outcome and
-- no score, and a zero would be a lie about a run that was going fine.
-- ---------------------------------------------------------------------------
create table if not exists public.match_players (
  match_id      uuid not null references public.matches (id) on delete cascade,
  slot          smallint not null check (slot in (1, 2)),

  display_name  text not null
                check (char_length(display_name) between 1 and 20),
  joined_at     timestamptz not null default now(),
  finished_at   timestamptz,

  wpm           numeric(6, 2) check (wpm >= 0),
  cpm           numeric(7, 2) check (cpm >= 0),
  accuracy      numeric(5, 2) check (accuracy between 0 and 100),
  consistency   numeric(5, 2) check (consistency between 0 and 100),
  duration_ms   integer check (duration_ms >= 0),

  outcome       text
                check (outcome in ('won', 'lost', 'draw', 'unfinished', 'abandoned')),

  primary key (match_id, slot)
);

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Enabled with no policies at all, which reads as a mistake and is not one.
--
-- The API is the only thing that connects to this database, and it connects as
-- the owner, which bypasses RLS. The fence is here for the other case: if these
-- tables ever live in a Supabase project, the anon key is public by definition
-- and a table without RLS is a table the whole internet can read. No policy
-- means no access for anybody who is not the owner — which is the correct
-- default for a table nothing but the server should ever touch directly.
-- ---------------------------------------------------------------------------
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
