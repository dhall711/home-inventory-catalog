/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  // @react-pdf/renderer ships its own React reconciler that picks the right
  // implementation based on React.version. Externalize so Node loads it
  // from node_modules at runtime (single module instance, no double-bundle).
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
};

module.exports = nextConfig;
