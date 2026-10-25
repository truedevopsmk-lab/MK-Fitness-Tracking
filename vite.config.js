import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/unified-pwa/',
  server: {
    proxy: {
      '/garmin-api': {
        target: 'https://personal.connectapi.garmin.com',
        changeOrigin: true,
        secure: true,
        rewrite: path => path.replace(/^\/garmin-api/, '')
      }
    }
  },
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon.svg', 'apple-touch-icon.png'],
    manifest: {
      id: './', name: "MK's Fitness Dashboard", short_name: 'MK Fitness',
      description: "MK's personal Garmin fitness and recovery dashboard",
      theme_color: '#071014', background_color: '#071014', display: 'standalone', orientation: 'portrait',
      start_url: './', scope: './',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }
      ],
      shortcuts: [
        { name: 'Morning check', short_name: 'Morning', url: './#/morning', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
        { name: 'Sync now', short_name: 'Sync', url: './#/sync', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] }
      ]
    },
    workbox: {
      // App shell only. Garmin API calls (/garmin-api, proxy origin) are never cached here: data lives in IndexedDB.
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/garmin-api/],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        { urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com', handler: 'StaleWhileRevalidate', options: { cacheName: 'google-fonts-css' } },
        { urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com', handler: 'CacheFirst', options: { cacheName: 'google-fonts-files', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } } }
      ]
    }
  })]
})
