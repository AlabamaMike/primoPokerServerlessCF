import { test, expect } from '@playwright/test';

test.describe('Auth Fix Test', () => {
  test('Test login with email as username', async ({ page }) => {
    const testEmail = 'e2e_test_1754187899779@example.com';
    const testPassword = 'TestPass123!_1754187899779';
    
    console.log('Testing login with email as username...');
    
    // Go to the /auth/login page
    await page.goto('/auth/login');
    await page.screenshot({ path: 'test-results/auth-login-page.png' });
    
    // Try logging in with email in email field
    await page.fill('input[placeholder="your@email.com"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    
    // Click Sign In
    await page.click('button:has-text("Sign In")');
    
    // Wait for either success or error
    const result = await Promise.race([
      page.waitForURL(/\/multiplayer/, { timeout: 10000 }).then(() => 'success'),
      page.locator('text=/error|failed/i').waitFor({ timeout: 5000 }).then(() => 'error'),
      page.waitForTimeout(5000).then(() => 'timeout')
    ]);
    
    await page.screenshot({ path: 'test-results/auth-result.png' });
    
    if (result === 'success') {
      console.log('✅ Login successful with email as username!');
    } else {
      console.log('❌ Login failed');
      const errorText = await page.locator('text=/error|failed/i').first().textContent().catch(() => 'No error text found');
      console.log('Error:', errorText);
      
      // Now let's check if there's a username for this user by trying the old login page
      console.log('\nTrying /login page to see error message...');
      await page.goto('/login');
      await page.fill('input[placeholder*="username" i]', testEmail);
      await page.fill('input[type="password"]', testPassword);
      await page.click('button:has-text("Sign In")');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/login-page-result.png' });
    }
  });
});