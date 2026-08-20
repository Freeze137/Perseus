-- Ten more programming languages in the code mode.
--
-- The column keeps a check rather than becoming an enum: a new syntax is a
-- one-line edit here, while an enum would need a type alteration that cannot
-- run inside every migration transaction Supabase uses.
--
-- The old rows stay valid — nothing was renamed or removed, only added — so
-- this drops and re-adds the constraint instead of rewriting any data.
alter table public.results
  drop constraint if exists results_syntax_check;

alter table public.results
  add constraint results_syntax_check check (
    syntax in (
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
      'mix'
    )
  );
