import { NextRequest, NextResponse } from 'next/server';
import { enforceSuperAdmin } from '@/lib/require-auth';

/**
 * POST /api/setup/db-push
 *
 * Push the Prisma schema to the database to create missing tables
 * (e.g., qris_payments).
 *
 * Uses `npx prisma db push --accept-data-loss` which connects via DATABASE_URL.
 * In sandbox environments (SQLite) this will fail — that's expected.
 * This route is meant for production Supabase deployments.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await enforceSuperAdmin(request);
    if (!authResult.success) return authResult.response;

    let output: string;

    try {
      const { execSync } = await import('child_process');

      output = execSync('npx prisma db push --accept-data-loss 2>&1', {
        cwd: process.cwd(),
        timeout: 60_000, // 60 seconds
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (execError: any) {
      // execSync throws on non-zero exit code
      // prisma db push returns non-zero if there are errors
      const stderr = execError?.stderr || execError?.stdout || '';
      const stdout = execError?.stdout || '';
      output = stdout + stderr;

      console.error('[Setup:DbPush] Prisma error:', output);

      return NextResponse.json({
        success: false,
        error: 'Gagal mempush schema ke database',
        output: output.substring(0, 2000), // Truncate long output
      }, { status: 500 });
    }

    console.log('[Setup:DbPush] Success:', output?.substring(0, 500));

    return NextResponse.json({
      success: true,
      message: 'Schema berhasil di-push ke database',
      output: output?.substring(0, 2000) || '',
    });
  } catch (error) {
    console.error('[Setup:DbPush] Error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
