import type { NextConfig } from 'next';

/**
 * Isolated Next.js Static Export Configuration for Tauri v2 Android (Phase 4)
 *
 * Invariant: Resides exclusively inside android-offline-spike/ and NEVER
 * modifies root next.config.ts or production Vercel deployment.
 */
const nextExportConfig: NextConfig = {
  output: 'export',
  distDir: 'out_android',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // Offline static hybrid mode: no server-side Node.js/Edge middleware required
  reactStrictMode: true,
};

export default nextExportConfig;

