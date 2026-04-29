#!/bin/bash
# ============================================================
# setup-stb.sh — First-time STB setup (Docker-based)
# Run this ONCE on the STB device to prepare Docker environment
#
# Usage: bash setup-stb.sh
# ============================================================

set -e

echo "========================================"
echo "  Razkindo ERP — STB First-Time Setup"
echo "  Docker Deployment"
echo "  $(date)"
echo "========================================"

DEPLOY_DIR="/DATA/AppData/razkindo-erp"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[SETUP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; }

# ─── 1. Check Docker ─────────────────────────────────────
echo ""
echo "[1/4] Checking Docker..."
if command -v docker &> /dev/null; then
  log "Docker installed: $(docker --version)"
else
  err "Docker not found! Install Docker first:"
  echo "  curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if docker compose version &> /dev/null; then
  log "Docker Compose: $(docker compose version --short)"
else
  err "Docker Compose not found! Install Docker Compose plugin."
  exit 1
fi

# ─── 2. Login to GHCR ───────────────────────────────────
echo ""
echo "[2/4] Checking GHCR access..."
# Try pulling to verify access (GHCR public images don't need login)
if docker pull ghcr.io/henryarthanto/erpstb:latest > /dev/null 2>&1; then
  log "GHCR access OK ✅"
else
  warn "Cannot pull image. If it's a private repo, login:"
  echo "  echo 'YOUR_GITHUB_PAT' | docker login ghcr.io -u henryarthanto --password-stdin"
fi

# ─── 3. Setup deploy directory ──────────────────────────
echo ""
echo "[3/4] Setting up deploy directory..."
mkdir -p "$DEPLOY_DIR/docker-env/db"
mkdir -p "$DEPLOY_DIR/logs"

# Copy docker-compose.yml if not exists
if [ ! -f "$DEPLOY_DIR/docker-compose.yml" ]; then
  warn "docker-compose.yml not found!"
  echo "  Copy it to: $DEPLOY_DIR/docker-compose.yml"
else
  log "docker-compose.yml exists ✅"
fi

# Setup env file
if [ ! -f "$DEPLOY_DIR/docker-env/.env.local" ]; then
  warn "docker-env/.env.local not found!"
  echo "  Copy .env.local to: $DEPLOY_DIR/docker-env/.env.local"
  echo "  cp .env.local $DEPLOY_DIR/docker-env/.env.local"
else
  log "docker-env/.env.local exists ✅"
fi

# ─── 4. Pull & start ────────────────────────────────────
echo ""
echo "[4/4] Pulling latest image..."
docker compose -f "$DEPLOY_DIR/docker-compose.yml" pull 2>/dev/null || true

log "Starting container..."
docker compose -f "$DEPLOY_DIR/docker-compose.yml" up -d

echo ""
echo "========================================"
echo "  ✅ Setup complete!"
echo "========================================"
echo ""
echo "Useful commands:"
echo "  cd $DEPLOY_DIR"
echo "  ./deploy.sh              # Pull latest + restart"
echo "  ./deploy.sh --logs       # View logs"
echo "  ./deploy.sh --status     # Check status"
echo "  ./deploy.sh --rollback   # Rollback to previous image"
echo ""
echo "Make sure deploy.sh is in $DEPLOY_DIR:"
echo "  chmod +x deploy.sh"
echo ""
