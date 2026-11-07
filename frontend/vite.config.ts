import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icons/*.png', 'img/*.png'],
    manifest: {
      id: '/', name: 'Listahan ni Lola', short_name: 'Listahan',
      description: 'Customer debts and payments for Lola Josie’s store.',
      start_url: '/', scope: '/', display: 'standalone',
      background_color: '#fffaf0', theme_color: '#fffaf0', lang: 'en-PH',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,woff2}'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api(?:\/|$)/],
      cleanupOutdatedCaches: true,
      runtimeCaching: [{
        urlPattern: ({ url }) => /^\/api(?:\/|$)/.test(url.pathname),
        handler: 'NetworkOnly',
      }],
    },
  })],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
