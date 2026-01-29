const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.alias['@always-coder/shared'] = path.resolve(__dirname, '../shared/dist');
    return config;
  },
};

module.exports = nextConfig;
