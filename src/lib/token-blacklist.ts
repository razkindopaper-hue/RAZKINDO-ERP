// =====================================================================
// TOKEN BLACKLIST — In-memory token revocation mechanism
//
// Supports two revocation strategies:
//   1. Per-token revocation (logout): blacklists userId:timestamp pair
//   2. Per-user revocation (password change): invalidates ALL tokens
//      issued before the revocation timestamp
//
// In-memory only — tokens expire in 7 days anyway, no DB needed.
// LRU eviction with max 50,000 entries and 7-day TTL.
// =====================================================================

const BLACKLIST_MAX_SIZE = 50_000;
const BLACKLIST_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (matches token expiry)

// Per-token blacklist: "userId:timestamp" → expiresAt
const _tokenBlacklist = new Map<string, number>();

// Per-user revocation: userId → revokedAt timestamp
// All tokens with timestamp < revokedAt are considered revoked
const _userRevocations = new Map<string, number>();

// Periodic cleanup of expired entries (every 30 minutes)
const _cleanupTimer = setInterval(() => {
  const now = Date.now();
  // Cleanup per-token blacklist
  for (const [key, expiresAt] of _tokenBlacklist) {
    if (expiresAt <= now) _tokenBlacklist.delete(key);
  }
  // Cleanup user revocations (keep for 7 days since tokens expire by then)
  for (const [userId, revokedAt] of _userRevocations) {
    if (now - revokedAt > BLACKLIST_TTL) _userRevocations.delete(userId);
  }
}, 30 * 60 * 1000);
if (_cleanupTimer.unref) _cleanupTimer.unref();

/**
 * Extract userId:timestamp pair from an Authorization header value.
 * Returns the pair string or null if the token format is invalid.
 */
function extractTokenPair(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  if (token.length < 30 || token.length > 500) return null;

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    const [userId, timestamp, signature] = parts;
    if (!userId || !timestamp || !signature) return null;
    const ts = parseInt(timestamp);
    if (isNaN(ts)) return null;
    return `${userId}:${timestamp}`;
  } catch {
    return null;
  }
}

/**
 * Evict oldest entries to stay within max size limit.
 * Map preserves insertion order, so first keys are oldest.
 */
function evictIfNeeded(): void {
  if (_tokenBlacklist.size < BLACKLIST_MAX_SIZE) return;
  const evictCount = Math.min(1000, _tokenBlacklist.size - BLACKLIST_MAX_SIZE + 100);
  let count = 0;
  for (const key of _tokenBlacklist.keys()) {
    _tokenBlacklist.delete(key);
    if (++count >= evictCount) break;
  }
}

/**
 * Blacklist a specific token (e.g., on logout).
 * Extracts userId:timestamp from the Authorization header and adds to blacklist.
 */
export function blacklistToken(authHeader: string | null): boolean {
  const pair = extractTokenPair(authHeader);
  if (!pair) return false;

  evictIfNeeded();
  _tokenBlacklist.set(pair, Date.now() + BLACKLIST_TTL);
  return true;
}

/**
 * Check if a specific token is blacklisted.
 * Returns true if the token has been revoked (either per-token or per-user revocation).
 */
export function isTokenBlacklisted(authHeader: string | null): boolean {
  if (!authHeader) return false;

  const pair = extractTokenPair(authHeader);
  if (!pair) return false;

  // Check per-token blacklist
  const expiresAt = _tokenBlacklist.get(pair);
  if (expiresAt && expiresAt > Date.now()) return true;

  // Check per-user revocation (all tokens issued before revocation time)
  const colonIndex = pair.indexOf(':');
  if (colonIndex > 0) {
    const userId = pair.substring(0, colonIndex);
    const tokenTimestamp = parseInt(pair.substring(colonIndex + 1));
    const revokedAt = _userRevocations.get(userId);
    if (revokedAt && !isNaN(tokenTimestamp) && tokenTimestamp < revokedAt) {
      return true;
    }
  }

  return false;
}

/**
 * Blacklist ALL tokens for a user (e.g., on password change).
 * Uses a timestamp-based approach: any token issued before now is considered revoked.
 * This is more efficient than tracking individual tokens.
 */
export function blacklistAllUserTokens(userId: string): void {
  _userRevocations.set(userId, Date.now());
}

/**
 * Get the current count of blacklisted tokens and user-level revocations.
 * Useful for monitoring and debugging.
 */
export function getBlacklistedCount(): { tokens: number; users: number } {
  return {
    tokens: _tokenBlacklist.size,
    users: _userRevocations.size,
  };
}
