#!/usr/bin/env bash
# switch-env.sh — copy an environment template to .env
#
# Usage:
#   ./scripts/switch-env.sh dev      → copies .env.dev to .env
#   ./scripts/switch-env.sh staging  → copies .env.staging to .env
#   ./scripts/switch-env.sh prod     → copies .env.prod to .env
#   ./scripts/switch-env.sh          → shows current environment

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTIVE="$ROOT/.env"

usage() {
  echo "Usage: $0 [dev|staging|prod]"
  echo ""
  echo "  dev      Copy .env.dev to .env (local development)"
  echo "  staging  Copy .env.staging to .env (staging server)"
  echo "  prod     Copy .env.prod to .env (production server)"
  echo "  (none)   Show which environment is currently active"
  exit 1
}

# No argument — show current environment
if [[ $# -eq 0 ]]; then
  if [[ -f "$ACTIVE" ]]; then
    CURRENT_ENV=$(grep -E '^NODE_ENV=' "$ACTIVE" | cut -d= -f2 | tr -d '[:space:]')
    echo "Current environment: ${CURRENT_ENV:-unknown} (.env exists)"
  else
    echo "No .env file found. Run: ./scripts/switch-env.sh dev"
  fi
  exit 0
fi

ENV="$1"

case "$ENV" in
  dev|staging|prod)
    TEMPLATE="$ROOT/.env.$ENV"
    ;;
  *)
    echo "Error: unknown environment '$ENV'"
    usage
    ;;
esac

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Error: template file not found: $TEMPLATE"
  exit 1
fi

# Back up existing .env if present
if [[ -f "$ACTIVE" ]]; then
  BACKUP="$ROOT/.env.backup.$(date +%Y%m%d_%H%M%S)"
  cp "$ACTIVE" "$BACKUP"
  echo "Backed up existing .env to: $(basename "$BACKUP")"
fi

cp "$TEMPLATE" "$ACTIVE"
echo "Switched to environment: $ENV"
echo "Active file: .env (copied from .env.$ENV)"

# Warn about CHANGE_ME placeholders
UNFILLED=$(grep -c 'CHANGE_ME' "$ACTIVE" || true)
if [[ "$UNFILLED" -gt 0 ]]; then
  echo ""
  echo "Warning: $UNFILLED placeholder(s) still need replacing in .env:"
  grep -n 'CHANGE_ME' "$ACTIVE" | sed 's/^/  /'
  echo ""
  echo "Edit .env and replace each CHANGE_ME value before starting the app."
fi
