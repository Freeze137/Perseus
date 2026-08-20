#!/usr/bin/env bash
#
# PERSEUS — preparo de uma VM Ubuntu 24.04 nova (Oracle Cloud Ampere A1).
#
# Roda uma vez, no primeiro acesso à máquina. Idempotente: rodar de novo não
# quebra nada e não recria o banco.
#
#   git clone https://github.com/SEU-USUARIO/perseus.git /opt/perseus
#   cd /opt/perseus && bash deploy/setup-vm.sh
#
# O que ele NÃO faz, de propósito: não pede certificado TLS (precisa do DNS já
# apontando) e não sobe o serviço (precisa do domínio no CORS). Os dois últimos
# passos estão em docs/DEPLOY.md.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/perseus}"
ENV_DIR=/etc/perseus
ENV_FILE="$ENV_DIR/api.env"
DB_NAME=perseus
DB_USER=perseus

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }

if [[ $EUID -eq 0 ]]; then
  echo "Rode como usuário comum (ubuntu). O script chama sudo onde precisa." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Pacotes
# ---------------------------------------------------------------------------
say "Pacotes do sistema"
sudo apt-get update -qq
sudo apt-get install -y -qq \
  ca-certificates curl gnupg git \
  nginx postgresql postgresql-client \
  certbot python3-certbot-nginx \
  iptables-persistent

# ---------------------------------------------------------------------------
# Node 22+ (o repositório exige; a imagem vem com 18 ou nada)
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null || [[ "$(node -v | cut -c2- | cut -d. -f1)" -lt 22 ]]; then
  say "Node 22 (NodeSource, ARM64)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
sudo corepack enable
say "node $(node -v), pnpm $(pnpm -v 2>/dev/null || echo 'via corepack')"

# ---------------------------------------------------------------------------
# Firewall
#
# A imagem Ubuntu da Oracle vem com uma regra REJECT no fim da cadeia INPUT, e
# as portas web fechadas. É a razão número um de "subi o servidor e não
# responde" — e não adianta liberar só aqui: a security list da VCN, no console,
# precisa da mesma liberação.
# ---------------------------------------------------------------------------
say "Abrindo 80 e 443 no iptables local"
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 6 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
sudo netfilter-persistent save

# ---------------------------------------------------------------------------
# Postgres
#
# Só na loopback. A API fala com ele pelo 127.0.0.1 e mais ninguém precisa —
# um banco de duelos exposto na internet é superfície por nada.
# ---------------------------------------------------------------------------
say "Postgres"
sudo systemctl enable --now postgresql

if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='$DB_USER'" | grep -q 1; then
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -qc "create role $DB_USER login password '$DB_PASS'"
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
  NEW_DB=1
else
  echo "papel $DB_USER já existe — mantendo a senha atual"
  NEW_DB=0
fi

say "Migrações"
# A 0004 é a do duelo e roda em qualquer Postgres. As 0001-0003 referenciam o
# schema auth do Supabase e não rodam aqui — o ranking individual continua no
# Supabase até que alguém decida migrá-lo.
sudo -u postgres psql -q -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -f "$REPO_DIR/supabase/migrations/0004_matches.sql"
sudo -u postgres psql -q -d "$DB_NAME" \
  -c "grant all on all tables in schema public to $DB_USER" \
  -c "grant all on schema public to $DB_USER"

# ---------------------------------------------------------------------------
# Ambiente da API
# ---------------------------------------------------------------------------
say "Ambiente em $ENV_FILE"
sudo mkdir -p "$ENV_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ "$NEW_DB" -eq 0 ]]; then
    echo "AVISO: o banco já existia mas não há $ENV_FILE — preencha DATABASE_URL à mão." >&2
    DB_PASS="TROQUE_ME"
  fi
  sudo tee "$ENV_FILE" >/dev/null <<EOF
PORT=3001
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME
DATABASE_SSL=false
# Assina o ticket de corrida e o token de duelo. Trocar isto derruba as corridas
# e os duelos abertos no momento — e nada mais.
RUN_TICKET_SECRET=$(openssl rand -hex 32)
# Preencher com o domínio do site antes de subir o serviço.
CORS_ORIGINS=http://localhost:3000
# Um nginx na frente.
TRUST_PROXY_HOPS=1
MAX_BODY_SIZE=512kb
# Supabase, se e quando o ranking individual for ligado.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EOF
  sudo chown root:root "$ENV_FILE"
  sudo chmod 600 "$ENV_FILE"
else
  echo "$ENV_FILE já existe — preservado"
fi

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
say "Build"
cd "$REPO_DIR"
pnpm install --frozen-lockfile
pnpm build

say "Pronto. Falta:"
cat <<'EOF'

  1. CORS_ORIGINS em /etc/perseus/api.env, com o domínio do site na Vercel.
  2. sudo cp deploy/perseus-api.service /etc/systemd/system/
     sudo systemctl daemon-reload && sudo systemctl enable --now perseus-api
  3. nginx + certbot: ver o cabeçalho de deploy/nginx-perseus-api.conf.
  4. Console da Oracle: security list da VCN liberando 80 e 443 (ingress
     0.0.0.0/0). Sem isso, o iptables aberto aqui não adianta.

  Conferir: curl -s localhost:3001/health  → "duelHistory":true
EOF
