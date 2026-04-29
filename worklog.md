---
Task ID: 1
Agent: Main Agent
Task: Rebuild Razkindo ERP from backup to Next.js project with Supabase PostgreSQL

Work Log:
- Extracted backup file `razkindo-backup-clean.tar.gz` to `/tmp/razkindo-extract/`
- Analyzed project structure: 50+ ERP components, 100+ API routes, 30+ lib files, complex Prisma schema with 25+ tables
- Copied all source files (`src/`, `prisma/`, `public/`) from backup to project
- Created `.env` and `.env.local` with Supabase credentials (DATABASE_URL, DIRECT_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
- Updated Prisma schema: changed provider to `postgresql`, set up `directUrl` for migrations
- Updated `next.config.ts`: removed Sentry (no setup), added Supabase external packages, security headers, rewrite rules
- Installed additional dependencies: `@supabase/supabase-js`, `bcryptjs`, `pg`, `xlsx`, `jspdf`, `jspdf-autotable`, `socket.io-client`, `@types/bcryptjs`
- Pushed Prisma schema to Supabase PostgreSQL database (30 tables created/updated)
- Started dev server and verified all functionality

Stage Summary:
- Full Razkindo ERP system rebuilt and running on Supabase PostgreSQL
- All API routes working (auth, dashboard, products, customers, transactions, users, settings, events)
- Login flow verified working with Supabase backend
- PWA support included (manifest, service worker, icons)
- Multi-module ERP: Dashboard, Transactions, Products, Customers, Suppliers, Finance, Salaries, Courier, Settings, Sales Tasks, Cashback, PWA Orders
- Connected to Supabase project: eglmvtleuonoeomovnwa.supabase.co
