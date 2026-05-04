// =====================================================================
// IMAGE UPLOAD SERVICE — Supabase Storage integration
//
// Handles product image upload to Supabase Storage CDN.
// Replaces base64 image storage in the database with CDN URLs.
//
// FLOW:
//   1. Client sends file (multipart/form-data) to /api/products/upload-image
//   2. Server uploads to Supabase Storage: product-images/{productId}/{filename}
//   3. Server returns public CDN URL
//   4. Client saves URL to product.image_url (NOT base64)
//
// FALLBACK:
//   If Supabase Storage is not configured, falls back to base64.
//   This ensures backward compatibility during migration.
// =====================================================================

import { supabaseRestClient } from './supabase-rest';

const PRODUCT_IMAGES_BUCKET = 'product-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Check if Supabase Storage is available.
 */
export function isStorageAvailable(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Upload a product image to Supabase Storage.
 *
 * @param file - File object from input[type="file"]
 * @param productId - Product ID for folder organization
 * @returns Public URL of the uploaded image
 */
export async function uploadProductImage(file: File, productId: string): Promise<string> {
  if (!isStorageAvailable()) {
    throw new Error('Supabase Storage tidak tersedia');
  }

  // Validate file
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Format file tidak didukung. Gunakan JPG, PNG, WebP, atau GIF.');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Ukuran file terlalu besar. Maksimal 5MB.');
  }

  // Generate unique filename
  const ext = file.name.split('.').pop() || 'jpg';
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const filename = `${timestamp}-${randomId}.${ext}`;
  const filePath = `${productId}/${filename}`;

  // Upload to Supabase Storage
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const { data, error } = await supabaseRestClient.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(filePath, uint8Array, {
      contentType: file.type,
      cacheControl: '31536000', // 1 year cache
      upsert: false,
    });

  if (error) {
    console.error('[Storage] Upload error:', error);
    throw new Error('Gagal mengupload gambar');
  }

  // Get public URL
  const { data: urlData } = supabaseRestClient.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Upload a base64 image to Supabase Storage.
 * Used for AI-generated images and migration from existing base64 data.
 *
 * @param base64DataUrl - Full data URL like "data:image/png;base64,iVBOR..."
 * @param productId - Product ID for folder organization
 * @param filename - Optional filename (auto-generated if not provided)
 * @returns Public URL of the uploaded image
 */
export async function uploadBase64Image(
  base64DataUrl: string,
  productId: string,
  filename?: string
): Promise<string> {
  if (!isStorageAvailable()) {
    throw new Error('Supabase Storage tidak tersedia');
  }

  // Parse base64 data URL
  const matches = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Format base64 tidak valid');
  }

  const contentType = matches[1];
  const base64Data = matches[2];

  if (!ALLOWED_TYPES.includes(contentType)) {
    throw new Error(`Format ${contentType} tidak didukung.`);
  }

  // Convert base64 to Uint8Array
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  if (bytes.length > MAX_FILE_SIZE) {
    throw new Error('Ukuran gambar terlalu besar. Maksimal 5MB.');
  }

  // Generate filename
  const ext = contentType.split('/')[1] || 'png';
  const actualFilename = filename || `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const filePath = `${productId}/${actualFilename}`;

  // Upload to Supabase Storage
  const { error } = await supabaseRestClient.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(filePath, bytes, {
      contentType,
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) {
    console.error('[Storage] Upload base64 error:', error);
    throw new Error('Gagal mengupload gambar');
  }

  // Get public URL
  const { data: urlData } = supabaseRestClient.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Delete a product image from Supabase Storage.
 */
export async function deleteProductImage(imageUrl: string): Promise<void> {
  if (!isStorageAvailable()) return;

  try {
    // Extract path from public URL
    // URL format: https://project.supabase.co/storage/v1/object/public/product-images/{productId}/{filename}
    const url = new URL(imageUrl);
    const pathParts = url.pathname.split('/public/');
    if (pathParts.length < 2) return;

    const filePath = pathParts[1];
    await supabaseRestClient.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .remove([filePath]);
  } catch (error) {
    console.error('[Storage] Delete error:', error);
    // Non-blocking — image cleanup is best-effort
  }
}

/**
 * Check if a string is a base64 data URL.
 */
export function isBase64Image(url: string): boolean {
  return url?.startsWith('data:image/') || false;
}

/**
 * Get the approximate size of a base64 image in bytes.
 */
export function getBase64Size(base64Url: string): number {
  if (!base64Url?.startsWith('data:')) return 0;
  const base64Data = base64Url.split(',')[1];
  if (!base64Data) return 0;
  return Math.round((base64Data.length * 3) / 4);
}
