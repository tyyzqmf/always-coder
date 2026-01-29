/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@always-coder/shared'],
  experimental: {
    serverComponentsExternalPackages: ['tweetnacl', 'tweetnacl-util'],
  },
};

module.exports = nextConfig;
