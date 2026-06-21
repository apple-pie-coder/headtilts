#!/usr/bin/env bash
# switch-env.sh — interactive environment switcher with ASCII UI
#
# Usage:
#   ./scripts/switch-env.sh dev      → copy .env.dev to .env (silent)
#   ./scripts/switch-env.sh staging  → copy .env.staging to .env (silent)
#   ./scripts/switch-env.sh prod     → copy .env.prod to .env (silent)
#   ./scripts/switch-env.sh          → interactive menu

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTIVE="$ROOT/.env"

# Print banner
print_banner() {
  echo -e "${CYAN}"
  cat << "EOF"
╔════════════════════════════════════════╗
║          Environment Switcher          ║
║                                        ║
║  Quick switch between dev, staging,    ║
║  and production environments           ║
╚════════════════════════════════════════╝
EOF
  echo -e "${NC}"
}

# Show current environment
show_current() {
  echo ""
  if [[ -f "$ACTIVE" ]]; then
    CURRENT_ENV=$(grep -E '^NODE_ENV=' "$ACTIVE" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]' || echo "unknown")
    echo -e "${GREEN}✓${NC} Current environment: ${BOLD}${CURRENT_ENV}${NC}"
  else
    echo -e "${YELLOW}!${NC} No .env file found"
  fi
  echo ""
}

# Interactive menu
show_menu() {
  print_banner
  show_current

  echo -e "${BOLD}Select an environment:${NC}"
  echo ""
  echo -e "  ${BLUE}1${NC}  Development  (local machine)"
  echo -e "  ${BLUE}2${NC}  Staging      (staging server)"
  echo -e "  ${BLUE}3${NC}  Production   (production server)"
  echo -e "  ${BLUE}4${NC}  Exit"
  echo ""
  echo -n "Enter choice [1-4]: "
}

# Confirm action
confirm_switch() {
  local env=$1
  echo ""
  echo -e "${YELLOW}⚠${NC}  Switch to ${BOLD}${env}${NC}?"
  echo -n "Continue? [y/N]: "
  read -r response
  [[ "$response" =~ ^[Yy]$ ]]
}

# Switch environment
switch_env() {
  local env=$1
  local template="$ROOT/.env.$env"

  # Validate template exists
  if [[ ! -f "$template" ]]; then
    echo -e "${RED}✗${NC} Template not found: .env.$env"
    return 1
  fi

  # Back up existing .env
  if [[ -f "$ACTIVE" ]]; then
    BACKUP="$ROOT/.env.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$ACTIVE" "$BACKUP"
    echo -e "${GREEN}✓${NC} Backed up to ${BOLD}$(basename "$BACKUP")${NC}"
  fi

  # Copy template to .env
  cp "$template" "$ACTIVE"
  echo -e "${GREEN}✓${NC} Switched to ${BOLD}$env${NC}"

  # Check for unfilled placeholders
  UNFILLED=$(grep -c 'CHANGE_ME' "$ACTIVE" 2>/dev/null || true)
  if [[ "$UNFILLED" -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}⚠${NC}  ${UNFILLED} placeholder(s) need attention:"
    grep -n 'CHANGE_ME' "$ACTIVE" | while read -r line; do
      echo -e "    ${YELLOW}→${NC} $line"
    done
    echo ""
    echo -e "Edit ${BOLD}.env${NC} and replace CHANGE_ME values before starting."
  else
    echo -e "${GREEN}✓${NC} All values configured"
  fi
  echo ""
}

# Interactively handle menu choice
handle_choice() {
  case "$1" in
    1)
      confirm_switch "development" && switch_env "dev"
      ;;
    2)
      confirm_switch "staging" && switch_env "staging"
      ;;
    3)
      confirm_switch "production" && switch_env "prod"
      ;;
    4)
      echo -e "${BLUE}Goodbye!${NC}"
      exit 0
      ;;
    *)
      echo -e "${RED}✗${NC} Invalid choice"
      sleep 1
      ;;
  esac
}

# Main
main() {
  if [[ $# -eq 0 ]]; then
    # Interactive mode
    while true; do
      show_menu
      read -r choice
      handle_choice "$choice"
      echo -n "Press Enter to continue..."
      read -r
      clear
    done
  else
    # Direct mode: ./switch-env.sh dev
    ENV="$1"
    case "$ENV" in
      dev|staging|prod)
        switch_env "$ENV"
        ;;
      *)
        print_banner
        echo -e "${RED}✗${NC} Unknown environment: ${BOLD}$ENV${NC}"
        echo ""
        echo "Valid options: dev, staging, prod"
        exit 1
        ;;
    esac
  fi
}

main "$@"