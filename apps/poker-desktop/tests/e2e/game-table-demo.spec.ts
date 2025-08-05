import { test, expect } from '@playwright/test';

test.describe('Game Table Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // Mock Tauri commands for authentication
    await page.addInitScript(() => {
      const mockTauri = {
        invoke: async (cmd: string, args: any) => {
          console.log(`[Mock Tauri] Command: ${cmd}`, args);
          
          switch (cmd) {
            case 'check_backend_connection':
              return {
                connected: true,
                backend_url: 'https://primo-poker-server.alabamamike.workers.dev',
                latency_ms: 150
              };
              
            case 'get_auth_token':
              return null;
              
            case 'get_user':
              return null;
              
            case 'login':
              if (args.email === 'test@example.com' && args.password === 'password') {
                return {
                  user: {
                    id: 'user-123',
                    username: 'testuser',
                    email: 'test@example.com',
                    name: 'Test User'
                  },
                  tokens: {
                    accessToken: 'mock-token',
                    refreshToken: 'mock-refresh'
                  },
                  message: 'Login successful'
                };
              }
              throw new Error('Invalid credentials');
              
            default:
              throw new Error(`Unknown Tauri command: ${cmd}`);
          }
        }
      };
      
      (window as any).__TAURI__ = mockTauri;
    });
  });

  test('should access game table demo', async ({ page }) => {
    // Login first
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    // Should see authenticated content
    await expect(page.locator('[data-testid="authenticated-content"]')).toBeVisible();

    // Click demo button
    await page.click('[data-testid="demo-button"]');

    // Should see demo page with poker table
    await expect(page.locator('text=🃏 Poker Table Demo')).toBeVisible();
    await expect(page.locator('[data-testid="poker-table"]')).toBeVisible();
  });

  test('should display demo controls', async ({ page }) => {
    // Navigate to demo
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    await page.click('[data-testid="demo-button"]');

    // Check demo controls are present
    await expect(page.locator('text=View as:')).toBeVisible();
    await expect(page.locator('button:has-text("Auto Progress")')).toBeVisible();
    await expect(page.locator('button:has-text("Reset Hand")')).toBeVisible();
    
    // Should show current phase and hand number
    await expect(page.locator('text=Phase:')).toBeVisible();
    await expect(page.locator('text=Hand:')).toBeVisible();
  });

  test('should display player information', async ({ page }) => {
    // Navigate to demo
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    await page.click('[data-testid="demo-button"]');

    // Should show players at table section
    await expect(page.locator('text=Players at Table:')).toBeVisible();
    
    // Should show player names
    await expect(page.locator('text=Alice')).toBeVisible();
    await expect(page.locator('text=Bob')).toBeVisible();
    await expect(page.locator('text=Charlie')).toBeVisible();
    
    // Should show chip counts
    await expect(page.locator('text=Chips:')).toHaveCount(5); // 5 players
    
    // Should show bet amounts
    await expect(page.locator('text=Bet:')).toHaveCount(5);
  });

  test('should allow switching player view', async ({ page }) => {
    // Navigate to demo
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    await page.click('[data-testid="demo-button"]');

    // Find the "View as" dropdown
    const viewAsSelect = page.locator('select').first();
    await expect(viewAsSelect).toBeVisible();
    
    // Should have player options
    await expect(viewAsSelect.locator('option')).toHaveCount(5); // 5 players
    
    // Switch to different player
    await viewAsSelect.selectOption('player-2');
    
    // The player info should update (player-2 should be highlighted)
    const bobPlayerCard = page.locator('text=Bob').locator('..').first();
    await expect(bobPlayerCard).toHaveClass(/bg-blue-600/);
  });

  test('should handle auto progress', async ({ page }) => {
    // Navigate to demo
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    await page.click('[data-testid="demo-button"]');

    // Start auto progress
    const autoButton = page.locator('button:has-text("Auto Progress")');
    await autoButton.click();
    
    // Button text should change
    await expect(page.locator('button:has-text("Stop Auto")')).toBeVisible();
    
    // Wait a bit and check that phase might change
    await page.waitForTimeout(4000);
    
    // Stop auto progress
    await page.locator('button:has-text("Stop Auto")').click();
    await expect(page.locator('button:has-text("Auto Progress")')).toBeVisible();
  });

  test('should handle reset hand', async ({ page }) => {
    // Navigate to demo
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    await page.click('[data-testid="demo-button"]');

    // Get initial hand number
    const initialHandText = await page.locator('text=Hand:').textContent();
    
    // Click reset
    await page.click('button:has-text("Reset Hand")');
    
    // Hand number should increment
    const newHandText = await page.locator('text=Hand:').textContent();
    expect(newHandText).not.toBe(initialHandText);
  });

  test('should navigate back to main menu', async ({ page }) => {
    // Navigate to demo
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    await page.click('[data-testid="demo-button"]');

    // Should be in demo
    await expect(page.locator('text=🃏 Poker Table Demo')).toBeVisible();
    
    // Click back button
    await page.click('button:has-text("← Back to Main Menu")');
    
    // Should be back at main menu
    await expect(page.locator('[data-testid="authenticated-content"]')).toBeVisible();
    await expect(page.locator('[data-testid="demo-button"]')).toBeVisible();
    await expect(page.locator('text=🃏 Poker Table Demo')).not.toBeVisible();
  });
});