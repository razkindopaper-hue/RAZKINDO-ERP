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
