# PERSEUS — protocolo da fase 2

Documento canônico. A versão publicada como artifact é uma renderização deste
arquivo; quando os dois divergirem, este vale.

Estado em 18/08/2026, com a seção 5 reescrita em 20/08/2026. Decisões das
perguntas 1 a 4 respondidas; a 5 está aberta.

---

## 1. Onde as coisas estão

A fase 1 está fechada. O treinador funciona inteiro e **offline** — nunca
dependeu de rede, e continua não dependendo.

| Camada | Estado |
| --- | --- |
| `packages/contracts` | zod como fonte da verdade, tipos inferidos. Inclui `code`, `Syntax`, `SubmitResult`, `LeaderboardQuery`, `CORPUS_VERSION`. |
| `packages/corpus` | 5 modos, todos de frases/snippets reais. 119 frases pt-BR, 78 en, 25 snippets em 5 linguagens. Determinístico por seed. |
| `packages/engine` | Sessão, métricas, auto-indent, e `replay()` — a função que o servidor usa para pontuar. |
| `apps/web` | Next 16. Prosa e código, cancelamento por Esc, conta, ranking, envio de resultado. |
| `apps/api` | Nest 11. `/health`, `POST /results`, `GET /leaderboard`, e `/matches` para o duelo. Sobe e funciona sem Supabase e sem Postgres. |
| Banco | `supabase/migrations/0001_init.sql` a `0004_matches.sql`, prontos para rodar. Ainda não rodaram. |

**143 testes** (46 engine, 65 corpus, 32 api). `pnpm build`, `pnpm lint`,
`pnpm typecheck` e `pnpm test` limpos.

O que ainda não existe: nenhum projeto Supabase, nenhuma credencial, nenhum
deploy. É isso que a fase 2 abre.

---

## 2. Ligar o Supabase

Sequência real — cada passo depende do anterior.

### 2.1. Criar o projeto

Em <https://supabase.com/dashboard>, novo projeto. Região `South America
(São Paulo)` — a latência importa mais no ranking do que em qualquer outra
coisa aqui. Guarde a senha do banco.

### 2.2. Rodar a migração

SQL Editor → cole as migrações em ordem, uma de cada vez → Run:

1. `supabase/migrations/0001_init.sql` — tabelas, RLS, `leaderboard()`.
2. `supabase/migrations/0002_more_syntaxes.sql` — as linguagens novas do modo
   código; sem ela o banco recusa um resultado em Java ou Swift.
3. `supabase/migrations/0003_run_identity.sql` — `run_id` e `timeline_hash`, que
   são o que impede a mesma corrida de ser gravada duas vezes. Sem ela o insert
   falha, porque a API manda as duas colunas.

É Postgres comum: as três rodam em qualquer Postgres, não só no Supabase.

Cria: `profiles`, `results`, a função `leaderboard()`, as políticas de RLS e o
trigger que cria um perfil a cada cadastro.

Confira depois: Table Editor deve mostrar as duas tabelas com o cadeado de RLS
ligado. **Se o cadeado não estiver lá, pare** — sem RLS a tabela `results` é
legível por qualquer pessoa com a chave anon, que é pública por definição.

### 2.3. Configurar autenticação

Authentication → Providers → **Email** ligado, "Confirm email" ligado.
Desligue os outros provedores por enquanto.

Authentication → URL Configuration → adicione em *Redirect URLs*:

```
http://localhost:3000
https://SEU-DOMINIO
```

O login é link mágico por e-mail. Não há senha em lugar nenhum do sistema —
o que se guarda aqui é uma velocidade de digitação e um apelido, e pedir para
alguém inventar uma senha por isso seria coletar um passivo em troca de nada.

### 2.4. Colar as chaves

Project Settings → API. São duas chaves, e a diferença entre elas é a coisa
mais importante deste documento.

```sh
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

| Chave | Onde vai | Por quê |
| --- | --- | --- |
| `anon` (public) | `apps/web/.env.local` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` | É pública por design. Vai dentro do bundle JS. Tudo o que ela alcança está cercado pelas políticas de RLS. |
| `service_role` (secret) | `apps/api/.env` → `SUPABASE_SERVICE_ROLE_KEY` | **Ignora RLS por completo.** É acesso total ao banco. Nunca em `apps/web`, nunca em nada com prefixo `NEXT_PUBLIC_`, nunca num commit. |

`.gitignore` já bloqueia `.env` e `.env.*` com exceção dos `.example`.

Se a `service_role` vazar: Project Settings → API → Reset. Imediatamente.

### 2.5. Verificar

```sh
pnpm dev
curl http://localhost:3001/health
```

Deve responder `{"status":"ok","sync":true,"corpusVersion":2}`. Com `sync:false`
alguma das duas variáveis do `apps/api/.env` não chegou.

No site: ⚙ deve mostrar o formulário de e-mail em vez do aviso de "não
configurado", e o painel de Ranking deve mostrar um board vazio em vez da
mensagem de desligado.

---

## 3. Por que o resultado passa pela API

Esta é a decisão de arquitetura que sustenta o resto, então está escrita por
extenso.

**O navegador não escreve no banco.** Ele poderia — a chave anon com uma
política de insert resolveria em dez linhas. Mas um `wpm` calculado no
navegador é um número que qualquer pessoa digita no console, e um ranking
construído sobre isso é uma lista de quem abriu o DevTools primeiro.

O que o cliente envia é **o que ele fez**, não como se saiu:

```ts
{ config, corpusVersion, keystrokes: [{ char, at, index }] }
```

Não existe campo de velocidade no payload. O servidor então:

1. Regenera o texto a partir de `config` e `corpusVersion` — o mesmo seed,
   o mesmo corpus, o mesmo texto.
2. Reproduz a linha do tempo contra esse texto (`replay()` em
   `packages/engine`), recalculando `correct` de cada tecla.
3. Rejeita o que não fecha: tecla fora do texto, posição pulada, corrida que
   não chegou ao fim, duração zero, versão de corpus que este build não
   consegue regenerar.
4. Calcula ppm, cpm, precisão e consistência **ele mesmo** e grava isso.

`packages/engine/src/replay.test.ts` e
`apps/api/src/results/results.service.spec.ts` cobrem cada uma dessas recusas.

Duas consequências que valem registrar:

- **A tabela `results` não tem política de update nem de delete.** Não é
  esquecimento. Um resultado é o registro de algo que aconteceu, e uma nota que
  se pode editar depois não é uma nota.
- **`CORPUS_VERSION` existe por causa disso.** O mesmo seed produz texto
  diferente depois que os bancos de frases mudam. Sem a versão gravada na
  linha, um resultado antigo passaria a apontar para um texto que o dono nunca
  digitou — e o servidor não conseguiria verificar nada. **Suba o número
  sempre que mexer num builder ou nos bancos.** Está em
  `packages/contracts/src/index.ts` com o histórico ao lado.

### O que este modelo ainda não impede

Honestidade sobre o limite: alguém pode gerar uma linha do tempo sintética
com espaçamentos plausíveis e submeter sem ter digitado nada. O `replay`
prova consistência, não presença humana.

Defesas possíveis, em ordem de custo/benefício, para quando o ranking tiver
gente o bastante para valer a pena:

1. **Teto de plausibilidade** — recusar acima de ~250 ppm ou consistência
   acima de ~98% (humano nenhum é tão regular). Barato, pega script ingênuo.
2. **Rate limit por usuário** — n submissões por hora.
3. **Nonce de sessão** — o servidor emite o seed e a hora de início; a
   submissão precisa citá-los e chegar dentro de uma janela plausível.
4. **Distribuição de intervalos** — digitação humana tem uma assinatura
   estatística que um `setInterval` não tem.

Nada disso está construído. O item 1 é meia hora de trabalho e provavelmente
o próximo a fazer quando o ranking sair do zero.

---

## 4. Colocar no ar

Duas peças, dois lugares.

| Peça | Onde | Observação |
| --- | --- | --- |
| `apps/web` | Vercel | Root `apps/web`, build `pnpm build`. As três `NEXT_PUBLIC_*` como env vars. |
| `apps/api` | Fly.io ou Railway | Precisa de `SUPABASE_SERVICE_ROLE_KEY` como secret, nunca como env var em texto. |

Ordem: API primeiro (para saber a URL dela), depois o web apontando para ela,
depois voltar na API e pôr o domínio do web em `CORS_ORIGINS`, depois o mesmo
domínio nas *Redirect URLs* do Supabase.

**Atualizado em 20/08/2026:** o destino da API mudou de Fly.io/Railway para uma
VM Ampere A1 no Oracle Cloud Always Free, porque o duelo precisa segurar
conexões SSE abertas por minutos e o Postgres do duelo mora na mesma máquina.
O runbook inteiro está em `docs/DEPLOY.md`.

Do que faltava, saiu:

- ~~`Dockerfile` para a API~~ — dispensado: a API roda direto sob systemd na
  VM (`deploy/perseus-api.service`), e um container no meio só somaria uma
  camada para depurar.
- ~~Health check configurado no provedor~~ — `/health` e `/health/ready` estão
  no nginx e no `deploy.sh`.
- ~~Workflow de CI~~ — `.github/workflows/ci.yml`, rodando lint, typecheck,
  testes e build.

Continua faltando: backup do banco e algum monitoramento. Ver `docs/DEPLOY.md`
§7.

---

## 5. Multiplayer com amigos

**Construído.** Ver `docs/DUELO.md`, que é o documento canônico do duelo — esta
seção ficou como registro do que mudou em relação ao que estava desenhado aqui.

O formato é o que estava previsto: sala privada por código, mesma semente e
mesma config para os dois, texto gerado nos dois clientes e nunca transmitido,
progresso em tempo real como enfeite e pontuação pelo replay no servidor.

Três coisas mudaram na hora de escrever:

- **Dois jogadores, não N.** Duelo 1v1, decidido em 20/08/2026. Some o lobby, a
  lista de participantes e o placar de N linhas.
- **Sem conta.** Cada pessoa escolhe um nome por partida. Um duelo não pede
  cadastro; o nome é o que fica gravado nos dois históricos, ao lado de quem
  venceu. A prova de ser jogador daquela sala é um token HMAC emitido no
  `join`, não o código de convite — que é público por natureza.
- **Sem Supabase.** O tempo real é SSE na própria API Nest, e a persistência é
  um Postgres comum via `pg` (`0004_matches.sql` não toca no schema `auth`).
  Isso vale para o duelo apenas; o ranking individual continua como está nesta
  fase 2. O destino combinado é a VM Ampere do Oracle Cloud Always Free.

O que continua valendo desta seção: **o progresso em tempo real não é o placar.**
Cada jogador submete sua linha do tempo no fim e o servidor pontua — o mesmo
`ResultsService.score` do modo individual.

## 6. O que eu decidi por você

Escolhas que tomei para não deixar o trabalho parado. Todas reversíveis, e
cada uma tem uma razão que dá para discordar.

| Decisão | Razão | Como reverter |
| --- | --- | --- |
| Login só por e-mail, sem senha | Não há nada aqui que justifique guardar uma senha, e é o único fluxo sem "esqueci minha senha" atrás. | Trocar por OAuth em `use-auth.ts`; o schema não muda. |
| Ranking mostra **um resultado por pessoa** (o melhor) | Um board onde o mais rápido ocupa os dez primeiros lugares é um board que mais ninguém lê. | `distinct on` na função `leaderboard()`. |
| Piso de 90% de precisão para entrar no board | 200 ppm com 40% de precisão não é digitar rápido, é outra atividade. | `LEADERBOARD_MIN_ACCURACY` em contracts + a função SQL. |
| Código e prosa em boards separados | Cinco caracteres é uma palavra em prosa inglesa e não é nada em Rust. | Não reverter. Sério. |
| `results` sem update nem delete | Um resultado é um registro do que aconteceu. | Adicionar política — mas pense antes. |
| Sem syntax highlighting | O feedback de certo/errado precisa ser o único uso de cor no texto. | Seção 7. |

---

## 7. Decisões — respondidas em 18/08/2026

**1. Apelido no ranking → o usuário escolhe.** O trigger continua gerando
`typist_a1b2c3d4` como fallback (um perfil sem apelido quebraria todo join
downstream), mas a pessoa passa a escolher o seu. A implementar: pedir no
primeiro login e deixar editável depois nas configurações. Precisa de uma
checagem de unicidade contra `profiles.username`, que é `citext` — dois apelidos
que só diferem no caixa competiriam como se fossem a mesma pessoa.

**2. Resultado de quem não tem conta → guardar.** Decidido que sim; a forma fica
para depois. A restrição a respeitar: o modelo da seção 3 não confia em números
vindos do cliente, então o que se guarda localmente tem de ser a **linha do
tempo completa**, não o resultado calculado — caso contrário nada disso pode ser
sincronizado depois sem virar exatamente o buraco que a seção 3 fecha. Isso é
bem mais pesado no `localStorage`; provavelmente um teto de N corridas.

**3. Multiplayer → privado.** Sala por código de convite entre amigos.
Confirmado. Sem matchmaking, sem ELO, sem moderação — nada disso entra.

**4. Supabase → adiado.** Não vamos ligar agora. A seção 2 fica de pé para
quando for a hora; nada no código depende disso, porque o app roda inteiro sem
credencial.

**5. Syntax highlighting → em aberto.** Ver a comparação lado a lado. Em resumo:
na área de digitação a cor já significa uma coisa — branco é acerto, vermelho é
erro, cinza é o que falta. Cor de sintaxe põe mais cinco ou seis cores por cima
falando de outro assunto, e o verde de string é o pior caso, porque verde no
PERSEUS é a cor de "está indo bem".

---

## 8. Ordem sugerida

Com o Supabase adiado, a fila muda: tudo o que não depende de credencial vem
primeiro.

1. Tela de apelido (decisão 1) — dá para construir sem Supabase no ar, mas só
   dá para **testar** com ele. Fica logo depois da seção 2.
2. Teto de plausibilidade (seção 3, defesa 1) — não depende de nada, e é a
   defesa mais barata contra script.
3. CI rodando `pnpm lint && pnpm typecheck && pnpm test`.
4. `Dockerfile` da API.
5. Seção 2 inteira, quando você quiser. **Precisa de você** — são suas
   credenciais.
6. Deploy (seção 4).
7. ~~`0002_matches.sql` e multiplayer privado (decisão 3).~~ **Feito** — saiu
   como `0004_matches.sql` e `docs/DUELO.md`, antes do resto da fila, porque não
   depende de credencial nenhuma para ser escrito nem para ser testado. O que
   falta dele é o que falta de tudo: banco no ar e deploy.
