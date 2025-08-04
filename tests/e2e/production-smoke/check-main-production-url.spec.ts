import { test, expect } from '@playwright/test';

test.describe('Check Main Production URL', () => {
  test('Check what is deployed on main production URL', async ({ page }) => {
    console.log('Navigating to main production URL...');
    
    // Go to homepage
    await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
    
    console.log('Page loaded, checking content...');
    
    // Take screenshot
    await page.screenshot({ path: 'main-production-homepage.png', fullPage: true });
    
    // Check if it's the poker app
    const title = await page.title();
    console.log('Page title:', title);
    
    // Check for poker-related content
    const hasPokerContent = await page.locator('text=/poker|play|game/i').count();
    console.log('Poker-related content elements found:', hasPokerContent);
    
    // Check current URL
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    // Check if login page exists
    try {
      await page.goto('/auth/login', { waitUntil: 'networkidle', timeout: 10000 });
      console.log('Login page exists');
      await page.screenshot({ path: 'main-production-login.png', fullPage: true });
    } catch (error) {
      console.log('Could not navigate to login page:', error.message);
    }
  });
});