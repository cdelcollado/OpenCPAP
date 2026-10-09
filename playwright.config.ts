import { defineConfig } from '@playwright/test';

// Uses the system Chrome (no browser download). Set PW_CHANNEL= to use Playwright's own Chromium instead.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', channel: process.env.PW_CHANNEL ?? 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build -w @opencpap/web && npm run preview -w @opencpap/web',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
