// =====================================================================
// QRIS PAYMENT SERVICE — Integration with Tripay Payment Gateway
//
// Handles QRIS payment creation, status checking, and webhook processing.
// Uses Tripay API for QRIS code generation.
//
// CONFIGURATION:
//   Primary:  settings table → key: 'tripay_config', value: JSON string
//             { apiKey, privateKey, merchantCode, mode }
//   Fallback: TRIPAY_API_KEY, TRIPAY_PRIVATE_KEY, TRIPAY_MERCHANT_CODE, TRIPAY_MODE in .env
//   Admin UI: Pengaturan > Integrasi
// =====================================================================

// ---------- types ----------

interface TripayConfig {
  apiKey: string;
  privateKey: string;
  merchantCode: string;
  mode: 'sandbox' | 'production';
}

interface TripayTransaction {
  reference: string;
  merchant_ref: string;
  amount: number;
  fee_merchant: number;
  fee_customer: number;
  total_fee: number;
  status: string;
  payment_method: string;
  payment_name: string;
  pay_code: string;
  pay_url: string;
  checkout_url: string;
  expired_time: number;
  qr_string?: string;
  qr_url?: string;
  instructions: Array<{
    title: string;
    steps: string[];
  }>;
}

interface TripayCallbackPayload {
  event: string;
  reference: string;
  merchant_ref: string;
  payment_method: string;
  payment_name: string;
  fee_merchant: number;
  fee_customer: number;
  total_fee: number;
  amount: number;
  status: string;
  paid_at?: string;
  paid_amount?: number;
  signature: string;
}

// ---------- cached config loader ----------

let _cachedConfig: TripayConfig | null = null;
let _configFetchTime: number = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTripayConfig(): Promise<TripayConfig> {
  const now = Date.now();
  if (_cachedConfig && (now - _configFetchTime) < CONFIG_CACHE_TTL) {
    return _cachedConfig;
  }

  // Try reading from the settings table first
  try {
    const { db } = await import('@/lib/supabase');
    const { data } = await db
      .from('settings')
      .select('value')
      .eq('key', 'tripay_config')
      .maybeSingle();

    if (data?.value) {
      const config = JSON.parse(data.value) as TripayConfig;
      if (!config.apiKey || !config.privateKey || !config.merchantCode) {
        throw new Error('Konfigurasi Tripay tidak lengkap');
      }
      _cachedConfig = config;
      _configFetchTime = now;
      return config;
    }
  } catch (err) {
    // If the settings table lookup itself fails (e.g. column doesn't exist yet),
    // fall through to env-var fallback below.
    if (err instanceof SyntaxError) {
      throw new Error('Format konfigurasi Tripay tidak valid');
    }
    // For non-parse errors (missing row, DB unreachable), silently fall through
  }

  // Fallback to environment variables for backward compatibility
  const envConfig: TripayConfig = {
    apiKey: process.env.TRIPAY_API_KEY || '',
    privateKey: process.env.TRIPAY_PRIVATE_KEY || '',
    merchantCode: process.env.TRIPAY_MERCHANT_CODE || '',
    mode: (process.env.TRIPAY_MODE as 'sandbox' | 'production') || 'sandbox',
  };

  if (envConfig.apiKey && envConfig.privateKey && envConfig.merchantCode) {
    _cachedConfig = envConfig;
    _configFetchTime = now;
    return envConfig;
  }

  throw new Error('Tripay belum dikonfigurasi. Buka Pengaturan > Integrasi untuk mengatur kredensial Tripay.');
}

/**
 * Invalidate the in-memory Tripay config cache.
 * Call this after updating the 'tripay_config' setting so the next
 * request picks up the new credentials immediately.
 */
export function invalidateTripayConfigCache(): void {
  _cachedConfig = null;
  _configFetchTime = 0;
}

// ---------- internal helpers ----------

async function getTripayBaseUrl(): Promise<string> {
  const config = await getTripayConfig();
  return config.mode === 'production'
    ? 'https://tripay.co.id/api'
    : 'https://tripay.co.id/api-sandbox';
}

async function getTripayAuth(): Promise<string> {
  const config = await getTripayConfig();
  return Buffer.from(`${config.apiKey}:${config.privateKey}`).toString('base64');
}

// ---------- public API ----------

/**
 * Create a QRIS payment transaction via Tripay.
 */
export async function createQrisPayment(data: {
  invoiceNo: string;
  amount: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  callbackUrl: string;
  returnUrl: string;
  expiresInMinutes?: number;
}): Promise<TripayTransaction> {
  const config = await getTripayConfig();
  if (!config.merchantCode) {
    throw new Error('TRIPAY_MERCHANT_CODE is required');
  }

  const methodCode = 'QRIS';
  const expiresInMinutes = data.expiresInMinutes || 1440; // 24 hours default

  const response = await fetch(`${await getTripayBaseUrl()}/transaction/create`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${await getTripayAuth()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method: methodCode,
      merchant_ref: data.invoiceNo,
      amount: data.amount,
      customer_name: data.customerName || '',
      customer_email: data.customerEmail || '',
      customer_phone: data.customerPhone || '',
      order_items: [
        {
          name: `Pembayaran ${data.invoiceNo}`,
          price: data.amount,
          quantity: 1,
        },
      ],
      callback_url: data.callbackUrl,
      return_url: data.returnUrl,
      expired_time: Math.floor(Date.now() / 1000) + (expiresInMinutes * 60),
    }),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || 'Gagal membuat pembayaran QRIS');
  }

  return result.data as TripayTransaction;
}

/**
 * Get QRIS payment status by reference.
 */
export async function getQrisStatus(reference: string): Promise<TripayTransaction> {
  const response = await fetch(
    `${await getTripayBaseUrl()}/transaction?reference=${encodeURIComponent(reference)}`,
    {
      headers: {
        'Authorization': `Basic ${await getTripayAuth()}`,
      },
    }
  );

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || 'Gagal cek status pembayaran');
  }

  return result.data as TripayTransaction;
}

/**
 * Verify Tripay callback signature.
 */
export async function verifyTripaySignature(payload: TripayCallbackPayload): Promise<boolean> {
  const config = await getTripayConfig();
  const privateKey = config.privateKey;
  if (!privateKey) return false;

  const crypto = await import('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', privateKey)
    .update(payload.merchant_ref + payload.status)
    .digest('hex');

  return expectedSignature === payload.signature;
}

/**
 * Map Tripay status to our internal status.
 */
export function mapTripayStatus(tripayStatus: string): 'paid' | 'pending' | 'expired' | 'failed' {
  switch (tripayStatus) {
    case 'PAID':
      return 'paid';
    case 'PENDING':
      return 'pending';
    case 'EXPIRED':
      return 'expired';
    case 'FAILED':
    case 'CANCELLED':
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * Check if QRIS/Tripay is configured (settings table or env vars).
 */
export async function isQrisConfigured(): Promise<boolean> {
  try {
    await getTripayConfig();
    return true;
  } catch {
    return false;
  }
}

export type { TripayTransaction, TripayCallbackPayload };
