#!/bin/bash
# ============================================================
# setup-stb.sh — First-time STB setup
# Run this ONCE on the STB device to prepare the environment
#
# Usage: bash setup-stb.sh
# ============================================================

set -e

echo "========================================"
echo "  Razkindo ERP — STB First-Time Setup"
echo "  $(date)"
echo "========================================"

# ─── 1. Install Bun ────────────────────────────────────
echo ""
echo "[1/5] Installing Bun..."
if command -v bun &> /dev/null; then
  echo "Bun already installed: $(bun --version)"
else
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo "Bun installed: $(bun --version)"
fi

# ─── 2. Install Node dependencies (if needed) ──────────
echo ""
echo "[2/5] Checking system packages..."
if command -v apt-get &> /dev/null; then
  apt-get update -qq
  apt-get install -y -qq curl wget git unzip 2>/dev/null || true
fi

# ─── 3. Setup deploy directory ─────────────────────────
echo ""
echo "[3/5] Setting up deploy directory..."
DEPLOY_DIR="/DATA/AppData/razkindo-erp"
mkdir -p "$DEPLOY_DIR"

# ─── 4. Create systemd service ─────────────────────────
echo ""
echo "[4/5] Creating systemd service..."
cat > /etc/systemd/system/razkindo-erp.service << 'EOF'
[Unit]
Description=Razkindo ERP (Next.js)
After=network.target

[Service]
Type=simple
WorkingDirectory=/DATA/AppData/razkindo-erp
Environment=NODE_ENV=production
Environment=STB_MODE=true
ExecStart=/root/.bun/bin/bun server.js
Restart=always
RestartSec=5
StandardOutput=append:/DATA/AppData/razkindo-erp/server.log
StandardError=append:/DATA/AppData/razkindo-erp/server.log

# Memory limits for STB (2GB RAM device)
MemoryMax=512M
MemoryHigh=384M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "Service created. Enable with: systemctl enable razkindo-erp"

# ─── 5. Configure Caddy (reverse proxy) ────────────────
echo ""
echo "[5/5] Checking Caddy..."
if command -v caddy &> /dev/null; then
  echo "Caddy already installed"
else
  echo "Install Caddy manually if needed:"
  echo "  apt install -y debian-keyring debian-archive-keyring apt-transport-https"
  echo "  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg"
  echo "  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list"
  echo "  apt update && apt install caddy"
fi

echo ""
echo "========================================"
echo "  ✅ Setup complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Copy deploy.sh to STB:"
echo "     scp deploy.sh root@<STB_IP>:/DATA/AppData/razkindo-erp/"
echo ""
echo "  2. Run deploy:"
echo "     cd /DATA/AppData/razkindo-erp && chmod +x deploy.sh && ./deploy.sh"
echo ""
echo "  3. Or enable auto-start:"
echo "     systemctl enable razkindo-erp && systemctl start razkindo-erp"
echo ""
