import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke tests in a real browser (blueprint fase 7): the built app, as a desktop browser and as a
 * phone. Run after `npm run build`: `npm run e2e -w @nexus/web`.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:4180',
    locale: 'nl-BE',
    timezoneId: 'Europe/Brussels',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'mobiel', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite preview --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: !process.env.CI,
  },
})
