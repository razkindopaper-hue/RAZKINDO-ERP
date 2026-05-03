# ============================================
# Razkindo ERP - Production Dockerfile (STB)
# Supports: ARM64 (Raspberry Pi) + AMD64 (x86)
# ============================================

# --- Stage 1: Dependencies ---
FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# --- Stage 2: Build ---
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Build Next.js standalone
ENV STB_MODE=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN bun run build

# --- Stage 3: Production ---
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV STB_MODE=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Install runtime dependencies for native modules (pg, bcryptjs, sharp)
RUN apk add --no-cache libc6-compat openssl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy standalone output
COPY --from=builder --chown=appuser:nodejs /app/.next/standalone ./

# Copy static assets (Next.js public + .next/static)
COPY --from=builder --chown=appuser:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:nodejs /app/public ./public

# CRITICAL: Copy serverExternalPackages that standalone does NOT bundle.
# These are listed in next.config.ts serverExternalPackages and are required
# at runtime but NOT traced into .next/standalone by Next.js.
# Without these, login (bcryptjs), DB queries (pg, @prisma/client), and
# cache (ioredis) will all fail with "Cannot find module" errors.
COPY --from=deps --chown=appuser:nodejs /app/node_modules/pg ./node_modules/pg
COPY --from=deps --chown=appuser:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=deps --chown=appuser:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps --chown=appuser:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps --chown=appuser:nodejs /app/node_modules/ioredis ./node_modules/ioredis
# pg buffer/list/warnings are internal deps of pg
COPY --from=deps --chown=appuser:nodejs /app/node_modules/pg-native ./node_modules/pg-native 2>/dev/null || true
COPY --from=deps --chown=appuser:nodejs /app/node_modules/pg-protocol ./node_modules/pg-protocol 2>/dev/null || true
COPY --from=deps --chown=appuser:nodejs /app/node_modules/pg-types ./node_modules/pg-types 2>/dev/null || true
COPY --from=deps --chown=appuser:nodejs /app/node_modules/pg-cursor ./node_modules/pg-cursor 2>/dev/null || true
COPY --from=deps --chown=appuser:nodejs /app/node_modules/pg-pool ./node_modules/pg-pool 2>/dev/null || true
COPY --from=deps --chown=appuser:nodejs /app/node_modules/@types ./node_modules/@types 2>/dev/null || true
# sharp native bindings
COPY --from=deps --chown=appuser:nodejs /app/node_modules/sharp ./node_modules/sharp 2>/dev/null || true
# Optional: jspdf for PDF generation
COPY --from=deps --chown=appuser:nodejs /app/node_modules/jspdf ./node_modules/jspdf 2>/dev/null || true
COPY --from=deps --chown=appuser:nodejs /app/node_modules/jspdf-autotable ./node_modules/jspdf-autotable 2>/dev/null || true

# Create required directories
RUN mkdir -p /app/db && \
    mkdir -p /app/logs && \
    chown -R appuser:nodejs /app

USER appuser

EXPOSE 3000 81

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["bun", "server.js"]
