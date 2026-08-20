-- Every run gets an identity, and no run gets stored twice.
--
-- Two columns, two unique indexes, and between them the two ways the same run
-- used to be able to arrive more than once:
--
--   run_id        the ticket the server issued when the typing started. A retry
--                 after a dropped response carries the same one, so the second
--                 insert collides instead of adding a duplicate row to the board.
--   timeline_hash a fingerprint of the run itself, scoped to its owner. Blocks
--                 the other trick: recording one very good run and submitting it
--                 again under a fresh ticket.
--
-- Both are nullable so the rows written before this migration stay valid — they
-- predate tickets and cannot be given one after the fact. The indexes are
-- partial for the same reason: a unique index over a column full of nulls would
-- be either useless or, on a database that treats nulls as equal, wrong.
--
-- Nothing here is Supabase-specific. It is ordinary Postgres and runs on any
-- Postgres, which is worth saying out loud while the hosting question is open.
alter table public.results
  add column if not exists run_id        uuid,
  add column if not exists timeline_hash text;

create unique index if not exists results_run_id_idx
  on public.results (user_id, run_id)
  where run_id is not null;

create unique index if not exists results_timeline_idx
  on public.results (user_id, timeline_hash)
  where timeline_hash is not null;

-- The board index did not know about syntax, so every code board — and there
-- are fifteen of them now — filtered rows the index had already handed over.
-- Prose keeps the original index; code gets one that ends where it is scanned.
create index if not exists results_code_board_idx
  on public.results (syntax, language, wpm desc)
  where accuracy >= 90 and kind = 'code';
