#!/usr/bin/env bash
#
# PERSEUS — publicar a versão nova da API na VM.
#
#   cd /opt/perseus && bash deploy/deploy.sh
#
# Encerra o duelo de quem estiver jogando: as salas vivem na memória do
# processo, e reiniciar é perdê-las. Não é um bug a corrigir aqui — é a
# consequência da escolha registrada em docs/DUELO.md §2. Faça em horário morto.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/perseus}"
cd "$REPO_DIR"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }

say "Salas abertas agora"
# Informativo, não bloqueante: quem decide se pode reiniciar é quem está lendo.
curl -fsS localhost:3001/health || echo "(API não está respondendo)"

say "Código"
git pull --ff-only

say "Dependências"
pnpm install --frozen-lockfile

say "Migrações novas"
# Idempotentes por construção (create table if not exists). Rodar de novo é
# barato; esquecer de rodar é um insert que falha em produção.
for file in supabase/migrations/0004_*.sql; do
  echo "  $file"
  sudo -u postgres psql -q -d perseus -v ON_ERROR_STOP=1 -f "$file"
done

say "Build"
pnpm build

say "Reiniciando"
sudo systemctl restart perseus-api
sleep 2

say "Estado"
systemctl --no-pager --lines=5 status perseus-api || true
curl -fsS localhost:3001/health && echo
curl -fsS localhost:3001/health/ready && echo
