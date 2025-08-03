import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './production-smoke',
  fullyParallel: false,
  forbidOnly: true,
  retries: 2,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report-production' }],
    ['json', { outputFile: 'test-results/production-results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PRODUCTION_URL || 'https://6e77d385.primo-poker-frontend.pages.dev',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 30000,
    headless: true,
    viewport: { width: 1280, height: 720 },
  },

  projects: [
    {
      name: 'chromium-production',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-production',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-production',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome-production',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari-production',
      use: { ...devices['iPhone 12'] },
    },
  ],

  timeout: 5 * 60 * 1000,

  expect: {
    timeout: 10000,
  },
});