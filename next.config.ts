import type { NextConfig } from "next";

const isSTB = process.env.STB_MODE === 'true' || process.env.STB_MODE === '1';

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ['pg', 'bcryptjs', '@prisma/client', 'prisma'],
  // typescript: { ignoreBuildErrors: false }, // TODO: enable after fixing all TS errors
  typescript: {
    ignoreBuildErrors: false,
  },
  // reactStrictMode: true, // TODO: re-enable after fixing double-mount side effects in ERP components
  reactStrictMode: false,

  ...(isSTB ? {
    experimental: {
      workerThreads: false,
      optimizeCss: false,
    },
  } : {}),

  allowedDevOrigins: [
    "space.z.ai",
    "space.chatglm.site",
    ".space.z.ai",
    ".space.chatglm.site",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],

  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: '/api/pwa/icon?size=32',
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.moota.co",
              "frame-ancestors 'self'",
            ].join('; '),
          },
          ...(!isSTB ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
          ...(isSTB ? [
            { key: 'Cache-Control', value: 'no-store, max-age=0' },
          ] : []),
        ],
      },
      ...(!isSTB ? [{
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      }] : []),
    ];
  },
};

export default nextConfig;
