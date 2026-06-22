#!/usr/bin/env bash
# ==============================================================================
# Headtilts — interactive on-server deploy
#
#   Run this ON the server, from the project root. No SSH, no stored
#   credentials — it asks you for the URLs/ports it needs, generates secrets
#   itself, and brings the whole stack up.
#
#   1. Get the code onto the server (git clone / git pull / copy).
#   2. cd into the project root (where docker-compose.yml lives).
#   3. ./deploy.sh
#
# This file contains NO secrets, so it is safe to commit. The .env it writes
# is gitignored.
# ==============================================================================
set -euo pipefail

# ─── colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

say()   { printf "%b\n" "$*"; }
step()  { printf "\n${CYAN}${BOLD}▶ %s${NC}\n" "$*"; }
ok()    { printf "${GREEN}✓${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${NC} %s\n" "$*"; }
die()   { printf "${RED}✗ %s${NC}\n" "$*" >&2; exit 1; }

# Prompt with a default: ask "Question" "default" → echoes the answer
ask() {
  local prompt="$1" default="${2:-}" answer
  if [ -n "$default" ]; then
    read -rp "$(printf "  ${BOLD}%s${NC} ${DIM}[%s]${NC}: " "$prompt" "$default")" answer </dev/tty
    printf '%s' "${answer:-$default}"
  else
    read -rp "$(printf "  ${BOLD}%s${NC}: " "$prompt")" answer </dev/tty
    printf '%s' "$answer"
  fi
}

# Yes/No prompt: ask_yn "Question" "Y" → returns 0 for yes, 1 for no
ask_yn() {
  local prompt="$1" default="${2:-N}" answer hint="y/N"
  [ "$default" = "Y" ] && hint="Y/n"
  read -rp "$(printf "  ${BOLD}%s${NC} ${DIM}[%s]${NC}: " "$prompt" "$hint")" answer </dev/tty
  answer="${answer:-$default}"
  case "$answer" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

gen_secret() { openssl rand -base64 48 | tr -d '\n'; }

# Best-effort local IP for a sensible default URL.
# Linux: `hostname -I`; macOS: `ipconfig getifaddr`. Never aborts under set -e.
detect_ip() {
  local ip=""
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || ip=""
  if [ -z "$ip" ] && command -v ipconfig >/dev/null 2>&1; then
    ip="$(ipconfig getifaddr en0 2>/dev/null)" || ip=""
    [ -z "$ip" ] && { ip="$(ipconfig getifaddr en1 2>/dev/null)" || ip=""; }
  fi
  printf '%s' "${ip:-localhost}"
}

# ─── banner ─────────────────────────────────────────────────────────────────
printf "${CYAN}${BOLD}"
cat <<'EOF'
╔════════════════════════════════════════════════╗
║               Headtilts — Deployer             ║
╚════════════════════════════════════════════════╝
EOF
printf "${NC}"

# ─── pre-flight ───────────────────────────────────────────────────────────────
step "Pre-flight checks"
[ -f docker-compose.yml ] || die "No docker-compose.yml here. cd into the project root first."
command -v docker >/dev/null || die "Docker is not installed."
docker compose version >/dev/null 2>&1 || die "'docker compose' is not available."
if ! docker info >/dev/null 2>&1; then
  die "Cannot talk to the Docker daemon. Run with sudo, or add your user to the 'docker' group:
       sudo usermod -aG docker \$USER   (then log out and back in)"
fi
command -v openssl >/dev/null || die "openssl is required (to generate secrets)."
ok "Docker is ready and we're in the project root"

# ─── choose mode ───────────────────────────────────────────────────────────────
EXISTING="$(docker compose ps -aq 2>/dev/null | wc -l | tr -d ' ' || true)"; EXISTING="${EXISTING:-0}"
MODE="fresh"
if [ "$EXISTING" != "0" ]; then
  step "An existing Headtilts deployment was found here"
  say "  ${DIM}Fresh = wipe the database and start clean.  Update = keep your data, just redeploy.${NC}"
  if ask_yn "Keep existing data and just update (recommended)?" "Y"; then
    MODE="update"
  else
    warn "You chose a FRESH install — this DELETES the existing database."
    ask_yn "Are you sure you want to wipe all data?" "N" || die "Cancelled."
    MODE="fresh"
  fi
fi

# ─── gather settings ────────────────────────────────────────────────────────────
if [ "$MODE" = "update" ] && [ -f .env ]; then
  step "Update mode — keeping your existing .env (settings, DB password, secrets)"
  ok "Loaded existing configuration"
else
  step "Configure this deployment"
  DEFAULT_IP="$(detect_ip)"

  SITE_URL="$(ask "Public site URL"   "http://${DEFAULT_IP}")"
  HTTP_PORT="$(ask "Host port for the website" "80")"
  ADMIN_URL="$(ask "Admin panel URL"  "${SITE_URL%/}/admin")"
  WEB_URL="$SITE_URL"

  MYSQL_DATABASE="$(ask "Database name" "headtilts")"
  MYSQL_USER="$(ask "Database user" "headtilts")"
  MYSQL_PASSWORD="$(ask "Database password (Enter = auto-generate)" "")"
  if [ -z "$MYSQL_PASSWORD" ]; then
    MYSQL_PASSWORD="$(openssl rand -hex 64)"
    ok "Generated a database password (saved in .env)"
  fi
  MYSQL_ROOT_PASSWORD="$(openssl rand -hex 64)"

  # Optional email
  SMTP_HOST=""; SMTP_PORT="587"; SMTP_SECURE="false"; SMTP_USER=""; SMTP_PASS=""; SMTP_FROM=""
  if ask_yn "Configure email (SMTP) now?" "N"; then
    SMTP_HOST="$(ask "SMTP host" "")"
    SMTP_PORT="$(ask "SMTP port" "587")"
    SMTP_USER="$(ask "SMTP username" "")"
    SMTP_PASS="$(ask "SMTP password" "")"
    SMTP_FROM="$(ask "From address" "Headtilts <no-reply@${DEFAULT_IP}>")"
  fi

  JWT_SECRET="$(gen_secret)"; JWT_REFRESH_SECRET="$(gen_secret)"

  step "Writing .env"
  cat > .env <<ENVEOF
NODE_ENV=production
DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@mysql:3306/${MYSQL_DATABASE}
MYSQL_DATABASE=${MYSQL_DATABASE}
MYSQL_USER=${MYSQL_USER}
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
MYSQL_PASSWORD=${MYSQL_PASSWORD}
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
API_PORT=3000
SITE_URL=${SITE_URL}
WEB_URL=${WEB_URL}
ADMIN_URL=${ADMIN_URL}
UPLOAD_DIR=/app/apps/api/uploads
MAX_UPLOAD_SIZE=10mb
HTTP_PORT=${HTTP_PORT}
VITE_API_URL=/api
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_SECURE=${SMTP_SECURE}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM=${SMTP_FROM}
RAZORPAY_KEY_SECRET=
RAZORPAY_KEY_ID=
ENVEOF
  chmod 600 .env
  ok ".env written (DATABASE_URL host is 'mysql' — the in-Docker service name)"
fi

# Re-read final values for the summary / health check
HTTP_PORT="$(grep -E '^HTTP_PORT=' .env 2>/dev/null | cut -d= -f2 || true)"; HTTP_PORT="${HTTP_PORT:-80}"
SITE_URL="$(grep -E '^SITE_URL=' .env 2>/dev/null | cut -d= -f2- || true)"; SITE_URL="${SITE_URL:-http://localhost}"

# ─── bring the stack up ─────────────────────────────────────────────────────────
if [ "$MODE" = "fresh" ] && [ "$EXISTING" != "0" ]; then
  step "Removing the old stack and its data"
  docker compose down -v
  ok "Old stack and volumes removed"
fi

step "Building Docker images (slow on first run — be patient)"
docker compose build

step "Starting the database"
docker compose up -d mysql
printf "  waiting for MySQL to be healthy"
for i in $(seq 1 60); do
  cid="$(docker compose ps -q mysql 2>/dev/null || true)"
  if [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)" = "healthy" ]; then
    printf "\n"; ok "MySQL is healthy"; break
  fi
  printf "."; sleep 3
  [ "$i" -eq 60 ] && { printf "\n"; docker compose logs --tail=40 mysql; die "MySQL did not become healthy."; }
done

step "Applying database migrations"
docker compose run --rm --no-deps --entrypoint="" api sh -c "cd apps/api && npx prisma migrate deploy"
ok "Migrations applied"

step "Seeding default roles, permissions and settings"
docker compose run --rm --no-deps --entrypoint="" api sh -c "cd apps/api && npx tsx prisma/seed.ts"
ok "Database seeded"

step "Starting all services"
docker compose up -d
ok "Services started"

step "Checking the site"
code="000"
for i in $(seq 1 30); do
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "http://localhost:${HTTP_PORT}/" 2>/dev/null || echo 000)"
  [ "$code" = "200" ] && break
  sleep 2
done
printf "\n"; docker compose ps; printf "\n"
[ "$code" = "200" ] && ok "Site responded with HTTP 200" || warn "Site returned HTTP $code — check 'docker compose logs' if it stays down"

# ─── done ───────────────────────────────────────────────────────────────────────
PORT_SUFFIX=""; [ "$HTTP_PORT" != "80" ] && PORT_SUFFIX=":$HTTP_PORT"
BASE="${SITE_URL:-http://localhost}"
printf "\n${GREEN}${BOLD}✅ Deployment complete${NC}\n\n"
say "  Site:   ${BOLD}${BASE}${PORT_SUFFIX}/${NC}"
say "  Admin:  ${BOLD}${BASE}${PORT_SUFFIX}/admin${NC}"
if [ "$MODE" = "fresh" ]; then
  printf "\n  ${YELLOW}Last step (one time):${NC} create the first admin user at\n"
  say "    ${BOLD}${BASE}${PORT_SUFFIX}/admin/setup${NC}"
fi
printf "\n  ${DIM}Re-run ./deploy.sh anytime — it will offer to keep your data.${NC}\n\n"
