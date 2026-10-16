import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// HTTPS=1 enables a self-signed certificate so phones on the LAN get a secure context
// (service worker, Wake Lock, storage.persist). See README "Testing on a phone".
const https = process.env.HTTPS === '1';

export default defineConfig({
  plugins: [
    react(),
    https && basicSsl(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // 'prompt': a new version never reloads the page mid-session (ADR-3); the UI asks first.
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Fonts: latin + latin-ext of one variable family (normal and italic) stay well under this.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'KnittingTracker',
        short_name: 'Dzierganie',
        description: 'Śledzenie postępu dziergania ze schematów',
        lang: 'pl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#edefea',
        theme_color: '#edefea',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ].filter(Boolean) as PluginOption[],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
});
