import { NextRequest, NextResponse } from 'next/server';

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/check-superadmin',
  '/api/health',
  '/api/health/ready',
  '/api/pwa/',
  '/api/payment/',
  '/api/pwa/icon',
  '/api/pwa/manifest',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to /api/ routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for Authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    // For browser navigation to API routes, return 401 JSON
    // For fetch/XHR, the client handles 401
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Basic token format validation (not full verification — that happens in the route handler)
  const token = authHeader.slice(7);
  if (token.length < 30 || token.length > 500) {
    return NextResponse.json(
      { error: 'Token tidak valid' },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
