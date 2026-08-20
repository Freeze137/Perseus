-- PERSEUS — initial schema.
--
-- Two tables and one function. The function exists because a leaderboard needs
-- to show other people's numbers while row-level security is busy making sure
-- nobody can read other people's rows: it is the one hole in that wall, and it
-- is narrow on purpose — rank, name, speed, accuracy, date, nothing else.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- profiles
--
-- One row per account, created on sign-up. Usernames are citext so that two
-- people cannot register names that differ only in case and then compete as if
-- they were the same person on a scoreboard.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    citext not null unique
              check (char_length(username) between 3 and 32
                     and username ~ '^[a-zA-Z0-9_-]+$'),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- results
--
-- `config` keeps the whole SessionConfig as sent, so a run stays reproducible.
-- The fields the leaderboard filters on are lifted out into real columns —
-- a jsonb lookup per row is not something to put under an index that has to
-- answer in a page load.
--
-- `corpus_version` is what makes an old row honest. The same seed produces
-- different text after the banks change; without this column a stored result
-- would silently start pointing at a text its owner never typed.
-- ---------------------------------------------------------------------------
create table if not exists public.results (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,

  config          jsonb not null,
  corpus_version  integer not null,

  -- Lifted out of config for indexing.
  kind            text not null check (kind in ('words', 'quote', 'punctuation', 'numbers', 'code')),
  language        text not null check (language in ('pt-BR', 'en')),
  syntax          text check (syntax in ('typescript', 'python', 'rust', 'go', 'sql', 'mix')),

  wpm             numeric(6, 2) not null check (wpm >= 0),
  cpm             numeric(7, 2) not null check (cpm >= 0),
  raw_wpm         numeric(6, 2) not null check (raw_wpm >= 0),
  accuracy        numeric(5, 2) not null check (accuracy between 0 and 100),
  consistency     numeric(5, 2) not null check (consistency between 0 and 100),
  correct         integer not null check (correct >= 0),
  incorrect       integer not null check (incorrect >= 0),
  duration_ms     integer not null check (duration_ms >= 0),

  completed_at    timestamptz not null,
  created_at      timestamptz not null default now(),

  -- Code and prose are different sports. A row must say which one it is, and
  -- only code rows may name a syntax.
  constraint syntax_only_on_code check ((kind = 'code') = (syntax is not null))
);

create index if not exists results_user_completed_idx
  on public.results (user_id, completed_at desc);

-- The leaderboard's own access path: one board per kind, ordered by speed.
create index if not exists results_board_idx
  on public.results (kind, language, wpm desc)
  where accuracy >= 90;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Default deny. A signed-in person reads and writes their own results and
-- nothing else; profiles are readable by everyone because a scoreboard without
-- names is a list of numbers.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.results  enable row level security;

drop policy if exists profiles_read_all on public.profiles;
create policy profiles_read_all on public.profiles
  for select using (true);

drop policy if exists profiles_write_own on public.profiles;
create policy profiles_write_own on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists results_read_own on public.results;
create policy results_read_own on public.results
  for select using (auth.uid() = user_id);

-- Insert only. No update and no delete policy exists, which means neither is
-- possible through the API: a result is a record of something that happened,
-- and a score you can edit afterwards is not a score.
drop policy if exists results_insert_own on public.results;
create policy results_insert_own on public.results
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- leaderboard()
--
-- Security definer, so it can see across users where the select policy cannot.
-- It returns one row per person — their best run — rather than one row per run,
-- because a board where one fast typist holds the top ten places is a board
-- nobody else reads.
--
-- The accuracy floor is part of the definition of the sport: a 200 wpm run at
-- 40% accuracy is not a fast run, it is a different activity.
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard(
  p_kind      text default 'words',
  p_language  text default 'pt-BR',
  p_syntax    text default null,
  p_since     timestamptz default null,
  p_limit     integer default 50
)
returns table (
  rank        bigint,
  username    text,
  wpm         numeric,
  accuracy    numeric,
  achieved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct on (r.user_id)
      r.user_id, r.wpm, r.accuracy, r.completed_at
    from public.results as r
    where r.kind = p_kind
      and r.language = p_language
      and (p_syntax is null or r.syntax = p_syntax)
      and (p_since is null or r.completed_at >= p_since)
      and r.accuracy >= 90
    order by r.user_id, r.wpm desc, r.completed_at asc
  )
  select
    row_number() over (order by b.wpm desc, b.completed_at asc) as rank,
    p.username::text,
    b.wpm,
    b.accuracy,
    b.completed_at
  from best as b
  join public.profiles as p on p.id = b.user_id
  order by b.wpm desc, b.completed_at asc
  limit least(coalesce(p_limit, 50), 200);
$$;

revoke all on function public.leaderboard(text, text, text, timestamptz, integer) from public;
grant execute on function public.leaderboard(text, text, text, timestamptz, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- New sign-ups get a profile automatically. Doing it in a trigger rather than
-- in the client means an account can never exist without one, which is the
-- state that breaks every join downstream.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    -- Falls back to a name derived from the account id, which the person can
    -- change later. A null username would fail the not-null constraint and
    -- take the whole sign-up down with it.
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'typist_' || substr(new.id::text, 1, 8)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
