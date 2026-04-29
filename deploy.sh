#!/bin/bash
# ============================================================
# deploy.sh — Manual deploy script for STB
# Run this on the STB device: ./deploy.sh
#
# Usage:
#   ./deploy.sh              # Pull latest + build + restart
#   ./deploy.sh --pull-only  # Only git pull, don't rebuild
#   ./deploy.sh --rollback   # Rollback to last backup
# ============================================================

set -e

DEPLOY_DIR="/DATA/AppData/razkindo-erp"
GIT_REPO="https://github.com/henryarthanto/RAZKINDO-ERP.git"
BRANCH="main"
BACKUP_DIR="/DATA/AppData/razkindo-erp-backup-$(date +%Y%m%d-%H%M%S)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================"
echo "  Razkindo ERP — STB Deploy"
echo "  $(date)"
echo "========================================"

# ─── Functions ────────────────────────────────────────

do_backup() {
  if [ -d "$DEPLOY_DIR/node_modules" ] || [ -d "$DEPLOY_DIR/.next" ]; then
    echo -e "${YELLOW}[BACKUP] Creating backup...${NC}"
    mkdir -p "$BACKUP_DIR"
    cp "$DEPLOY_DIR/.env.local" "$BACKUP_DIR/" 2>/dev/null || true
    cp -r "$DEPLOY_DIR/db" "$BACKUP_DIR/" 2>/dev/null || true
    cp -r "$DEPLOY_DIR/public" "$BACKUP_DIR/" 2>/dev/null || true
    # Keep last 3 backups
    ls -dt /DATA/AppData/razkindo-erp-backup-* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true
    echo -e "${GREEN}[BACKUP] Saved to $BACKUP_DIR${NC}"
  else
    echo -e "${YELLOW}[BACKUP] First deploy, no backup needed${NC}"
  fi
}

do_pull() {
  echo -e "${YELLOW}[PULL] Pulling latest code from $BRANCH...${NC}"
  if [ -d "$DEPLOY_DIR/.git" ]; then
    cd "$DEPLOY_DIR"
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
  else
    echo -e "${YELLOW}[PULL] Cloning repo...${NC}"
    mkdir -p "$DEPLOY_DIR"
    git clone -b "$BRANCH" "$GIT_REPO" "$DEPLOY_DIR"
  fi
  echo -e "${GREEN}[PULL] Code updated${NC}"
}

do_install() {
  echo -e "${YELLOW}[INSTALL] Installing dependencies...${NC}"
  cd "$DEPLOY_DIR"
  if command -v bun &> /dev/null; then
    bun install --frozen-lockfile 2>/dev/null || bun install
  elif command -v npm &> /dev/null; then
    npm install
  else
    echo -e "${RED}ERROR: No bun or npm found!${NC}"
    exit 1
  fi
  echo -e "${GREEN}[INSTALL] Done${NC}"
}

do_build() {
  echo -e "${YELLOW}[BUILD] Building Next.js (standalone)...${NC}"
  cd "$DEPLOY_DIR"
  export NODE_ENV=production
  export STB_MODE=true
  if command -v bun &> /dev/null; then
    bun run build
  elif command -v npm &> /dev/null; then
    npm run build
  fi
  echo -e "${GREEN}[BUILD] Done${NC}"
}

do_db_push() {
  echo -e "${YELLOW}[DB] Checking database schema...${NC}"
  cd "$DEPLOY_DIR"
  if [ -f "prisma/schema.prisma" ]; then
    if command -v bun &> /dev/null; then
      bunx prisma db push 2>/dev/null && echo -e "${GREEN}[DB] Schema up to date${NC}" || echo -e "${YELLOW}[DB] Schema push skipped${NC}"
    fi
  fi
}

do_restart() {
  echo -e "${YELLOW}[RESTART] Stopping old process...${NC}"
  pkill -f "server.js" 2>/dev/null || true
  pkill -f "next start" 2>/dev/null || true
  sleep 2

  echo -e "${YELLOW}[RESTART] Starting new process...${NC}"
  cd "$DEPLOY_DIR"
  export NODE_ENV=production
  export STB_MODE=true
  nohup bun server.js > server.log 2>&1 &
  NEW_PID=$!
  echo -e "${GREEN}[RESTART] Started PID: $NEW_PID${NC}"

  echo -e "${YELLOW}[CHECK] Waiting for server...${NC}"
  sleep 5
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Server running — HTTP $HTTP_CODE${NC}"
  else
    echo -e "${YELLOW}⚠️ Health check: HTTP $HTTP_CODE (may need more time)${NC}"
    echo -e "${YELLOW}   Check: tail -f $DEPLOY_DIR/server.log${NC}"
  fi
}

do_rollback() {
  echo -e "${YELLOW}[ROLLBACK] Finding latest backup...${NC}"
  LATEST=$(ls -dt /DATA/AppData/razkindo-erp-backup-* 2>/dev/null | head -1)
  if [ -z "$LATEST" ]; then
    echo -e "${RED}No backup found!${NC}"
    exit 1
  fi
  echo -e "${GREEN}[ROLLBACK] Using: $LATEST${NC}"

  pkill -f "server.js" 2>/dev/null || true
  sleep 2

  cp "$LATEST/.env.local" "$DEPLOY_DIR/.env.local" 2>/dev/null || true
  cp -r "$LATEST/db" "$DEPLOY_DIR/db" 2>/dev/null || true
  cp -r "$LATEST/public" "$DEPLOY_DIR/public" 2>/dev/null || true

  cd "$DEPLOY_DIR"
  export NODE_ENV=production
  export STB_MODE=true
  nohup bun server.js > server.log 2>&1 &
  echo -e "${GREEN}✅ Rolled back and restarted${NC}"
}

# ─── Main ─────────────────────────────────────────────

case "${1:-}" in
  --pull-only)
    do_pull
    echo -e "${GREEN}✅ Pull complete. Run ./deploy.sh to build & restart.${NC}"
    ;;
  --rollback)
    do_rollback
    ;;
  --restart-only)
    do_restart
    ;;
  --logs)
    tail -f "$DEPLOY_DIR/server.log"
    ;;
  --status)
    echo "--- Server Process ---"
    pgrep -fa "server.js" 2>/dev/null || echo "Not running"
    echo "--- Health Check ---"
    curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/ 2>/dev/null || echo "Cannot connect"
    echo "--- Disk Usage ---"
    du -sh "$DEPLOY_DIR" 2>/dev/null
    echo "--- Memory ---"
    free -h | head -2
    ;;
  *)
    do_backup
    do_pull
    do_install
    do_build
    do_db_push
    do_restart
    echo ""
    echo "========================================"
    echo -e "  ${GREEN}✅ Deploy complete!${NC}"
    echo "========================================"
    echo ""
    echo "Commands:"
    echo "  ./deploy.sh              Full deploy (pull + build + restart)"
    echo "  ./deploy.sh --pull-only  Git pull only"
    echo "  ./deploy.sh --restart    Restart server only"
    echo "  ./deploy.sh --rollback   Rollback to last backup"
    echo "  ./deploy.sh --logs       Tail server logs"
    echo "  ./deploy.sh --status     Show status"
    ;;
esac
