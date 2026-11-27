import { defineConfig } from 'vitest/config'

// The two-device sync test (src/sync/twoDevices.supabase.ts) against a local Supabase; CI job "sync".
// Not part of `npm test`: it needs a running stack.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.supabase.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
