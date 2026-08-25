# PERSEUSS — duelo 1v1

Documento canônico do multiplayer. Estado em 20/08/2026: **escrito, testado e
rodando local**. Falta só o que depende de você — o banco e o deploy.

---

## 1. O que existe

Sala privada por código de convite, dois jogadores, o mesmo texto, e o servidor
decidindo quem venceu.

| Camada | Onde | Estado |
| --- | --- | --- |
| Schemas | `packages/contracts/src/index.ts` | `Match`, `MatchPlayer`, `MatchEvent`, `MatchSummary`, constantes do duelo. |
| Migração | `supabase/migrations/0004_matches.sql` | `matches`, `match_players`. Postgres comum, sem dependência do `auth` do Supabase. |
| API | `apps/api/src/matches/` | REST + stream SSE, relógio, contagem, carência, placar. |
| Banco | `apps/api/src/db/postgres.service.ts` | Conexão `pg` opcional. Sem `DATABASE_URL` o duelo roda igual e só não fica gravado. |
| Web | `apps/web/src/features/multiplayer/` | Sala, convite, corrida com as duas barras, resultado, histórico. |
| Rota | `apps/web/src/app/duelo/[code]/page.tsx` | `/duelo/ABC234` — o link que você manda pro amigo. |

**11 testes novos** em `matches.service.spec.ts` — 32 na API, 143 no
repositório. `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` limpos.

Um duelo inteiro já foi executado ponta a ponta contra a API real: criar, entrar,
contagem, stream SSE, as duas submissões, placar, histórico e token forjado
recusado com 401.

---

## 2. Como funciona

### O texto não trafega

Os dois clientes recebem a mesma `config` — inclusive a semente — e geram o
texto localmente. `packages/corpus` é determinístico, então os caracteres são
idênticos por construção. Não existe "sincronizar o texto": ele nunca passa pela
rede.

**A semente é sorteada pelo servidor.** Se o anfitrião escolhesse, ele poderia
gerar o texto, treinar em cima dele e só então abrir a sala.

### O placar não vem do tempo real

O que anda pela rede durante a corrida é a posição do cursor, cinco vezes por
segundo, e ela é **enfeite**: move a barra do outro e nada mais. No fim, cada
jogador manda a linha do tempo completa e o servidor:

1. Regenera o texto a partir da `config`.
2. Reproduz a linha do tempo contra ele (`replay()`).
3. Recusa o que não fecha, checa se o ritmo é humano (`checkTimeline`), e limita
   a duração pelo relógio que ele mesmo mediu desde a largada.
4. Calcula ppm, precisão e consistência **ele mesmo**.

É exatamente o mesmo caminho da corrida individual — `ResultsService.score`, um
método só, chamado dos dois lugares. Se o placar viesse do canal de tempo real,
o multiplayer seria trivialmente forjável enquanto o modo solo não é.

### Quem entra na sala

Duelo não tem conta. Cada pessoa escolhe um nome **por partida**, e é esse nome
que aparece pro outro e fica no histórico dos dois.

O que separa um jogador de quem só leu o código por cima do ombro é o **token**
que o servidor emite no `join`: HMAC de `match:<id>:<slot>`, guardado no
`localStorage` do navegador. Sem ele não dá pra publicar progresso nem submeter
corrida. É também o que faz um F5 no meio do duelo voltar pra sala em vez de
começar de novo.

### A linha do tempo de uma partida

```
create   anfitrião abre a sala           → 'lobby'      (expira em 15 min vazia)
join     o amigo usa o código            → 'countdown'  (5 s)
timer    a contagem zera                 → 'running'    (teclas liberadas)
finish   alguém chega ao fim             → carência de 30 s pro outro
settle   os dois entregaram, ou a
         carência estourou               → 'done', vencedor decidido e gravado
```

Quem não completou dentro dos 30 segundos fica como `unfinished` — na tela,
"não completou a tempo". Sem escárnio: o resto do produto não alfineta quem foi
mal e aqui não seria diferente.

Vencedor é o maior ppm entre quem terminou. Empate exato (duas casas decimais)
fica `draw`, sem vencedor. Se ninguém terminar, a sala vira `abandoned` depois de
20 minutos e **não é gravada** — a tabela é um registro de duelos que
aconteceram.

### Tempo real por SSE, não por socket

O tráfego é de mão única (tudo que o cliente tem a dizer já é uma requisição que
ele faz), então o stream é `text/event-stream`: passa por proxy reverso sem
handshake de upgrade, reconecta sozinho, e não custa dependência nenhuma. O preço
é o token na query string — `EventSource` não manda cabeçalho — e por isso o log
da API redige esse parâmetro.

### O que a sala não sobrevive

Escrito aqui porque é o tipo de coisa que se descobre no pior momento:

- **Um restart.** As salas vivem na memória do processo. Um deploy no meio de um
  duelo encerra o duelo.
- **Duas instâncias.** Dois processos atrás de um balanceador colocariam os dois
  jogadores em salas diferentes. Uma instância é a topologia assumida; mais que
  isso exige um canal compartilhado, não um mapa maior.
- **Teto de 200 salas simultâneas**, além do limite de requisições por IP.

---

## 3. Rodar local, hoje

Sem banco nenhum:

```sh
pnpm dev
```

Abra `http://localhost:3000`, clique em **⚔ Duelo**, escolha um nome e crie a
sala. Abra o link em outra aba (ou outro navegador — o token é por navegador) e
entre com outro nome. A contagem começa sozinha.

Sem `DATABASE_URL`, o histórico responde `unavailable` e mostra só os duelos que
acabaram de acontecer, que ainda estão na memória da API por 5 minutos.

### Com Postgres local, para testar a gravação

```sh
docker run -d --name perseus-db -e POSTGRES_PASSWORD=perseus -p 5432:5432 postgres:17
docker exec -i perseus-db psql -U postgres < supabase/migrations/0004_matches.sql
```

Em `apps/api/.env`:

```sh
DATABASE_URL=postgresql://postgres:perseus@localhost:5432/postgres
DATABASE_SSL=false
```

`curl http://localhost:3001/health` deve responder `"duelHistory":true`, e
`/health/ready` diz se o banco está de fato respondendo.

> **Ainda não rodou contra um Postgres de verdade.** A migração e o
> `MatchStoreService` estão escritos e tipados, mas nunca foram executados
> contra um servidor — não havia Docker no ar nesta máquina. É o único pedaço do
> duelo que ainda não passou por uma execução real, e os dois comandos acima são
> o teste.

---

## 4. Colocar no ar

O passo a passo completo — VM, portas, Postgres, TLS, Vercel e verificação —
está em **`docs/DEPLOY.md`**, junto dos arquivos prontos em `deploy/`:
`setup-vm.sh`, `perseus-api.service`, `nginx-perseus-api.conf` e `deploy.sh`.

Em uma frase: a API e o Postgres moram na mesma VM Ampere A1 do Always Free,
com nginx e Let's Encrypt na frente; o site vai para a Vercel apontando para o
domínio da API.

Os dois detalhes que este documento precisa registrar, porque são consequência
do desenho do duelo e não do provedor:

- **`proxy_buffering off`** no bloco `/matches/` do nginx. Ligado, o proxy
  segura os eventos e entrega a corrida inteira depois que ela acabou.
- **Uma instância só.** As salas vivem na memória do processo; duas cópias
  atrás de um balanceador colocariam os dois jogadores em salas diferentes.

### O que muda em relação ao plano antigo

O documento da fase 2 assumia Supabase para tudo. O duelo não usa Supabase:

- **Migrações 0001–0003 referenciam `auth.users`**, do Supabase. Num Postgres
  comum elas não rodam. A `0004` roda em qualquer Postgres, sozinha.
- Ou seja: dá pra ter o duelo no ar **sem** ranking individual, e ligar o
  Supabase depois — ou migrar o resto pra este mesmo Postgres, que é o caminho
  natural agora que existe uma conexão `pg` no projeto.

---

## 5. Decisões tomadas aqui

| Decisão | Por quê | Como reverter |
| --- | --- | --- |
| Dois jogadores, sem lobby maior | Foi o pedido, e simplifica tudo: um par de barras, um vencedor, sem matchmaking. | `MATCH_PLAYERS` está em contracts, mas o placar e a tela assumem dois. |
| Nome por partida, sem conta | Duelo é entre amigos; exigir cadastro antes de correr é o atrito que mata a feature. | Vincular `user_id` opcional em `match_players`. |
| Servidor sorteia a semente | Quem escolhe a semente pode treinar o texto antes. | Não reverter. |
| Carência de 30 s | Encerrar no primeiro que termina tira a corrida de quem está a três palavras do fim; esperar pra sempre deixa uma aba fechada segurando a sala. | `MATCH_GRACE_MS`. |
| Progresso a cada 200 ms | Abaixo disso o olho não distingue e o tráfego dobra. | `MATCH_PROGRESS_MS`. |
| SSE em vez de WebSocket | Tráfego de mão única, atravessa proxy sem upgrade, zero dependência nova. | Trocar o controller por um gateway; o resto do serviço não muda. |
| Sala na memória, só o fim no banco | Uma linha escrita e apagada por lobby abandonado, pra um estado que dura menos que o deploy que o perderia. | Ver seção 2, "o que a sala não sobrevive". |
| Duelo abandonado não é gravado | A tabela é o registro de duelos que aconteceram. | `MatchStoreService.save`. |

---

## 6. O que ainda não existe

- **Revanche.** Hoje se joga de novo abrindo outra sala. Um botão "de novo" que
  reaproveita os dois nomes é meia hora de trabalho.
- **Espectador.** O link só serve pra quem vai jogar; ninguém assiste.
- **Duelo com conta.** Um resultado de duelo não entra no ranking individual, de
  propósito — é outro contexto de corrida.
- **Reconexão do outro lado.** Se o adversário fecha a aba, você vê a barra dele
  parada até a carência ou o teto de 20 minutos resolverem. Não há "fulano saiu".
