const { chromium } = require('playwright');

async function testFreshLogin() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to production site
    console.log('1. Navigating to production site...');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev');
    
    // Clear any existing session
    await context.clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    console.log('2. Cleared existing session');
    
    // Navigate to login
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/login');
    
    // Login with fresh credentials
    console.log('3. Logging in with fresh session...');
    await page.fill('input[name="username"]', 'smoketest1754114281188');
    await page.fill('input[name="password"]', 'Test1754114281188!');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/lobby/**', { timeout: 10000 });
    console.log('4. Successfully logged in');
    
    // Get the new auth token
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'));
    console.log('5. Got new auth token:', authToken ? 'Yes' : 'No');
    
    // Wait for page to stabilize
    await page.waitForTimeout(3000);
    
    // Try to join a table
    console.log('\n6. Attempting to join a table...');
    const joinButtons = await page.locator('button:has-text("Join Table")').all();
    
    if (joinButtons.length > 0) {
      console.log(`Found ${joinButtons.length} tables`);
      
      // Try to join the first table
      await joinButtons[0].click();
      console.log('7. Clicked Join Table');
      
      // Wait and see what happens
      await page.waitForTimeout(5000);
      
      // Check current URL
      const currentUrl = page.url();
      console.log('8. Current URL:', currentUrl);
      
      if (currentUrl.includes('/game/')) {
        console.log('✅ Successfully joined table!');
      } else {
        console.log('❌ Failed to join table');
        
        // Check for any error messages
        const alerts = await page.locator('[role="alert"], .error-message, .toast').all();
        for (const alert of alerts) {
          const text = await alert.textContent();
          console.log('Alert:', text);
        }
      }
    } else {
      console.log('No tables available to join');
    }
    
    // Take screenshot
    await page.screenshot({ path: 'fresh-login-result.png' });
    
  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'fresh-login-error.png' });
  } finally {
    await browser.close();
  }
}

testFreshLogin();