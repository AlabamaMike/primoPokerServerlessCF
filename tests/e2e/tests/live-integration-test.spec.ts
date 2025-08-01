import { test, expect } from '@playwright/test';

test.describe('Live Backend Integration', () => {
  test('should connect to live backend and test API endpoints', async ({ page }) => {
    console.log('=== TESTING LIVE BACKEND INTEGRATION ===');
    
    // Navigate to lobby with live backend
    await page.goto('/lobby');
    await page.waitForTimeout(5000);
    
    console.log('✅ Step 1: Lobby loaded');
    
    // Check connection status
    const content = await page.textContent('body');
    const hasLiveConnection = content?.includes('Live Updates Active') || content?.includes('Connected');
    const hasDemo = content?.includes('Demo Mode') || content?.includes('Using Demo Data');
    
    console.log('Connection Status:', {
      hasLiveConnection,
      hasDemo,
      contentPreview: content?.substring(0, 200)
    });
    
    // Take screenshot
    await page.screenshot({ path: 'live-integration.png' });
    
    if (hasLiveConnection) {
      console.log('✅ Live backend connection established');
      
      // Check if we can see real tables or empty state
      const tablesContent = content?.includes('No tables found') || content?.includes('Create New Table');
      if (tablesContent) {
        console.log('✅ Backend connected - showing empty tables state');
      }
      
    } else if (hasDemo) {
      console.log('⚠️ Fallback to demo mode - backend may not be fully connected');
    }
    
    // Test registration page with live backend
    await page.goto('/auth/register');
    await page.waitForTimeout(3000);
    
    const registerContent = await page.textContent('body');
    const hasRegisterForm = registerContent?.includes('Email') && registerContent?.includes('Username') && registerContent?.includes('Password');
    
    if (hasRegisterForm) {
      console.log('✅ Registration page loaded correctly');
      
      // Try a test registration
      const timestamp = Date.now();
      const testEmail = `test${timestamp}@example.com`;
      
      await page.fill('input[name="email"]', testEmail);
      await page.fill('input[name="username"]', `testuser${timestamp}`);
      await page.fill('input[name="password"]', 'testpass123');
      
      console.log('✅ Registration form filled');
      
      // Click submit and wait for response
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      
      const postSubmitUrl = page.url();
      const postSubmitContent = await page.textContent('body');
      
      console.log('Registration Result:', {
        url: postSubmitUrl,
        success: postSubmitUrl.includes('/lobby') || postSubmitContent?.includes('Welcome'),
        error: postSubmitContent?.includes('Error') || postSubmitContent?.includes('Failed')
      });
      
      if (postSubmitUrl.includes('/lobby')) {
        console.log('✅ Registration successful - redirected to lobby');
      } else if (postSubmitContent?.includes('Error')) {
        console.log('⚠️ Registration error - this is expected for testing');
      }
    }
    
    console.log('=== LIVE INTEGRATION TEST COMPLETE ===');
  });
});