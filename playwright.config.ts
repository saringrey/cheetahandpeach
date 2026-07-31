import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5197',
    viewport: { width: 1280, height: 720 },
    // WebGL in headless chromium needs software GL flags on some machines;
    // angle metal works on Apple Silicon.
    launchOptions: {
      args: ['--use-angle=metal', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command:
      'VITE_ENABLE_DEBUG_TOOLS=true npm run dev -- --port 5197 --strictPort',
    url: 'http://localhost:5197',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
