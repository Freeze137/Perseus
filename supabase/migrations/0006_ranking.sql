-- PERSEUSS — ranking, identidade e patente, em Postgres comum.
--
-- Esta migração existe porque a 0001 não roda onde o produto de fato mora. Ela
-- referencia `auth.users` e apoia o ranking inteiro em row-level security com
-- chave anon, que são duas coisas que o Postgres do Neon não tem para oferecer:
-- lá quem conecta é a API, como dona, e não existe browser falando com o banco.
-- O resultado prático é que o ranking estava construído e desligado — o painel
-- dizia "ainda não está ligado neste ambiente" desde sempre.
--
-- O recorte é o mesmo da 0004, e pelo mesmo motivo: isto é Postgres comum e
-- roda em qualquer Postgres. Num banco que rode a 0001, estas tabelas convivem
-- com as de lá sem se cruzarem — são dois desenhos do mesmo ranking, e este é o
-- que a API lê.
--
-- Identidade sem conta. Não há e-mail e não há senha em lugar nenhum: o que
-- identifica alguém é um passaporte assinado pela API, guardado no navegador,
-- mais um código de recuperação de seis palavras que só o dono tem. É a mesma
-- decisão que a 0004 tomou para o duelo — um nome, não uma conta — levada ao
-- ranking, que era a única parte do produto que ainda pedia mais que isso.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- players
--
-- `username` é citext para duas pessoas não registrarem nomes que diferem só na
-- caixa e depois disputarem o board parecendo uma só.
--
-- `recovery_hash` guarda o código de recuperação como hash e nunca como texto,
-- pela mesma razão que se faz isso com senha: um produto capaz de te mostrar
-- teu código de novo é um produto que guardou teu código. Seis palavras
-- sorteadas de uma lista de 2048 são ~121 bits — não é um segredo escolhido por
-- humano, então não precisa do custo de um KDF para resistir a dicionário.
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id             uuid primary key default gen_random_uuid(),
  username       citext not null unique
                 check (char_length(username) between 3 and 20),
  recovery_hash  text not null,
  created_at     timestamptz not null default now(),
  -- Quando a identidade foi vista pela última vez, para uma limpeza futura
  -- saber distinguir conta abandonada de conta de quem digita aos domingos.
  last_seen_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- runs
--
-- Toda corrida pontuada pelo servidor, solo ou de duelo. `config` carrega a
-- SessionConfig inteira, semente incluída, que é o que mantém a corrida
-- reproduzível; `corpus_version` é o que mantém essa promessa honesta depois
-- que os bancos de texto mudam.
--
-- Não existe política de update nem de delete, aqui nem em lugar nenhum: uma
-- corrida é o registro de algo que aconteceu, e nota que se edita depois não é
-- nota. A mesma regra que a 0001 escreveu e que vale continuar escrevendo.
-- ---------------------------------------------------------------------------
create table if not exists public.runs (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.players (id) on delete cascade,

  config          jsonb not null,
  corpus_version  integer not null,

  -- Levantados do config para poderem ser indexados. Consulta de board não
  -- pode pagar um lookup em jsonb por linha.
  kind            text not null
                  check (kind in ('words', 'quote', 'punctuation', 'numbers', 'code')),
  language        text not null check (language in ('pt-BR', 'en')),
  syntax          text,
  length          integer not null check (length > 0),
  keyboard_layout text not null,

  -- A família da patente, derivada em vez de escrita. Coluna gerada porque é
  -- função pura de `kind`: deixar a aplicação preencher abriria a porta para
  -- uma linha de código classificada como prosa, e o banco é o único lugar
  -- onde essa porta pode ser fechada de vez.
  family          text generated always as (
                    case when kind = 'code' then 'code' else 'prose' end
                  ) stored,

  -- De onde a corrida veio. O duelo pontua pelo mesmo `ResultsService.score`
  -- que o solo, então a corrida vale o mesmo nos dois — e sem esta coluna não
  -- haveria como contar quantas das suas vieram de briga com alguém.
  source          text not null default 'solo' check (source in ('solo', 'duel')),
  match_id        uuid references public.matches (id) on delete set null,

  wpm             numeric(6, 2) not null check (wpm >= 0),
  cpm             numeric(7, 2) not null check (cpm >= 0),
  raw_wpm         numeric(6, 2) not null check (raw_wpm >= 0),
  accuracy        numeric(5, 2) not null check (accuracy between 0 and 100),
  consistency     numeric(5, 2) not null check (consistency between 0 and 100),
  correct         integer not null check (correct >= 0),
  incorrect       integer not null check (incorrect >= 0),
  duration_ms     integer not null check (duration_ms >= 0),

  -- As duas identidades de uma corrida, e as duas formas de ela chegar duas
  -- vezes: o bilhete cobre a retentativa depois de resposta perdida, e a
  -- impressão digital da timeline cobre a gravação boa reenviada sob bilhete
  -- novo. Nulos são permitidos e os índices são parciais por causa disso.
  run_id          uuid,
  timeline_hash   text,

  completed_at    timestamptz not null,
  created_at      timestamptz not null default now(),

  constraint syntax_only_on_code check ((kind = 'code') = (syntax is not null)),
  constraint duel_has_match      check ((source = 'duel') = (match_id is not null))
);

create unique index if not exists runs_ticket_idx
  on public.runs (player_id, run_id) where run_id is not null;

create unique index if not exists runs_timeline_idx
  on public.runs (player_id, timeline_hash) where timeline_hash is not null;

-- O caminho de leitura da patente: as últimas cinco corridas válidas de uma
-- pessoa numa família. O 75 é o `LEADERBOARD_MIN_ACCURACY` dos contratos —
-- predicado de índice não aceita parâmetro, então o número aparece aqui e lá.
-- Mexer num obriga a mexer no outro, e é por isso que ele está dito por extenso.
create index if not exists runs_patente_idx
  on public.runs (player_id, family, completed_at desc)
  where accuracy >= 75;

create index if not exists runs_player_recent_idx
  on public.runs (player_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- player_bests
--
-- O recorde de cada pessoa em cada recorte do board, mantido na escrita.
--
-- Sem isto, um board é um `distinct on` sobre a tabela inteira de corridas a
-- cada leitura, e "qual é a minha posição" é a mesma varredura outra vez. Uma
-- linha por pessoa por recorte também é o que impede um digitador rápido de
-- ocupar sozinho as dez primeiras posições — board assim ninguém mais lê.
--
-- Só entram corridas que passaram o piso de precisão, então não há predicado a
-- repetir na leitura: estar aqui já quer dizer que classificou.
-- ---------------------------------------------------------------------------
create table if not exists public.player_bests (
  player_id    uuid not null references public.players (id) on delete cascade,
  kind         text not null,
  language     text not null,
  -- '' em prosa em vez de null: chave primária não compara nulos, e um board de
  -- prosa precisa de uma chave tão sólida quanto a de código.
  syntax_key   text not null default '',

  wpm          numeric(6, 2) not null,
  accuracy     numeric(5, 2) not null,
  run_id       uuid not null references public.runs (id) on delete cascade,
  achieved_at  timestamptz not null,

  primary key (player_id, kind, language, syntax_key)
);

-- A ordenação do board, inteira, dentro do índice: o empate em ppm é desfeito
-- por quem chegou lá primeiro, e ordenar por isso sem índice seria um sort em
-- cima de toda a tabela a cada abertura de gaveta.
create index if not exists bests_board_idx
  on public.player_bests (kind, language, syntax_key, wpm desc, achieved_at asc);

-- ---------------------------------------------------------------------------
-- player_patentes
--
-- A patente de cada pessoa em cada família, recalculada a cada corrida válida.
--
-- Guarda a média e a data, nunca o degrau. O degrau é função da média e da
-- régua da família, e a régua vive nos contratos — gravá-lo aqui criaria uma
-- segunda fonte da verdade que começaria a mentir no dia em que um limiar
-- mudasse, calada, para todo mundo que não digitasse desde então.
--
-- `runs_total` é a família inteira e não a amostra: é ele que responde se já há
-- cinco corridas para a patente existir. `wpm_avg` é a média das cinco mais
-- recentes — o que a pessoa sustenta, e não o que ela conseguiu num dia bom.
-- ---------------------------------------------------------------------------
create table if not exists public.player_patentes (
  player_id    uuid not null references public.players (id) on delete cascade,
  family       text not null check (family in ('prose', 'code')),

  wpm_avg      numeric(6, 2) not null,
  runs_total   integer not null check (runs_total >= 0),
  last_run_at  timestamptz not null,

  primary key (player_id, family)
);

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Ligada e sem política nenhuma, que lê como esquecimento e não é. A API é a
-- única coisa que conecta neste banco, e conecta como dona, o que passa por
-- cima de RLS. A cerca existe para o outro caso: se estas tabelas um dia
-- viverem num projeto com chave pública, tabela sem RLS é tabela que a internet
-- inteira lê. Nenhuma política significa nenhum acesso para quem não é dono —
-- que é o padrão correto para tabela que só o servidor deveria tocar.
--
-- Mesma decisão, e mesmas palavras, da 0004.
-- ---------------------------------------------------------------------------
alter table public.players        enable row level security;
alter table public.runs           enable row level security;
alter table public.player_bests   enable row level security;
alter table public.player_patentes enable row level security;
