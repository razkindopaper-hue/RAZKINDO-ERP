import { NextRequest, NextResponse } from 'next/server';
import { enforceSuperAdmin } from '@/lib/require-auth';
import { getSupabaseConfig } from '@/lib/supabase-rest';

/**
 * POST /api/setup/create-storage-bucket
 *
 * Create the `product-images` Supabase Storage bucket (public).
 *
 * Uses the Supabase Management API via the admin client's storage API.
 * Creates a fresh client with the service role key for bucket creation.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await enforceSuperAdmin(request);
    if (!authResult.success) return authResult.response;

    const config = getSupabaseConfig();

    // Create a fresh admin client with service role for storage management
    const { createClient } = await import('@supabase/supabase-js');
    const adminClient = createClient(config.url, config.serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const bucketName = 'product-images';

    try {
      const { data, error } = await adminClient.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024, // 5MB
      });

      if (error) {
        const msg = error.message || '';

        // Bucket already exists
        if (msg.includes('already exists') || error.code === ' duplicate') {
          console.log('[Setup:CreateBucket] Bucket already exists:', bucketName);
          return NextResponse.json({
            success: true,
            message: 'Bucket sudah ada',
            exists: true,
            bucket: bucketName,
          });
        }

        console.error('[Setup:CreateBucket] Error:', error);
        return NextResponse.json({
          success: false,
          error: 'Gagal membuat bucket',
          details: msg,
        }, { status: 500 });
      }

      console.log('[Setup:CreateBucket] Created bucket:', bucketName, data);

      return NextResponse.json({
        success: true,
        message: 'Bucket berhasil dibuat',
        exists: false,
        bucket: bucketName,
      });
    } catch (storageError: any) {
      // Handle Supabase client-level errors (e.g., "Bucket already exists")
      const msg = storageError?.message || String(storageError);

      if (msg.includes('already exists') || msg.includes('already')) {
        return NextResponse.json({
          success: true,
          message: 'Bucket sudah ada',
          exists: true,
          bucket: bucketName,
        });
      }

      console.error('[Setup:CreateBucket] Storage error:', msg);
      return NextResponse.json({
        success: false,
        error: 'Gagal membuat bucket',
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[Setup:CreateBucket] Error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
