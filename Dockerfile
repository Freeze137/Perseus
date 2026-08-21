# PERSEUS API — imagem para um host de container (Fly.io).
#
# O que esta imagem precisa entregar, e que uma função serverless não entrega:
# um processo Node único, vivo, capaz de segurar uma resposta aberta por até
# 35 minutos (MATCH_LOBBY_TTL_MS + MATCH_MAX_RUN_MS). As salas de duelo vivem na
# memória dele — ver match-registry.service.ts.
#
# Só a API entra aqui. O site é compilado na Vercel, e o Postgres é externo.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Sem TTY não há quem responda a pergunta do corepack, e o build trava nela.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM base AS build

# A segunda instalação lá embaixo apaga e reconstrói o node_modules, e sem TTY
# o pnpm se recusa a apagar sem confirmação — ERR_PNPM_ABORTED_REMOVE_MODULES_
# DIR_NO_TTY. Num build de Docker nunca há TTY.
ENV CI=true

# Manifests antes do código: mudar uma linha de TypeScript não deve reinstalar
# o mundo. O manifest do web entra mesmo sem ser compilado aqui — sem ele o
# pnpm considera o lockfile desatualizado e --frozen-lockfile falha.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json            apps/api/
COPY apps/web/package.json            apps/web/
COPY packages/contracts/package.json  packages/contracts/
COPY packages/corpus/package.json     packages/corpus/
COPY packages/engine/package.json     packages/engine/

RUN pnpm install --frozen-lockfile --filter @perseus/api...

COPY packages packages
COPY apps/api apps/api

# Os pacotes são resolvidos pelo `dist`, que só existe depois de compilado —
# a mesma pegadinha que quebra o build da Vercel sem o `...` no filtro.
RUN pnpm build:packages && pnpm --filter @perseus/api build

# Segunda passada, agora só com as dependências de produção: derruba nest-cli,
# typescript, jest e companhia. Os links para packages/*/dist sobrevivem, porque
# o dist já está no lugar.
RUN pnpm install --frozen-lockfile --filter @perseus/api... --prod

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build --chown=node:node /app /app
WORKDIR /app/apps/api
USER node

EXPOSE 3001

# `node` direto, sem pnpm no meio: um wrapper a mais é um processo a mais entre
# o SIGTERM do host e o enableShutdownHooks() que fecha as requisições em voo.
CMD ["node", "dist/main.js"]
