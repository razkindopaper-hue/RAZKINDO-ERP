import { NextRequest, NextResponse } from 'next/server';
import { enforceSuperAdmin } from '@/lib/require-auth';
import { Pool } from 'pg';

const REALTIME_TABLES = [
  'events', 'transactions', 'products', 'payments',
  'finance_requests', 'users', 'customers',
];

/**
 * POST /api/setup/enable-realtime
 *
 * Enable Supabase Realtime for tables by adding them to the
 * supabase_realtime publication via direct DB connection.
 *
 * Handles permission errors gracefully — some Supabase plans
 * restrict publication management via SQL.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await enforceSuperAdmin(request);
    if (!authResult.success) return authResult.response;

    // Use DIRECT_URL for DDL (PgBouncer blocks ALTER PUBLICATION)
    const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!directUrl) {
      return NextResponse.json({
        success: false,
        error: 'DIRECT_URL atau DATABASE_URL belum dikonfigurasi',
      }, { status: 500 });
    }

    const pool = new Pool({ connectionString: directUrl, ssl: { rejectUnauthorized: false } });
    const client = await pool.connect();

    const successTables: string[] = [];
    const skippedTables: string[] = [];
    const errors: string[] = [];
    let publicationFound = false;

    try {
      // Step 1: Check if supabase_realtime publication exists
      const pubResult = await client.query(
        "SELECT pubname FROM pg_publication WHERE pubname = 'supabase_realtime'"
      );
      publicationFound = pubResult.rows.length > 0;

      if (!publicationFound) {
        // Try to create the publication
        try {
          await client.query('CREATE PUBLICATION supabase_realtime FOR ALL TABLES;');
          publicationFound = true;
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (msg.includes('already exists')) {
            publicationFound = true;
          } else {
            // Cannot create publication — try ALTER PUBLICATION anyway as a fallback
            console.warn('[Setup:EnableRealtime] Cannot create publication:', msg);
            // Still try ALTER PUBLICATION in case the error is misleading
            try {
              await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE events;');
              publicationFound = true;
            } catch {
              // Truly cannot manage publications
              return NextResponse.json({
                success: false,
                error: 'Gagal membuat publication. Aktifkan Realtime langsung dari Supabase Dashboard → Database → Replication.',
                hint: 'Buka Supabase Dashboard → Settings → Database → Replication, lalu tambahkan tabel manual.',
              }, { status: 500 });
            }
          }
        }
      }

      // Step 2: Check which tables are already in the publication
      const existingResult = await client.query(
        "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'"
      );
      const existingTables = new Set(existingResult.rows.map((r: any) => r.tablename));

      // Step 3: Add only tables that aren't already in the publication
      for (const table of REALTIME_TABLES) {
        if (existingTables.has(table)) {
          skippedTables.push(table);
          continue;
        }

        try {
          await client.query(
            `ALTER PUBLICATION supabase_realtime ADD TABLE ${table};`
          );
          successTables.push(table);
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (msg.includes('already') || msg.includes('member')) {
            skippedTables.push(table);
          } else if (msg.includes('does not exist') || msg.includes('relation')) {
            // Table doesn't exist in DB — skip silently (not critical)
            skippedTables.push(table);
          } else if (msg.includes('permission denied') || msg.includes('must be owner') || msg.includes('superuser')) {
            errors.push(`${table}: Tidak punya izin (Aktifkan via Supabase Dashboard)`);
          } else {
            errors.push(`${table}: ${msg.substring(0, 100)}`);
          }
        }
      }
    } finally {
      client.release();
      await pool.end().catch(() => {});
    }

    const allTables = [...successTables, ...skippedTables];

    // Determine success: all tables are either added or already existed
    const allOk = errors.length === 0 && allTables.length === REALTIME_TABLES.length;

    const message = errors.length > 0
      ? `Realtime: ${successTables.length} ditambahkan, ${skippedTables.length} sudah ada, ${errors.length} error`
      : `Realtime aktif untuk ${allTables.length} tabel (${successTables.length} baru)`;

    console.log('[Setup:EnableRealtime]', message, { successTables, skippedTables, errors });

    return NextResponse.json({
      success: allOk,
      message,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (error) {
    console.error('[Setup:EnableRealtime] Error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
