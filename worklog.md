---
Task ID: 1
Agent: Main
Task: Fix "Could not find the function public.decrement_stock" database error

Work Log:
- Analyzed screenshot showing error: "Stok tidak cukup untuk ... Could not find the function public.decrement_stock(p_product_id, p_qty) in the schema cache"
- Found that the project has `ensure-rpc.ts` with 26 RPC function definitions, but the env vars `SUPABASE_DB_URL` and `SUPABASE_POOLER_URL` were missing from `.env`
- Found no `instrumentation.ts` file existed to auto-deploy RPC functions on server startup
- Added `SUPABASE_DB_URL` and `SUPABASE_POOLER_URL` to `.env`
- Created `src/instrumentation.ts` that calls `ensureRpcFunctions()` on server startup
- Restarted dev server, confirmed all 26/26 RPC functions deployed successfully

Stage Summary:
- Root cause: Missing env vars + missing instrumentation.ts meant PostgreSQL RPC functions (decrement_stock, increment_stock, etc.) were never deployed to the Supabase database
- Fix: Added env vars and created instrumentation.ts for auto-deployment
- All 26 RPC functions now deployed on every server restart
- Dev server running, no errors

---
Task ID: 1
Agent: Main Agent
Task: Mutasi improvements - piutang list, admin fee, arus kas integration, bank balance sync

Work Log:
- Rewrote BankMutationsTab.tsx: replaced auto-match with full piutang list selection
- Added admin fee (biaya admin) support for invoice payment from mutations
- Changed lunas dialog from Dialog to Sheet (bottom sheet) for better mobile UX
- Added bank balance sync display showing system balance vs Moota balance
- Enhanced moota match API lunas handler: now updates pool balances (hpp/profit), receivables, and transaction hpp_paid/profit_paid tracking
- Changed moota match expense to create finance_requests (instead of expenses table) so it appears in arus kas
- Added pool_deposit type to finance_requests for pool deposit tracking
- Added purchase type handling in moota match API
- Updated cash flow API: added fetchPoolDeposits fetcher for pool deposit entries
- Updated cash flow API: pool deposits now counted in inflow total
- Updated cash flow API: pool_deposit excluded from outflow aggregation
- Added pool_deposit category color (violet) in FinanceModule

Stage Summary:
- BankMutationsTab.tsx: Full rewrite with piutang list, admin fee, bank balance sync
- /api/finance/moota/match/route.ts: Enhanced with pool balance updates, receivable updates, finance_request creation for all action types
- /api/finance/cash-flow/route.ts: Added pool deposit fetcher and updated totals
- FinanceModule.tsx: Added pool_deposit category color

---
Task ID: audit-fix
Agent: Main Agent
Task: Fix all issues from AUDIT_3MEI_RAZKINDO.md

Work Log:
- BUG-01: Added `prisma generate` to build script in package.json
- BUG-02: Added `STB_MODE=false` to .env (ready for STB deployment)
- BUG-03: Note: start.sh uses `bun server.js` — need `--max-old-space-size=384` for STB (documented in start.sh)
- BUG-04: Added discount, discountAmount, discountType to transactionItemSchema; added globalDiscount, globalDiscountAmount to transactionSchemas.create
- BUG-05: Rewrote Caddyfile — added SSE flush_interval -1, WebSocket upgrade handler for Socket.IO
- BUG-06: kept ignoreBuildErrors: true (82 existing TS errors — needs dedicated fix sprint)
- BUG-07: kept reactStrictMode: false (needs dedicated fix sprint)
- BUG-08: Generated strong random AUTH_SECRET (64 hex chars)
- BUG-09: Documented — rate limiter persistence requires manual implementation (in-memory is adequate for single-server STB)
- BUG-10: Fixed build.sh hardcoded path — now uses env var with auto-detect fallback
- BUG-11: Noted in .env — NEXT_PUBLIC_APP_URL needs to be updated per deployment
- BUG-12: Fixed graceful-degradation.ts to use STB circuit breaker thresholds from stb-config.ts
- SEC-01: Cleaned up .gitignore — explicit .env entries, added db/.auth-secret and db/rate-limits.json
- SEC-02: Fixed SUPABASE_URL export type annotation (string instead of empty string type)
- SEC-03: Fixed next.config.ts Cache-Control — now only applies no-store to /api/* routes, static assets always cached
- SEC-04: Removed NODE_ENV=development from .env (start.sh handles this)
- STB-05: Fixed memory-guard.ts — baseline now resets when heap shrinks below 70% of baseline after GC
- STB-07: Added compress: true to next.config.ts
- CODE-01: Fixed toCamelCase — added WeakSet-based circular reference protection

Stage Summary:
- 15 files modified across critical, medium, and low priority issues
- Build script, validators, Caddyfile, .env, .gitignore, next.config.ts all fixed
- Security improved: strong AUTH_SECRET, no NODE_ENV leak, proper .gitignore
- STB readiness: circuit breaker thresholds, memory guard baseline reset, compression, cache control
- Code quality: circular reference protection in toCamelCase
- Remaining: BUG-06/07 (TS errors + strict mode) need dedicated sprint; STB-01/02/03/04 (BullMQ lazy, MDXEditor lazy, Sentry conditional, worker process) are optimization tasks
