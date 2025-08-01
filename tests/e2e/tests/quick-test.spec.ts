import { test, expect } from '@playwright/test';

test.describe('Quick Frontend/Backend Connectivity Test', () => {
  test('should load homepage and check basic connectivity', async ({ page }) => {
    console.log('=== TESTING BASIC CONNECTIVITY ===');
    
    // Go to homepage
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'homepage.png' });
    
    // Get page title and content
    const title = await page.title();
    const content = await page.textContent('body');
    
    console.log('Page title:', title);
    console.log('Page content preview:', content?.substring(0, 200));
    
    // Check if page loaded successfully
    expect(content).toBeTruthy();
    
    // Try to go to register page
    await page.goto('/auth/register');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'register-page.png' });
    
    const registerContent = await page.textContent('body');
    console.log('Register page content:', registerContent?.substring(0, 200));
    
    // Check what elements are available
    const inputElements = await page.$$('input');
    console.log('Number of input elements found:', inputElements.length);
    
    for (let i = 0; i < inputElements.length; i++) {
      const type = await inputElements[i].getAttribute('type');
      const name = await inputElements[i].getAttribute('name');
      const placeholder = await inputElements[i].getAttribute('placeholder');
      console.log(`Input ${i}: type=${type}, name=${name}, placeholder=${placeholder}`);
    }
    
    // Test API endpoints directly
    const apiTests = await page.evaluate(async () => {
      const results: any = {};
      
      try {
        const healthResponse = await fetch('http://localhost:8787/api/health');
        results.health = {
          status: healthResponse.status,
          ok: healthResponse.ok,
          data: await healthResponse.text()
        };
      } catch (error) {
        results.health = { error: (error as Error).message };
      }
      
      return results;
    });
    
    console.log('API test results:', apiTests);
  });
  
  test('should test lobby navigation', async ({ page }) => {
    console.log('=== TESTING LOBBY NAVIGATION ===');
    
    await page.goto('/lobby');
    await page.waitForTimeout(5000);
    
    await page.screenshot({ path: 'lobby-page.png' });
    
    const lobbyContent = await page.textContent('body');
    console.log('Lobby content preview:', lobbyContent?.substring(0, 300));
    
    // Check for expected lobby elements
    const hasCreateTable = lobbyContent?.includes('Create Table');
    const hasJoinTable = lobbyContent?.includes('Join Table');
    const hasDemoMode = lobbyContent?.includes('Demo Mode');
    const hasConnected = lobbyContent?.includes('Connected');
    
    console.log('Lobby features:', {
      hasCreateTable,
      hasJoinTable,
      hasDemoMode,
      hasConnected
    });
  });
});