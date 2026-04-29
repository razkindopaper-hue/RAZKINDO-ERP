#!/bin/bash
# ============================================================
# deploy.sh — STB Deploy Script (Docker-based)
# 
# Usage:
#   ./deploy.sh              # Pull latest image + restart
#   ./deploy.sh --update     # Pull + recreate (force update)
#   ./deploy.sh --rollback   # Rollback to previous image
#   ./deploy.sh --logs       # Tail container logs
#   ./deploy.sh --status     # Show status
#   ./deploy.sh --build-local # Build image locally (if no GHCR)
# ============================================================

set -e

COMPOSE_FILE="/DATA/AppData/razkindo-erp/docker-compose.yml"
IMAGE="ghcr.io/henryarthanto/erpstb:latest"
CONTAINER="razkindo-erp"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; }

case "${1:-}" in
  --update|"")
    log "Pulling latest image..."
    docker compose -f "$COMPOSE_FILE" pull

    log "Recreating container..."
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate

    sleep 5
    HTTP_CODE=$(docker exec $CONTAINER curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
      log "✅ Deploy success — HTTP $HTTP_CODE"
    else
      warn "Health check: HTTP $HTTP_CODE (may need more time)"
      warn "Check: docker compose -f $COMPOSE_FILE logs -f"
    fi
    ;;

  --pull-only)
    log "Pulling latest image..."
    docker compose -f "$COMPOSE_FILE" pull
    log "Done. Run ./deploy.sh to apply."
    ;;

  --restart)
    log "Restarting container..."
    docker compose -f "$COMPOSE_FILE" restart
    ;;

  --stop)
    log "Stopping..."
    docker compose -f "$COMPOSE_FILE" down
    ;;

  --logs)
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100
    ;;

  --status)
    echo "=== Container ==="
    docker compose -f "$COMPOSE_FILE" ps 2>/dev/null || docker ps --filter "name=$CONTAINER"
    echo ""
    echo "=== Image ==="
    docker inspect --format='{{.Created}} | {{.Config.Image}}' $CONTAINER 2>/dev/null || echo "Container not running"
    echo ""
    echo "=== Health ==="
    curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/ 2>/dev/null || echo "Cannot connect"
    echo ""
    echo "=== Disk ==="
    docker system df 2>/dev/null | head -5
    echo ""
    echo "=== Memory ==="
    free -h | head -2
    ;;

  --rollback)
    log "Finding previous image..."
    PREV_IMAGE=$(docker images ghcr.io/henryarthanto/erpstb --format "{{.Tag}} {{.CreatedAt}}" | grep -v latest | head -1 | awk '{print $1}')
    if [ -z "$PREV_IMAGE" ]; then
      # Try by SHA
      PREV_IMAGE=$(docker images ghcr.io/henryarthanto/erpstb --format "{{.ID}} {{.Tag}} {{.CreatedAt}}" | grep -v latest | head -1 | awk '{print $1}')
      if [ -z "$PREV_IMAGE" ]; then
        err "No previous image found for rollback"
        exit 1
      fi
    fi
    log "Rolling back to: $PREV_IMAGE"
    docker compose -f "$COMPOSE_FILE" down
    docker tag $PREV_IMAGE ghcr.io/henryarthanto/erpstb:rollback 2>/dev/null || true
    # Temporarily update image
    sed -i "s|ghcr.io/henryarthanto/erpstb:latest|ghcr.io/henryarthanto/erpstb:rollback|" "$COMPOSE_FILE"
    docker compose -f "$COMPOSE_FILE" up -d
    # Restore original
    sed -i "s|ghcr.io/henryarthanto/erpstb:rollback|ghcr.io/henryarthanto/erpstb:latest|" "$COMPOSE_FILE"
    log "✅ Rolled back"
    ;;

  --cleanup)
    log "Cleaning old images..."
    docker image prune -f
    docker builder prune -f
    log "Done"
    ;;

  --env-setup)
    log "Setting up env file..."
    mkdir -p /DATA/AppData/razkindo-erp/docker-env/db
    if [ ! -f /DATA/AppData/razkindo-erp/docker-env/.env.local ]; then
      warn "No .env.local found! Copy it:"
      echo "  cp .env.local /DATA/AppData/razkindo-erp/docker-env/.env.local"
    else
      log "docker-env/.env.local exists ✅"
    fi
    ;;

  *)
    echo "Razkindo ERP — STB Docker Deploy"
    echo ""
    echo "Usage: ./deploy.sh [command]"
    echo ""
    echo "Commands:"
    echo "  (none)      Pull latest image + restart (default)"
    echo "  --update    Same as default (pull + force recreate)"
    echo "  --pull-only Pull image without restarting"
    echo "  --restart   Restart container"
    echo "  --stop      Stop container"
    echo "  --logs      Tail container logs"
    echo "  --status    Show container & system status"
    echo "  --rollback  Rollback to previous image"
    echo "  --cleanup   Clean old Docker images"
    echo "  --env-setup Setup env directory"
    ;;
esac
