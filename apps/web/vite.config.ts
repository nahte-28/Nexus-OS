/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Publishes the public Supabase settings as /nexus-config.json, so the Android companion only
 * needs the NEXUS web address to connect. Both values are public by design (row-level security
 * protects the data); they are already part of the JavaScript bundle.
 */
function companionConfig(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    name: 'nexus-companion-config',
    apply: 'build',
    generateBundle() {
      const clean = (v?: string) => v?.trim().replace(/^["']|["']$/g, '').trim()
      const supabaseUrl = clean(env.VITE_SUPABASE_URL)?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '')
      const anonKey = clean(env.VITE_SUPABASE_ANON_KEY)
      if (!supabaseUrl || !anonKey) return
      this.emitFile({
        type: 'asset',
        fileName: 'nexus-config.json',
        source: JSON.stringify({ supabaseUrl, anonKey }),
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  define: {
    // Shown in the Account app so a deployment can be identified when checking setup.
    __BUILD_COMMIT__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? 'lokaal').slice(0, 7)),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.7.0'),
  },
  plugins: [
    companionConfig(mode),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'NEXUS OS',
        short_name: 'NEXUS',
        description: 'Een modulair, persoonlijk ecosysteem voor web, Windows, Android en smartwatch.',
        lang: 'nl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b1020',
        theme_color: '#0b1020',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
  },
}))
