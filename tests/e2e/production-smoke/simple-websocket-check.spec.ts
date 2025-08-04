import { test, expect } from '@playwright/test';

test.describe('Simple WebSocket Check', () => {
  const TEST_USERNAME = process.env.TEST_USERNAME || 'e2e_test_1754187899779@example.com';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!_1754187899779';

  test('Login and navigate to multiplayer', async ({ page }) => {
    console.log('Starting simple WebSocket check test');
    
    // Login
    await page.goto('/auth/login');
    console.log('Navigated to login page');
    
    await page.fill('input[placeholder="your@email.com"]', TEST_USERNAME);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');
    console.log('Submitted login form');
    
    // Wait for navigation to lobby
    await page.waitForURL('**/lobby/**');
    console.log('Successfully logged in and reached lobby');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    // Check if multiplayer button exists
    const multiplayerButton = page.locator('text=Enter Multiplayer');
    await expect(multiplayerButton).toBeVisible();
    console.log('Enter Multiplayer button is visible');
    
    // Navigate to multiplayer
    await multiplayerButton.click();
    await page.waitForURL('**/multiplayer', { timeout: 15000 });
    console.log('Successfully navigated to multiplayer page');
    
    // Verify we're on the multiplayer page
    await expect(page.locator('h1:has-text("Multiplayer Tables")')).toBeVisible({ timeout: 10000 });
    console.log('✅ Basic navigation test passed!');
  });
});