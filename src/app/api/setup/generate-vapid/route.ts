import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { enforceSuperAdmin } from '@/lib/require-auth';

/**
 * POST /api/setup/generate-vapid
 *
 * Generate VAPID keys for push notifications.
 *
 * The generated keys are stored in the `settings` table as `vapid_config`.
 * Since we can't modify .env at runtime, the push notification service
 * should read VAPID config from the settings table.
 *
 * Returns the generated keys so the admin can optionally set them in .env
 * for NEXT_PUBLIC_VAPID_PUBLIC_KEY (used client-side).
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await enforceSuperAdmin(request);
    if (!authResult.success) return authResult.response;

    // Generate VAPID keys
    const webpush = await import('web-push');
    const vapidKeys = webpush.generateVAPIDKeys();
    const { publicKey, privateKey } = vapidKeys;

    const subject = 'mailto:admin@razkindo.com';
    const vapidConfig = JSON.stringify({
      publicKey,
      privateKey,
      subject,
    });

    // Store in settings table
    // Try update first, then insert if not exists
    const { data: existing } = await db
      .from('settings')
      .select('id')
      .eq('key', 'vapid_config')
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await db
        .from('settings')
        .update({
          value: vapidConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('key', 'vapid_config');

      if (updateError) {
        console.error('[Setup:GenerateVapid] Update error:', updateError.message);
        return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
      }
    } else {
      const crypto = await import('crypto');
      const newId = crypto.randomUUID();

      const { error: insertError } = await db
        .from('settings')
        .insert({
          id: newId,
          key: 'vapid_config',
          value: vapidConfig,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('[Setup:GenerateVapid] Insert error:', insertError.message);
        return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
      }
    }

    console.log('[Setup:GenerateVapid] VAPID keys generated and stored in settings');

    return NextResponse.json({
      success: true,
      publicKey,
      privateKey,
      subject,
      message: 'VAPID keys berhasil dibuat dan disimpan di settings',
      note: 'Set NEXT_PUBLIC_VAPID_PUBLIC_KEY di .env untuk client-side push notifications. Private key aman di settings table.',
    });
  } catch (error) {
    console.error('[Setup:GenerateVapid] Error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
