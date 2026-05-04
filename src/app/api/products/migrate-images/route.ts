import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { enforceSuperAdmin } from '@/lib/require-auth';
import { isStorageAvailable, isBase64Image, uploadBase64Image, getBase64Size } from '@/lib/image-upload';

/**
 * POST /api/products/migrate-images
 *
 * Migrate existing base64 product images to Supabase Storage CDN.
 * Processes all products with base64 image_url in batches.
 *
 * Query params:
 *   batchSize: number (default: 10, max: 50)
 *   dryRun: boolean — if true, only count images without migrating
 *
 * Body (optional):
 *   productIds: string[] — specific product IDs to migrate (otherwise all)
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await enforceSuperAdmin(request);
    if (!authResult.success) return authResult.response;

    if (!isStorageAvailable()) {
      return NextResponse.json({
        error: 'Supabase Storage tidak tersedia. Set NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env',
      }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const batchSize = Math.min(50, Math.max(1, Number(searchParams.get('batchSize')) || 10));
    const dryRun = searchParams.get('dryRun') === 'true';

    let query = db
      .from('products')
      .select('id, image_url, name')
      .not('image_url', 'is', null);

    const body = await request.json().catch(() => ({}));
    if (body.productIds?.length) {
      query = db.from('products').select('id, image_url, name').in('id', body.productIds);
    }

    const { data: products, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Gagal mengambil data produk' }, { status: 500 });
    }

    // Filter products with base64 images
    const base64Products = (products || []).filter(
      (p: any) => p.image_url && isBase64Image(p.image_url)
    );

    if (base64Products.length === 0) {
      return NextResponse.json({
        message: 'Tidak ada gambar base64 yang perlu dimigrasi',
        totalChecked: products?.length || 0,
        totalBase64: 0,
      });
    }

    if (dryRun) {
      const totalSize = base64Products.reduce((sum: number, p: any) => sum + getBase64Size(p.image_url), 0);
      return NextResponse.json({
        dryRun: true,
        totalChecked: products?.length || 0,
        totalBase64: base64Products.length,
        totalBase64SizeBytes: totalSize,
        totalBase64SizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        products: base64Products.map((p: any) => ({
          id: p.id,
          name: p.name,
          sizeKB: Math.round(getBase64Size(p.image_url) / 1024),
        })),
      });
    }

    // Process in batches
    const results = {
      migrated: 0,
      failed: 0,
      errors: [] as Array<{ productId: string; name: string; error: string }>,
      savedBytes: 0,
    };

    for (let i = 0; i < base64Products.length; i += batchSize) {
      const batch = base64Products.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (product: any) => {
          try {
            const sizeBefore = getBase64Size(product.image_url);

            const cdnUrl = await uploadBase64Image(
              product.image_url,
              product.id,
              `${product.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'product'}.webp`
            );

            // Update product with CDN URL
            const { error: updateError } = await db
              .from('products')
              .update({ image_url: cdnUrl })
              .eq('id', product.id);

            if (updateError) {
              throw new Error(updateError.message);
            }

            results.migrated++;
            results.savedBytes += sizeBefore;
          } catch (err: any) {
            results.failed++;
            results.errors.push({
              productId: product.id,
              name: product.name,
              error: err.message || 'Unknown error',
            });
          }
        })
      );
    }

    return NextResponse.json({
      success: true,
      message: `Migrasi selesai: ${results.migrated} berhasil, ${results.failed} gagal`,
      ...results,
      savedMB: (results.savedBytes / (1024 * 1024)).toFixed(2),
    });
  } catch (error) {
    console.error('[Migrate] Image migration error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

/**
 * GET /api/products/migrate-images?dryRun=true
 * Check how many base64 images exist without migrating.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await enforceSuperAdmin(request);
    if (!authResult.success) return authResult.response;

    const { data: products } = await db
      .from('products')
      .select('id, image_url, name')
      .not('image_url', 'is', null);

    const base64Products = (products || []).filter(
      (p: any) => p.image_url && isBase64Image(p.image_url)
    );

    const totalSize = base64Products.reduce((sum: number, p: any) => sum + getBase64Size(p.image_url), 0);

    return NextResponse.json({
      totalChecked: products?.length || 0,
      totalBase64: base64Products.length,
      totalBase64SizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      storageAvailable: isStorageAvailable(),
    });
  } catch (error) {
    console.error('[Migrate] Check error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
