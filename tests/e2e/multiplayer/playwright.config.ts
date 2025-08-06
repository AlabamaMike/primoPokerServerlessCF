/**
 * Playwright configuration for multiplayer poker tests
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  
  // Test timeout (reduced from 5 minutes for better performance)
  timeout: 2 * 60 * 1000, // 2 minutes per test
  
  // Expect timeout
  expect: {
    timeout: 30000,
  },
  
  // Fail on console errors
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Configure projects
  projects: [
    {
      name: 'multiplayer',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  // Reporter configuration
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  // Retry failed tests once
  retries: 1,

  // Run tests in parallel (increased from 1 for better performance)
  workers: process.env.CI ? 2 : 1, // Allow more workers in CI, single for local development
  
  // Global setup/teardown
  globalSetup: require.resolve('./global-setup.ts'),
  globalTeardown: require.resolve('./global-teardown.ts'),
});