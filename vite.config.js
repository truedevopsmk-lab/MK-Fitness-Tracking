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
    manifest: {
      name: "MK's Fitness Dashboard", short_name: 'MK Fitness',
      description: "MK's personal Garmin fitness and recovery dashboard",
      theme_color: '#20c997', background_color: '#071014', display: 'standalone',
      start_url: './', icons: [
        { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
      ]
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] }
  })]
})
