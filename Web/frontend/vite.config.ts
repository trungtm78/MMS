import { defineConfig } from 'vitest/config'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change less often than the app: separate chunks stay cached across deploys,
        // and the heavy ones (charts, maps, QR) download only with the pages that use them
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          const pkg = id.split(/node_modules[\\/]/).pop() ?? ''
          const is = (...names: string[]) => names.some((name) => pkg.startsWith(`${name}/`) || pkg.startsWith(`${name}\\`))
          if (is('react', 'react-dom', 'scheduler', 'react-is', 'react-router', 'react-router-dom', '@remix-run')) return 'vendor-react'
          // Shared by the app shell and the chart library: kept out of vendor-charts so the entry
          // does not have to load the charts to use them
          if (is('clsx', 'tailwind-merge')) return 'vendor-utils'
          if (is('@tanstack')) return 'vendor-query'
          if (is('recharts', 'recharts-scale', 'react-smooth', 'victory-vendor', 'd3-array', 'd3-color', 'd3-format', 'd3-interpolate', 'd3-path', 'd3-scale', 'd3-shape', 'd3-time', 'd3-time-format', 'internmap', 'decimal.js-light')) return 'vendor-charts'
          if (is('leaflet', 'react-leaflet', '@react-leaflet')) return 'vendor-maps'
          if (is('qrcode.react')) return 'vendor-qrcode'
          if (is('socket.io-client', 'engine.io-client', 'engine.io-parser', 'socket.io-parser', '@socket.io')) return 'vendor-socket'
          if (is('@radix-ui', '@floating-ui', 'react-remove-scroll', 'react-remove-scroll-bar', 'react-style-singleton', 'use-callback-ref', 'use-sidecar', 'aria-hidden')) return 'vendor-radix'
          if (is('zod', 'react-hook-form', '@hookform')) return 'vendor-forms'
          if (is('axios')) return 'vendor-http'
          if (is('lucide-react')) return 'vendor-icons'
          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**', 'src/hooks/**', 'src/components/ui/**'],
      exclude: ['src/**/*.test.*', 'src/test/**'],
    },
  },
})
