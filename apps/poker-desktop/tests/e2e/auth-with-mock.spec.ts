import { test, expect } from '@playwright/test';

// Use the real test credentials
const TEST_EMAIL = 'e2e_test_1754187899779@example.com';
const TEST_PASSWORD = 'TestPass123!_1754187899779';

test.describe('Authentication with Mocked Connection', () => {
  test('Login flow with mocked backend connection', async ({ page }) => {
    // Override the Tauri commands to simulate connected state
    await page.addInitScript(() => {
      // Mock the Tauri API
      (window as any).__TAURI__ = {
        invoke: async (cmd: string, args: any) => {
          console.log('Mocked Tauri command:', cmd, args);
          
          if (cmd === 'check_backend_connection') {
            return {
              connected: true,
              backend_url: args.apiUrl,
              latency_ms: 50
            };
          }
          
          if (cmd === 'login') {
            // Simulate successful login with test credentials
            if (args.email === 'e2e_test_1754187899779@example.com' && 
                args.password === 'TestPass123!_1754187899779') {
              return {
                user: {
                  id: '67345289-ede5-43c7-baa7-97244348531c',
                  username: 'e2e_test_1754187899779',
                  email: 'e2e_test_1754187899779@example.com',
                  name: 'Test User'
                },
                tokens: {
                  accessToken: 'mock-access-token',
                  refreshToken: 'mock-refresh-token'
                },
                message: 'Login successful'
              };
            } else {
              throw new Error('Invalid credentials');
            }
          }
          
          if (cmd === 'get_auth_token') {
            return null; // Not logged in initially
          }
          
          if (cmd === 'get_user') {
            return null;
          }
          
          if (cmd === 'logout') {
            return {};
          }
          
          if (cmd === 'get_tables') {
            return [
              {
                id: 'table-1',
                name: 'Test Table 1',
                playerCount: 3,
                maxPlayers: 9,
                gamePhase: 'waiting',
                pot: 0,
                blinds: { small: 25, big: 50 }
              },
              {
                id: 'table-2',
                name: 'High Stakes',
                playerCount: 5,
                maxPlayers: 6,
                gamePhase: 'flop',
                pot: 1500,
                blinds: { small: 100, big: 200 }
              }
            ];
          }
          
          throw new Error(`Unknown command: ${cmd}`);
        }
      };
    });
    
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // Should show connected status
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toContainText('Connected', { timeout: 10000 });
    
    // Should show login form
    const loginForm = page.locator('[data-testid="login-form"]');
    await expect(loginForm).toBeVisible({ timeout: 5000 });
    
    // Fill login form
    await page.fill('[data-testid="email"]', TEST_EMAIL);
    await page.fill('[data-testid="password"]', TEST_PASSWORD);
    
    // Submit
    await page.click('[data-testid="login-button"]');
    
    // Should show authenticated content
    const authContent = page.locator('[data-testid="authenticated-content"]');
    await expect(authContent).toBeVisible({ timeout: 10000 });
    
    // Should show play button
    await expect(page.locator('[data-testid="play-button"]')).toBeVisible();
    
    // Navigate to lobby
    await page.click('[data-testid="play-button"]');
    
    // Should show lobby
    const lobby = page.locator('[data-testid="lobby"]');
    await expect(lobby).toBeVisible({ timeout: 10000 });
    
    // Should show tables
    const tablesList = page.locator('[data-testid="tables-list"]');
    await expect(tablesList).toBeVisible();
    
    // Should show both test tables
    await expect(page.locator('text=Test Table 1')).toBeVisible();
    await expect(page.locator('text=High Stakes')).toBeVisible();
    
    // Test logout
    await page.click('[data-testid="logout-button"]');
    await expect(loginForm).toBeVisible({ timeout: 5000 });
    
    console.log('Full authentication flow with mocked backend completed successfully!');
  });
});