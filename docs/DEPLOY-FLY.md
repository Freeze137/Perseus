# PERSEUS — subir no ar (Fly + Neon + Vercel)

Rota alternativa à VM da Oracle, que está em `DEPLOY.md`. Entrega a mesma coisa
e tira três dores: a fila de capacidade do Ampere, o nginx e o certbot.

Peças e onde ficam:

| Peça | Onde | Por quê |
| --- | --- | --- |
| `apps/web` | Vercel | Next 16, build estático + uma rota dinâmica. |
| `apps/api` | Fly.io | Precisa de **um** processo vivo segurando SSE por até 35 min. Container, não função. |
| Postgres | Neon | Duas escritas por duelo. Backup e ponto-no-tempo vêm de fábrica — a dívida que a VM não pagava. |

O que **não** existe nesta rota, e existia na outra: DuckDNS, nginx, certbot,
iptables, `setup-vm.sh`. O Fly termina o TLS sozinho no `*.fly.dev`.

A ordem importa: cada passo produz o valor que o próximo consome.

---

## 0. Antes de tudo

1. **Contas**: <https://fly.io> e <https://neon.com>. As duas pedem cartão em
   algum momento do fluxo; confira o teto gratuito atual de cada uma antes de
   seguir — os termos mudam, e o que vale é o que está no site hoje.

2. **flyctl**, no PowerShell:
   ```powershell
   pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```
   Abra um terminal novo depois — o instalador mexe no PATH. Então:
   ```sh
   fly auth login
   ```

3. **Nome da app.** `perseus-api` já está no `fly.toml`. Nomes são globais no
   Fly; se estiver tomado, troque ali e no resto deste arquivo.

---

## 1. O banco, no Neon

Console do Neon → **New project** → região **AWS São Paulo (sa-east-1)**, para
ficar perto da máquina do Fly em `gru`.

**Rodar a migração.** Só a `0004` se aplica aqui. As `0001`–`0003` referenciam o
schema `auth` do Supabase e não rodam num Postgres comum — é o mesmo recorte da
rota da VM, explicado no cabeçalho do próprio arquivo e em `DUELO.md §4`.

No **SQL Editor** do Neon, cole o conteúdo de
`supabase/migrations/0004_matches.sql` e execute. Ou, com `psql` à mão:

```sh
psql "postgresql://...@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require" \
  -v ON_ERROR_STOP=1 -f supabase/migrations/0004_matches.sql
```

Depois **copie a connection string** — *Connection Details*, com
`?sslmode=require` no fim. É o `DATABASE_URL` do passo seguinte.

> O Neon suspende o banco por inatividade no tier gratuito, e a primeira query
> acorda ele. Onde isso aparece: no `/health/ready` e na escrita do fim do
> duelo. Não aparece durante a partida — a sala inteira vive na memória da API.

---

## 2. A API, no Fly

O `fly.toml` e o `Dockerfile` já estão no repositório. Não rode `fly launch` sem
`--copy-config`: ele sobrescreve os dois, e as três linhas que seguram a
arquitetura do duelo estão comentadas lá dentro por um motivo.

```sh
fly launch --no-deploy --copy-config --name perseus-api --region gru
```

Ele pergunta se quer criar Postgres e Redis — **não** para os dois. O banco é o
Neon.

**Os segredos.** Vão em `fly secrets`, não no `fly.toml`: o toml está no git.

```sh
# Gere o segredo primeiro e guarde a saída:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# CORS_ORIGINS ainda não é o valor final — o site só ganha domínio no passo 3.
fly secrets set \
  DATABASE_URL="postgresql://...@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require" \
  RUN_TICKET_SECRET="cole-o-hex-de-64-caracteres-aqui" \
  CORS_ORIGINS="http://localhost:3000"
```

`RUN_TICKET_SECRET` é opcional no código e obrigatório aqui: sem ele o processo
inventa um segredo a cada boot, e todo deploy passa a recusar as corridas que
alguém tinha em aberto.

```sh
fly deploy --remote-only
fly scale count 1        # UMA. Ver o comentário no fly.toml.
fly status
```

`--remote-only` compila no builder do Fly — não precisa de Docker ligado na sua
máquina.

Confira antes de seguir:

```sh
curl -s https://perseus-api.fly.dev/health        # "duels":true,"duelHistory":true
curl -s https://perseus-api.fly.dev/health/ready  # "duelHistory":"reachable"
```

`duelHistory:false` significa que o `DATABASE_URL` não chegou. `reachable` é o
que prova que o Neon respondeu.

---

## 3. O site, na Vercel

**New Project** → importe o repositório.

| Campo | Valor |
| --- | --- |
| Root Directory | `apps/web` |
| Framework | Next.js (detectado) |
| Build Command | `pnpm --filter @perseus/web... build` |
| Install Command | padrão (`pnpm install`) |

O `...` no build command não é enfeite: sem ele o pnpm não compila os pacotes
dos quais o web depende, e o build morre em `@perseus/contracts` não encontrado.

Variáveis de ambiente:

```
NEXT_PUBLIC_API_URL=https://perseus-api.fly.dev
NEXT_PUBLIC_SUPABASE_URL=          # vazio: ranking desligado, treino intacto
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`NEXT_PUBLIC_*` é embutido no bundle em tempo de build. Mudar o valor exige
**redeploy** — salvar a variável não basta.

---

## 4. Fechar o círculo

Agora que o site tem endereço, a API precisa aceitá-lo:

```sh
fly secrets set CORS_ORIGINS="https://SEU-SITE.vercel.app"
```

`fly secrets set` reinicia a máquina sozinho. Isso encerra duelos em andamento —
mesma consequência da rota da VM, mesma causa: as salas vivem na memória.

---

## 5. E o DNS?

**Na configuração acima, nenhum.** O `perseus-api.fly.dev` já vem com
certificado válido, e a Vercel faz o mesmo pelo `*.vercel.app`. O DuckDNS
existia na rota da VM só porque o Let's Encrypt não emite certificado para IP
puro — e não há IP puro aqui.

Com **domínio próprio**, são dois nomes independentes:

### O site (Vercel)

Projeto → **Settings → Domains** → adicione `seudominio.com`. A Vercel mostra os
registros a criar no seu provedor de DNS — em geral um `CNAME` para o `www` e um
`A` no apex. **Use os valores que a tela mostrar**, não valores decorados: eles
mudam.

### A API (Fly)

```sh
fly certs add api.seudominio.com
fly ips list
```

No seu DNS:

| Tipo | Nome | Valor |
| --- | --- | --- |
| `CNAME` | `api` | `perseus-api.fly.dev` |

Para um apex (`seudominio.com` direto na API), `CNAME` não serve — use `A` e
`AAAA` com os endereços que o `fly ips list` devolveu.

Acompanhe até o certificado sair:

```sh
fly certs show api.seudominio.com     # Status: Ready
```

Depois, e só depois:

```
Vercel:  NEXT_PUBLIC_API_URL=https://api.seudominio.com   → redeploy
Fly:     fly secrets set CORS_ORIGINS="https://seudominio.com,https://www.seudominio.com"
```

Os dois são obrigatórios e nenhum é automático. `CORS_ORIGINS` é sobre a origem
do **site**; `NEXT_PUBLIC_API_URL` é sobre o endereço da **API**. Trocar um e
esquecer o outro dá o mesmo sintoma: o navegador bloqueia a chamada.

> **DuckDNS não serve aqui.** Ele só publica registros `A` apontando para um IP,
> e o que o Fly quer é um `CNAME`. Se o domínio for DuckDNS, fique com o
> `*.fly.dev` — que já é HTTPS e não custa nada.

---

## 6. Conferir

```sh
curl -s https://perseus-api.fly.dev/health
curl -N https://perseus-api.fly.dev/matches/00000000-0000-0000-0000-000000000000/stream
```

`404` imediato no segundo é a resposta **certa**, e vale ler por quê: a sala é
procurada antes do token (`matches.service.ts:448`), então um id que não existe
para em `match_not_found` e nunca chega na parte de credencial. O que se está
medindo aqui não é o código — é o **tempo**. Resposta instantânea significa que
a requisição chegou na API. Demorar seria buffering no caminho, e aí o duelo
chegaria todo de uma vez, no fim.

O teste que vale por todos continua sendo o de sempre: abra o site, **⚔ Duelo**,
crie a sala, mande o link para outro navegador, e corram. Depois, no SQL Editor
do Neon:

```sql
select invite_code, winner_slot, finished_at
from matches order by finished_at desc limit 5;
```

Uma linha ali é a prova de que o caminho inteiro fechou — front, API, replay,
banco.

---

## 7. Operação

| Situação | Comando |
| --- | --- |
| Publicar versão nova | `fly deploy --remote-only` |
| Ver o log | `fly logs` |
| Reiniciar | `fly apps restart perseus-api` |
| Ver os segredos (só os nomes) | `fly secrets list` |
| Abrir um shell na máquina | `fly ssh console` |
| Conferir que continua uma só | `fly status` |

**Todo deploy encerra os duelos em andamento**, como na VM e pelo mesmo motivo.
Publique em horário morto.

### O que ainda não existe

- **Monitoramento.** O health check do Fly reinicia a máquina se ela parar de
  responder, e nada avisa você.
- **Ranking individual.** Continua no Supabase, ou desligado. As migrações
  `0001`–`0003` precisam do schema `auth` e não moram no Neon.
