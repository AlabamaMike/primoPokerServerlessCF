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

  // Run the Tauri app before tests
  webServer: {
    command: 'npm run build && cd src-tauri && cargo build --release',
    port: 1420,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});