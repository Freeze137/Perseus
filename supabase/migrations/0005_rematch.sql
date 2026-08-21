-- PERSEUS — revanche: uma sala, várias partidas.
--
-- A `0004` gravou uma suposição na tabela sem dizer que era uma: `invite_code`
-- era `unique`, o que só faz sentido enquanto uma sala hospeda exatamente um
-- duelo. A revanche quebra isso — os dois continuam na mesma sala, com o mesmo
-- link, e jogam de novo — e o `unique` transformaria a segunda partida num erro
-- de gravação em vez de numa linha de histórico.
--
-- O que muda é a leitura da tabela, não o formato dela: `id` deixa de ser "a
-- sala" e passa a ser "a partida" (o `roundId` que a API sorteia a cada
-- rodada), e `invite_code` passa a ser o que sempre foi de fato — o endereço da
-- sala, que se repete entre as partidas jogadas nela.
--
-- Idempotente e sem tocar nas linhas existentes: os duelos já gravados têm
-- códigos distintos entre si e continuam válidos sob a regra nova.

-- O nome vem do `unique` declarado na coluna, em 0004. Nomeado assim pelo
-- próprio Postgres; o `if exists` cobre um banco onde ele nunca existiu.
alter table public.matches
  drop constraint if exists matches_invite_code_key;

-- O código continua sendo caminho de busca — só deixou de ser exclusivo.
-- Sem isto, procurar as partidas de uma sala vira varredura da tabela.
create index if not exists matches_invite_code_idx
  on public.matches (invite_code);
