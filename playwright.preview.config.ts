import { defineConfig } from '@playwright/test'

/**
 * Production-only smoke configuration.
 *
 * The canonical verifier builds `dist/` before invoking this configuration.
 * A dedicated port and a non-reused server guarantee that this test exercises
 * the freshly built artifact rather than a developer's existing Vite process.
 */
export default defineConfig({
  testDir: './tests/production',
  testMatch: 'production-preview.spec.ts',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5198',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ['--use-angle=metal', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 5198 --strictPort',
    url: 'http://127.0.0.1:5198',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
