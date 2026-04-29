# ============================================================
# Razkindo ERP — Dockerfile (Multi-stage, ARM-compatible)
# Target: Amlogic S9xx STB (aarch64/arm64)
# Registry: ghcr.io/henryarthanto/erpstb
# ============================================================

# ─── Stage 1: Dependencies ──────────────────────────────
FROM oven/bun:1.3 AS deps

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install ALL dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# ─── Stage 2: Build ─────────────────────────────────────
FROM oven/bun:1.3 AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY . .

# Build Next.js standalone
ENV NODE_ENV=production
ENV STB_MODE=true
ENV NEXT_TELEMETRY_DISABLED=1

RUN bun run build

# ─── Stage 3: Production ───────────────────────────────
FROM oven/bun:1.3-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV STB_MODE=true
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security (Debian commands)
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --no-create-home erp

# Set working directory ownership
RUN mkdir -p /app/db /app/logs && chown -R erp:nodejs /app

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static/
COPY --from=builder /app/public ./public/

# Copy prisma schema (for db:push if needed)
COPY --from=builder /app/prisma ./prisma/

# Install curl for healthcheck
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Switch to non-root user
USER erp

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]
