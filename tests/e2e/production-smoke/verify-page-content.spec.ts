import { test, expect } from '@playwright/test';

test.describe('Verify Multiplayer Page Content', () => {
  const TEST_USERNAME = process.env.TEST_USERNAME || 'e2e_test_1754187899779@example.com';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!_1754187899779';

  test('Check which multiplayer page is being served', async ({ page }) => {
    // Login
    await page.goto('/auth/login');
    await page.fill('input[placeholder="your@email.com"]', TEST_USERNAME);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');
    
    // Navigate to multiplayer
    await page.waitForURL('**/lobby/**');
    await page.waitForLoadState('networkidle');
    await page.click('text=Enter Multiplayer');
    await page.waitForURL('**/multiplayer/**');
    await page.waitForLoadState('networkidle');
    
    // Check for unique content from each version
    console.log('Checking page content...');
    
    // Check for "Practice Mode" - only in page.old.tsx
    const practiceMode = await page.locator('text=Practice Mode').count();
    console.log('Practice Mode sections found:', practiceMode);
    
    // Check for "Create New Table" heading - only in page.tsx
    const createNewTable = await page.locator('h2:has-text("Create New Table")').count();
    console.log('Create New Table headings found:', createNewTable);
    
    // Check button classes
    const createButton = page.locator('button:has-text("Create Table")').first();
    const buttonClasses = await createButton.getAttribute('class');
    console.log('Create Table button classes:', buttonClasses);
    
    // Check if gradient classes (from old page) or solid green classes (from new page)
    if (buttonClasses?.includes('from-yellow-600')) {
      console.log('❌ OLD PAGE IS BEING SERVED (has gradient button)');
    } else if (buttonClasses?.includes('bg-green-600')) {
      console.log('✅ NEW PAGE IS BEING SERVED (has green button)');
    }
    
    // Take screenshot for visual verification
    await page.screenshot({ path: 'multiplayer-page-content.png', fullPage: true });
    
    // If Practice Mode exists, click it to see what happens
    if (practiceMode > 0) {
      console.log('Found Practice Mode - attempting to click Play Now button');
      const playNowButton = page.locator('text=Practice Mode').locator('..').locator('button:has-text("Play Now")');
      if (await playNowButton.isVisible()) {
        await playNowButton.click();
        await page.waitForTimeout(2000);
        console.log('After clicking Play Now, URL is:', page.url());
      }
    }
  });
});