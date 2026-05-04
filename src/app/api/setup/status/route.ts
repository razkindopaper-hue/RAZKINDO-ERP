import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceSuperAdmin } from '@/lib/require-auth';
import { isBase64Image, getBase64Size } from '@/lib/image-upload';

interface SetupStatus {
  realtime: { ok: boolean; message: string };
  storage: { ok: boolean; message: string };
  imageMigration: { totalBase64: number; totalBase64SizeMB: string; message: string };
}

/**
 * GET /api/setup/status
 *
 * Check setup items: realtime, storage, image migration.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await enforceSuperAdmin(request);
    if (!authResult.success) return authResult.response;

    const [realtime, storage, imageMigration] = await Promise.all([
      checkRealtime(),
      checkStorage(),
      checkImageMigration(),
    ]);

    return NextResponse.json({ realtime, storage, imageMigration });
  } catch (error) {
    console.error('[Setup:Status] Error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────
// REALTIME CHECK — is Supabase URL configured?
// ─────────────────────────────────────────────────────────────────────

async function checkRealtime(): Promise<SetupStatus['realtime']> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ok = !!supabaseUrl;

  return {
    ok,
    message: ok
      ? 'Supabase terkonfigurasi. Klik "Aktifkan Realtime" untuk mengaktifkan.'
      : 'NEXT_PUBLIC_SUPABASE_URL belum dikonfigurasi',
  };
}

// ─────────────────────────────────────────────────────────────────────
// STORAGE CHECK — try to list product-images bucket
// ─────────────────────────────────────────────────────────────────────

async function checkStorage(): Promise<SetupStatus['storage']> {
  const bucketName = 'product-images';

  try {
    const { error } = await supabaseAdmin.storage.from(bucketName).list('', { limit: 1 });

    if (error) {
      const msg = error.message || '';
      if (msg.includes('not found') || msg.includes('does not exist') || error.code === '404') {
        return { ok: false, message: `Bucket "${bucketName}" belum dibuat` };
      }
      return { ok: false, message: `Storage error: ${msg}` };
    }

    return { ok: true, message: `Bucket "${bucketName}" sudah tersedia` };
  } catch {
    return { ok: false, message: 'Gagal memeriksa storage' };
  }
}

// ─────────────────────────────────────────────────────────────────────
// IMAGE MIGRATION CHECK — count base64 images
// ─────────────────────────────────────────────────────────────────────

async function checkImageMigration(): Promise<SetupStatus['imageMigration']> {
  try {
    const { db } = await import('@/lib/supabase');
    const { data: products } = await db
      .from('products')
      .select('id, image_url, name')
      .not('image_url', 'is', null);

    const base64Products = (products || []).filter(
      (p: any) => p.image_url && isBase64Image(p.image_url)
    );

    const totalSize = base64Products.reduce(
      (sum: number, p: any) => sum + getBase64Size(p.image_url),
      0
    );

    return {
      totalBase64: base64Products.length,
      totalBase64SizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      message: base64Products.length === 0
        ? 'Semua gambar sudah menggunakan CDN'
        : `${base64Products.length} gambar base64 perlu dimigrasi (${(totalSize / (1024 * 1024)).toFixed(2)} MB)`,
    };
  } catch {
    return {
      totalBase64: 0,
      totalBase64SizeMB: '0.00',
      message: 'Gagal memeriksa status migrasi gambar',
    };
  }
}
