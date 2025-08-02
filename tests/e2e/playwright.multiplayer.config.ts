import { defineConfig, devices } from '@playwright/test';

/**
 * Focused Playwright configuration for comprehensive multiplayer testing
 * Using only Chromium for thorough end-to-end testing
 */
export default defineConfig({
  testDir: './tests',
  
  /* Focus on comprehensive testing rather than parallel execution */
  fullyParallel: false,
  workers: 1,
  
  /* Retry failed tests */
  retries: 2,
  
  /* Extended timeouts for complex multiplayer interactions */
  timeout: 120000, // 2 minutes per test
  
  /* Reporter configuration */
  reporter: [
    ['html', { outputFolder: 'playwright-report-multiplayer' }],
    ['json', { outputFile: 'multiplayer-test-results.json' }],
    ['list'] // For real-time console output
  ],
  
  /* Test configuration */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    
    /* Extended timeouts for WebSocket connections and multiplayer interactions */
    actionTimeout: 15000,
    navigationTimeout: 30000,
    
    /* Always collect trace for debugging */
    trace: 'on',
    
    /* Always take screenshots */
    screenshot: 'on',
    
    /* Record video for all tests */
    video: 'on',
    
    /* Collect console logs */
    launchOptions: {
      slowMo: 500, // Slow down actions for better debugging
    }
  },

  /* Focus on Chromium for comprehensive testing */
  projects: [
    {
      name: 'chromium-multiplayer',
      use: { 
        ...devices['Desktop Chrome']
      },
      testMatch: ['**/comprehensive-multiplayer.spec.ts', '**/debug-api-connection.spec.ts', '**/test-join-table.spec.ts', '**/quick-websocket-test.spec.ts']
    }
  ],

  /* Start both backend and frontend servers */
  webServer: [
    {
      command: 'npm run dev',
      port: 8787,
      cwd: '../../',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        NODE_ENV: 'test',
      }
    },
    {
      command: 'npm run dev',
      port: 3000,
      cwd: '../../apps/poker-frontend',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        NODE_ENV: 'test',
        NEXT_PUBLIC_API_URL: 'http://localhost:8787',
        NEXT_PUBLIC_WS_URL: 'ws://localhost:8787',
      }
    }
  ],
});