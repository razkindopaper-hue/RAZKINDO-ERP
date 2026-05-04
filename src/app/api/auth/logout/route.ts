import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthUser, invalidateUserAuthCache } from '@/lib/token';
import { blacklistToken } from '@/lib/token-blacklist';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const userId = await verifyAuthUser(authHeader);
    if (userId) {
      // Blacklist this specific token so it cannot be reused
      blacklistToken(authHeader);
      // Invalidate user auth cache so token check forces DB re-verification
      invalidateUserAuthCache(userId);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
