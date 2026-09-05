import type { NextConfig } from 'next';

const config: NextConfig = {
  // Both database drivers are native/WASM and must not be bundled.
  serverExternalPackages: ['postgres', '@electric-sql/pglite'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default config;
