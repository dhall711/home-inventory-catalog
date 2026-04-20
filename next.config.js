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
  // @react-pdf/renderer must NOT be bundled by Next - it ships its own
  // React reconciler and, when transpiled, can end up with a second copy of
  // React that the host doesn't recognize. That manifests as the
  // "Minified React error #31" / "object with keys {$$typeof, type, key,
  // ref, props}" crash when generating PDFs server-side.
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
};

module.exports = nextConfig;
