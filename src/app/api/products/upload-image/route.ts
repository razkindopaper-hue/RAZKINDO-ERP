import { NextRequest, NextResponse } from 'next/server';
import { verifyAndGetAuthUser } from '@/lib/token';
import { uploadProductImage, isStorageAvailable } from '@/lib/image-upload';

/**
 * POST /api/products/upload-image
 *
 * Upload a product image to Supabase Storage CDN.
 *
 * Form data:
 *   file: File — The image file (max 5MB, JPG/PNG/WebP/GIF)
 *   productId: string — Product ID for folder organization
 *
 * Returns: { url: string } — Public CDN URL of the uploaded image
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAndGetAuthUser(request.headers.get('authorization'), { role: true });
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isStorageAvailable()) {
      return NextResponse.json({
        error: 'Storage tidak tersedia. Pastikan Supabase Storage dikonfigurasi.',
        fallback: true,
      }, { status: 503 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const productId = formData.get('productId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'File gambar diperlukan' }, { status: 400 });
    }

    if (!productId) {
      return NextResponse.json({ error: 'Product ID diperlukan' }, { status: 400 });
    }

    const url = await uploadProductImage(file, productId);

    return NextResponse.json({ url, success: true });
  } catch (error) {
    console.error('[Upload] Image upload error:', error);
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan server';
    // Return user-friendly error for validation errors, generic for server errors
    const status = message.includes('tidak didukung') || message.includes('terlalu besar') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
