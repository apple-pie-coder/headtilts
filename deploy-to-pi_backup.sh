#!/usr/bin/env bash
# ==============================================================================
# Headtilts — one-shot production deploy to the Raspberry Pi
#
#   Run it once, walk away. It packages this project, ships it to the Pi, and
#   builds + migrates + seeds + starts the whole stack. When it finishes it
#   prints the URL to open and the one remaining manual step (create the first
#   admin user).
#
# USAGE:
#   ./deploy-to-pi.sh              # CLEAN install — WIPES the database, fresh start
#   ./deploy-to-pi.sh --keep-data  # UPDATE — rebuild & redeploy, KEEP the database
#   ./deploy-to-pi.sh --help
#
# SECURITY NOTE: this file contains passwords. It is gitignored — do NOT commit
# it. The SSH password was shared in chat earlier; rotate it on the Pi soon
# (`passwd`), then update SSH_PASS below (or set HEADTILTS_SSH_PASS in your env).
# ==============================================================================
set -euo pipefail

# ─── COLORS & FORMATTING ──────────────────────────────────────────────────────
# Standard colors
readonly COLOR_RESET='\033[0m'
readonly COLOR_BOLD='\033[1m'
readonly COLOR_DIM='\033[2m'

# Foreground colors
readonly COLOR_BLACK='\033[30m'
readonly COLOR_RED='\033[31m'
readonly COLOR_GREEN='\033[32m'
readonly COLOR_YELLOW='\033[33m'
readonly COLOR_BLUE='\033[34m'
readonly COLOR_MAGENTA='\033[35m'
readonly COLOR_CYAN='\033[36m'
readonly COLOR_WHITE='\033[37m'

# Bright colors
readonly COLOR_BRIGHT_BLUE='\033[94m'
readonly COLOR_BRIGHT_CYAN='\033[96m'
readonly COLOR_BRIGHT_GREEN='\033[92m'
readonly COLOR_BRIGHT_YELLOW='\033[93m'
readonly COLOR_BRIGHT_MAGENTA='\033[95m'

# Background colors
readonly BG_CYAN='\033[46m'
readonly BG_BLUE='\033[44m'

# Combined styles
readonly HEADER="${COLOR_BOLD}${COLOR_BRIGHT_BLUE}"
readonly SECTION="${COLOR_BOLD}${COLOR_BRIGHT_CYAN}"
readonly SUCCESS="${COLOR_BOLD}${COLOR_BRIGHT_GREEN}"
readonly WARNING="${COLOR_BOLD}${COLOR_BRIGHT_YELLOW}"
readonly ERROR="${COLOR_BOLD}${COLOR_RED}"
readonly INFO="${COLOR_CYAN}"
readonly MUTED="${COLOR_DIM}${COLOR_WHITE}"

# ─── CONFIG (override any of these with an env var of the same name) ──────────
SSH_USER="${HEADTILTS_SSH_USER:-flypi}"
SSH_HOST="${HEADTILTS_SSH_HOST:-192.168.1.11}"
SSH_PASS="${HEADTILTS_SSH_PASS:-NewHorizons098}"
REMOTE_DIR="${HEADTILTS_REMOTE_DIR:-/opt/headtilts}"

# Database + app secrets written into the server's .env on a CLEAN install.
# (Keep passwords URL-safe: no  @ : / # ? %  characters.)
MYSQL_DATABASE="${HEADTILTS_DB_NAME:-headtilts}"
MYSQL_USER="${HEADTILTS_DB_USER:-headtilts}"
MYSQL_PASSWORD="${HEADTILTS_DB_PASS:-headtilts}"
MYSQL_ROOT_PASSWORD="${HEADTILTS_DB_ROOT_PASS:-NewHorizons098root}"

# Public URLs (where people reach the site). HTTP_PORT is the host port nginx
# binds — 80 is fine; it does NOT clash with Gitea on 3000.
SITE_URL="${HEADTILTS_SITE_URL:-http://${SSH_HOST}}"
WEB_URL="${HEADTILTS_WEB_URL:-http://${SSH_HOST}}"
ADMIN_URL="${HEADTILTS_ADMIN_URL:-http://${SSH_HOST}/admin}"
HTTP_PORT="${HEADTILTS_HTTP_PORT:-80}"
# ──────────────────────────────────────────────────────────────────────────────

MODE="clean"
case "${1:-}" in
  --keep-data) MODE="keep" ;;
  --help|-h)   sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "")          ;;
  *)           printf "${ERROR}✗ Unknown option: %s${COLOR_RESET}  (try --help)\n" "$1" >&2; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_TARBALL="/tmp/headtilts-deploy.tar.gz"
REMOTE_TARBALL="/tmp/headtilts-deploy.tar.gz"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

# Spinner animation
SPINNER=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
SPINNER_IDX=0

spinner() {
  while kill -0 "$1" 2>/dev/null; do
    printf "\r${INFO}${SPINNER[$SPINNER_IDX]}${COLOR_RESET} "
    SPINNER_IDX=$(( (SPINNER_IDX + 1) % ${#SPINNER[@]} ))
    sleep 0.1
  done
  printf "\r"
}

# ─── OUTPUT FUNCTIONS ─────────────────────────────────────────────────────────
section() {
  printf '\n'
  printf "${SECTION}┌─ %s\n" "$*"
  printf "│${COLOR_RESET}\n"
}

step() {
  printf "${SECTION}├─▶${COLOR_RESET} %s\n" "$*"
}

sub_step() {
  printf "  ${INFO}┆${COLOR_RESET} %s\n" "$*"
}

ok() {
  printf "${SUCCESS}✓${COLOR_RESET} %s\n" "$*"
}

warn() {
  printf "${WARNING}⚠${COLOR_RESET} %s\n" "$*"
}

info() {
  printf "${INFO}ℹ${COLOR_RESET} %s\n" "$*"
}

die() {
  printf "${ERROR}✗${COLOR_RESET} %s\n" "$*" >&2
  exit 1
}

box() {
  local width=$((${#1} + 4))
  printf '\n'
  printf "${SECTION}"
  printf '┌'; printf '─%.0s' $(seq 1 $((width-2))); printf '┐\n'
  printf "│ %s │\n" "$1"
  printf '└'; printf '─%.0s' $(seq 1 $((width-2))); printf '┘\n'
  printf "${COLOR_RESET}"
}

progress_bar() {
  local width=30
  local fill=$((width * $1 / 100))
  printf '  ['
  printf '█%.0s' $(seq 1 $fill)
  printf '░%.0s' $(seq 1 $((width - fill)))
  printf '] %d%%\n' "$1"
}

# ─── UTILITY FUNCTIONS ────────────────────────────────────────────────────────
remote() { sshpass -p "$SSH_PASS" ssh $SSH_OPTS "$SSH_USER@$SSH_HOST" "$@"; }

# ─── MAIN DEPLOYMENT ──────────────────────────────────────────────────────────

# Print header
printf '\n'
printf "${HEADER}╔════════════════════════════════════════════════════════════════╗${COLOR_RESET}\n"
printf "${HEADER}║${COLOR_RESET}          🚀 ${COLOR_BOLD}HEADTILTS DEPLOYMENT TO RASPBERRY PI${COLOR_RESET}${HEADER}          ║${COLOR_RESET}\n"
printf "${HEADER}╚════════════════════════════════════════════════════════════════╝${COLOR_RESET}\n"

# Show config
printf '\n'
info "Configuration:"
printf "  ${MUTED}SSH Host:${COLOR_RESET}    %s@%s\n" "$SSH_USER" "$SSH_HOST"
printf "  ${MUTED}Remote Dir:${COLOR_RESET}   %s\n" "$REMOTE_DIR"
printf "  ${MUTED}Site URL:${COLOR_RESET}     %s\n" "$SITE_URL"
printf "  ${MUTED}Mode:${COLOR_RESET}         %s\n" "$([ "$MODE" = "clean" ] && echo "🔴 CLEAN (wipes DB)" || echo "🟢 UPDATE (keeps data)")"

# ─── 0. Pre-flight ────────────────────────────────────────────────────────────
section "PRE-FLIGHT CHECKS"

step "Verifying required commands"
command -v sshpass >/dev/null || die "sshpass not installed.  Install it:  brew install hudochenkov/sshpass/sshpass"
ok "sshpass installed"
command -v tar >/dev/null || die "tar not found"
ok "tar available"

step "Testing SSH connection to Pi"
if remote "echo ok" >/dev/null 2>&1; then
  ok "SSH connection successful"
else
  die "Cannot SSH to $SSH_USER@$SSH_HOST — check host, network, and password."
fi

step "Checking Docker installation on Pi"
if remote "command -v docker >/dev/null && docker compose version >/dev/null 2>&1"; then
  ok "Docker and docker compose are available"
else
  die "Docker / 'docker compose' not available for $SSH_USER on the Pi."
fi

# Pre-flight complete
ok "All pre-flight checks passed"

# Warning for clean installs
if [ "$MODE" = "clean" ]; then
  printf '\n'
  box "🔴 CLEAN INSTALL MODE — DATABASE WILL BE DELETED 🔴"
  warn "This will DELETE the existing Headtilts database on $SSH_HOST"
  info "Use ${COLOR_BOLD}./deploy-to-pi.sh --keep-data${COLOR_RESET}${INFO} to update without wiping data${COLOR_RESET}"
  printf '\n'
  printf "${WARNING}Starting in 5 seconds — press ${COLOR_BOLD}Ctrl-C${COLOR_RESET}${WARNING} to abort${COLOR_RESET}\n"
  for i in 5 4 3 2 1; do
    printf "\r${WARNING}  %d${COLOR_RESET}" "$i"
    sleep 1
  done
  printf "\r${SUCCESS}  ✓ Proceeding${COLOR_RESET}\n"
else
  printf '\n'
  ok "Mode: --keep-data (database volume will be preserved)"
fi

# ─── 1. Package this project ──────────────────────────────────────────────────
section "PACKAGING PROJECT"

step "Creating tarball (excluding node_modules, .git, dist, .env)"
sub_step "Compressing: ${MUTED}./node_modules ./.git ./dist ./.env deploy-to-pi.sh${COLOR_RESET}"

COPYFILE_DISABLE=1 tar \
  --exclude='./.git' \
  --exclude='*/node_modules' \
  --exclude='node_modules' \
  --exclude='*/dist' \
  --exclude='dist' \
  --exclude='.env' \
  --exclude='deploy-to-pi.sh' \
  -czf "$LOCAL_TARBALL" -C "$SCRIPT_DIR" . 2>/dev/null

TARBALL_SIZE=$(du -h "$LOCAL_TARBALL" | cut -f1)
ok "Package created → $(basename "$LOCAL_TARBALL") (${COLOR_BOLD}${TARBALL_SIZE}${COLOR_RESET})"

# ─── 2. Upload ────────────────────────────────────────────────────────────────
section "UPLOADING TO PI"

step "Transferring tarball to $SSH_HOST"
(
  sshpass -p "$SSH_PASS" scp $SSH_OPTS "$LOCAL_TARBALL" "$SSH_USER@$SSH_HOST:$REMOTE_TARBALL" 2>/dev/null &
  spinner $!
)
ok "Upload complete"

# ─── 3. Run the full setup on the Pi ──────────────────────────────────────────
section "RUNNING REMOTE SETUP"
info "This will take several minutes on a Raspberry Pi (building Docker images, etc.)"

REMOTE_ENV="MODE='$MODE' SUDO_PASS='$SSH_PASS' REMOTE_DIR='$REMOTE_DIR' TARBALL='$REMOTE_TARBALL'"
REMOTE_ENV="$REMOTE_ENV MYSQL_DATABASE='$MYSQL_DATABASE' MYSQL_USER='$MYSQL_USER'"
REMOTE_ENV="$REMOTE_ENV MYSQL_PASSWORD='$MYSQL_PASSWORD' MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD'"
REMOTE_ENV="$REMOTE_ENV SITE_URL='$SITE_URL' WEB_URL='$WEB_URL' ADMIN_URL='$ADMIN_URL' HTTP_PORT='$HTTP_PORT'"

sshpass -p "$SSH_PASS" ssh $SSH_OPTS "$SSH_USER@$SSH_HOST" "$REMOTE_ENV bash -s" <<'REMOTE'
set -euo pipefail
sudo_run() { echo "$SUDO_PASS" | sudo -S -p '' "$@"; }

# Colors on remote
readonly COLOR_RESET='\033[0m'
readonly COLOR_BOLD='\033[1m'
readonly COLOR_DIM='\033[2m'
readonly COLOR_CYAN='\033[36m'
readonly COLOR_BRIGHT_CYAN='\033[96m'
readonly COLOR_BRIGHT_GREEN='\033[92m'
readonly COLOR_BRIGHT_YELLOW='\033[93m'
readonly COLOR_BLUE='\033[34m'
readonly SECTION="${COLOR_BOLD}${COLOR_BRIGHT_CYAN}"
readonly SUCCESS="${COLOR_BOLD}${COLOR_BRIGHT_GREEN}"
readonly WARNING="${COLOR_BOLD}${COLOR_BRIGHT_YELLOW}"
readonly INFO="${COLOR_CYAN}"
readonly MUTED="${COLOR_DIM}"

log()      { printf '\n  '"${SECTION}┆${COLOR_RESET}"' %s\n' "$*"; }
log_ok()   { printf '    '"${SUCCESS}✓${COLOR_RESET}"' %s\n' "$*"; }
log_info() { printf '    '"${INFO}ℹ${COLOR_RESET}"' %s\n' "$*"; }

# 3a. Stop existing stack (wipe volumes only on a clean install)
if [ -f "$REMOTE_DIR/docker-compose.yml" ]; then
  log "Stopping existing stack"
  cd "$REMOTE_DIR"
  if [ "$MODE" = "clean" ]; then 
    docker compose down -v >/dev/null 2>&1 || true
    log_ok "Removed volumes"
  else 
    docker compose down >/dev/null 2>&1 || true
    log_ok "Stopped services"
  fi
fi

# 3b. Preserve .env when keeping data
if [ "$MODE" = "keep" ] && [ -f "$REMOTE_DIR/.env" ]; then 
  cp "$REMOTE_DIR/.env" /tmp/headtilts.env.bak
  log_info "Backed up existing .env"
fi

# 3c. Refresh code
log "Extracting fresh code"
sudo_run rm -rf "$REMOTE_DIR"
sudo_run mkdir -p "$REMOTE_DIR"
sudo_run tar -xzf "$TARBALL" -C "$REMOTE_DIR" 2>/dev/null || sudo_run tar -xzf "$TARBALL" -C "$REMOTE_DIR"
sudo_run chown -R "$(id -un):$(id -gn)" "$REMOTE_DIR"
cd "$REMOTE_DIR"
log_ok "Code extracted to $REMOTE_DIR"

# 3d. Write .env
if [ "$MODE" = "keep" ] && [ -f /tmp/headtilts.env.bak ]; then
  log "Restoring .env from backup"
  cp /tmp/headtilts.env.bak .env
  log_ok ".env restored"
else
  log "Generating fresh .env with JWT secrets"
  JWT="$(openssl rand -base64 48 | tr -d '\n')"
  JWTREF="$(openssl rand -base64 48 | tr -d '\n')"
  cat > .env <<ENVEOF
NODE_ENV=production
DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@mysql:3306/${MYSQL_DATABASE}
MYSQL_DATABASE=${MYSQL_DATABASE}
MYSQL_USER=${MYSQL_USER}
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
MYSQL_PASSWORD=${MYSQL_PASSWORD}
JWT_SECRET=${JWT}
JWT_REFRESH_SECRET=${JWTREF}
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
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
RAZORPAY_KEY_SECRET=
RAZORPAY_KEY_ID=
ENVEOF
  chmod 600 .env
  log_ok ".env created with secrets"
fi

# 3e. Build images
log "Building Docker images (this is slow on first run — grab some coffee ☕)"
if ! docker compose build 2>&1 | tail -40 | sed 's/^/    /'; then
  printf '\n'; echo "Docker build FAILED — see output above"; exit 1
fi
log_ok "Docker images built"

# 3f. Start DB and wait until healthy
log "Starting MySQL and waiting for health check"
docker compose up -d mysql >/dev/null 2>&1
for i in $(seq 1 60); do
  cid="$(docker compose ps -q mysql 2>/dev/null || true)"
  if [ -n "$cid" ]; then
    status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)"
    if [ "$status" = "healthy" ]; then 
      log_ok "MySQL is healthy ✓"
      break
    fi
  fi
  printf "    ${MUTED}Waiting for MySQL... %2d/60s${COLOR_RESET}\r" "$((i*3))"
  sleep 3
  if [ "$i" -eq 60 ]; then 
    printf '\n'
    echo "MySQL did not become healthy in time"
    docker compose logs --tail=40 mysql
    exit 1
  fi
done

# 3g. Apply migrations
log "Applying database migrations"
docker compose run --rm --no-deps --entrypoint="" api sh -c "cd apps/api && npx prisma migrate deploy" 2>&1 | tail -3 | sed 's/^/    /'
log_ok "Migrations applied"

log "Seeding default roles, permissions and settings (cold-starts the API container — may take ~30-60s on a Pi)"
if ! docker compose run --rm --no-deps --entrypoint="" api sh -c "cd apps/api && npx tsx prisma/seed.ts" 2>&1 | tail -8 | sed 's/^/    /'; then
  printf '\n'; echo "Seed FAILED — see output above"; exit 1
fi
log_ok "Database seeded"

# 3h. Start the rest of the stack
log "Starting all services (API, web, admin, nginx)"
if ! docker compose up -d 2>&1 | sed 's/^/    /'; then
  printf '\n'; echo "Failed to start services — see output above"; exit 1
fi
log_ok "Services started"

# 3i. Health check
log "Waiting for the site to respond"
code="000"
for i in $(seq 1 30); do
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "http://localhost:${HTTP_PORT}/" 2>/dev/null || echo 000)"
  [ "$code" = "200" ] && break
  printf "    ${MUTED}HTTP status check... %2d/30s${COLOR_RESET}\r" "$i"
  sleep 2
done
printf '\n'

echo ''
docker compose ps | sed 's/^/    /'
echo ''

if [ "$code" = "200" ]; then 
  log_ok "Site responded with HTTP 200 ✓"
else 
  log_info "Site returned HTTP $code — check 'docker compose logs' if it stays down"
fi
REMOTE

# ─── 4. Done ──────────────────────────────────────────────────────────────────
PORT_SUFFIX=""
[ "$HTTP_PORT" != "80" ] && PORT_SUFFIX=":$HTTP_PORT"

printf '\n'
printf "${SUCCESS}╔════════════════════════════════════════════════════════════════╗${COLOR_RESET}\n"
printf "${SUCCESS}║${COLOR_RESET}                   ✅ ${COLOR_BOLD}DEPLOYMENT COMPLETE${COLOR_RESET}${SUCCESS}                     ║${COLOR_RESET}\n"
printf "${SUCCESS}╚════════════════════════════════════════════════════════════════╝${COLOR_RESET}\n"

cat <<DONE

  ${INFO}Open the site:${COLOR_RESET}
    ${COLOR_BOLD}http://${SSH_HOST}${PORT_SUFFIX}/${COLOR_RESET}

  ${INFO}Admin panel:${COLOR_RESET}
    ${COLOR_BOLD}http://${SSH_HOST}${PORT_SUFFIX}/admin${COLOR_RESET}

  ${WARNING}⚠  LAST STEP${COLOR_RESET} (one time only):
    Create the first admin user at:
    ${COLOR_BOLD}http://${SSH_HOST}${PORT_SUFFIX}/admin/setup${COLOR_RESET}

  ${INFO}To update code later (keeps your data):${COLOR_RESET}
    ${COLOR_BOLD}./deploy-to-pi.sh --keep-data${COLOR_RESET}

DONE

printf '\n'