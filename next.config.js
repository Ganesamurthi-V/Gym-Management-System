/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'your-app.vercel.app'],
    },
    // Tree-shake lucide-react and date-fns — only import used icons/functions
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },

  // Keep ExcelJS server-side only — prevents it from being bundled into client chunks
  serverExternalPackages: ['exceljs'],

  compiler: {
    // Remove console.log in production builds
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // Aggressive chunk splitting for better caching
  webpack(config, { isServer }) {
    if (!isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          // Isolate supabase into its own chunk — rarely changes
          supabase: {
            test: /[\\/]node_modules[\\/]@supabase[\\/]/,
            name: 'supabase',
            chunks: 'all',
            priority: 20,
          },
          // date-fns into its own chunk
          dateFns: {
            test: /[\\/]node_modules[\\/]date-fns[\\/]/,
            name: 'date-fns',
            chunks: 'all',
            priority: 15,
          },
        },
      }
    }
    return config
  },
}

module.exports = nextConfig
