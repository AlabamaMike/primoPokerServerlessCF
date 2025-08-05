import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'desktop-app',
      use: {
        ...devices['Desktop Chrome'],
        // Custom test setup for Tauri app
        launchOptions: {
          // These will be configured to launch the Tauri app
        }
      },
    },
  ],

  // Run the Vite dev server for testing
  webServer: {
    command: 'npm run dev:vite',
    port: 1420,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      VITE_TEST_MODE: 'true'
    }
  },
});