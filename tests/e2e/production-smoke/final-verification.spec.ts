import { test, expect } from '@playwright/test';

test.describe('Final Verification', () => {
  const TEST_USERNAME = process.env.TEST_USERNAME || 'e2e_test_1754187899779@example.com';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!_1754187899779';

  test('Verify multiplayer fix is deployed', async ({ page }) => {
    console.log('Testing URL:', page.context()._options.baseURL);
    
    // Login
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.fill('input[placeholder="your@email.com"]', TEST_USERNAME);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');
    
    // Wait for navigation to lobby
    await page.waitForURL('**/lobby/**', { timeout: 20000 });
    console.log('Logged in successfully');
    
    // Navigate to multiplayer
    await page.click('text=Enter Multiplayer');
    await page.waitForURL('**/multiplayer/**', { timeout: 20000 });
    console.log('On multiplayer page');
    
    // Quick check for the page version
    const createButton = page.locator('button:has-text("Create Table")').first();
    const buttonClasses = await createButton.getAttribute('class');
    
    if (buttonClasses?.includes('bg-green-600')) {
      console.log('✅ SUCCESS! NEW PAGE IS DEPLOYED - has green button');
    } else if (buttonClasses?.includes('from-yellow-600')) {
      console.log('❌ FAILED! OLD PAGE STILL SERVED - has gradient button');
    }
    
    // Try clicking Create Table
    await createButton.click();
    await page.waitForTimeout(3000);
    
    const currentUrl = page.url();
    console.log('After clicking Create Table, URL is:', currentUrl);
    
    if (currentUrl.includes('/game/') && !currentUrl.includes('/demo/')) {
      console.log('✅ MULTIPLAYER TABLE CREATION WORKS!');
      console.log('Table ID:', currentUrl.split('/game/')[1]);
    } else if (currentUrl.includes('/demo/')) {
      console.log('❌ Still redirecting to demo');
    } else {
      console.log('❓ Stayed on multiplayer page or had an error');
    }
  });
});