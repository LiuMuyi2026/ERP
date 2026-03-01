const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Minimize JavaScript bundle size
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  // Optimize package imports — only import what's used
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@blocknote/core',
      '@blocknote/react',
      '@blocknote/mantine',
      '@dicebear/core',
      '@dicebear/collection',
    ],
  },
};
module.exports = withNextIntl(nextConfig);
