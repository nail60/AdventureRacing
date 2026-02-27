import { defineConfig } from '@playwright/test';

const BASE_URL = process.env.BASE_URL;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',

  use: {
    baseURL: BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  // Only start local servers when no BASE_URL is set
  ...(!BASE_URL && {
    webServer: [
      {
        command: 'npm run dev -w server',
        port: 3001,
        cwd: '..',
        reuseExistingServer: true,
        timeout: 30_000,
      },
      {
        command: 'npm run dev -w client',
        port: 5173,
        cwd: '..',
        reuseExistingServer: true,
        timeout: 30_000,
      },
    ],
  }),
});
