const { chromium } = require('playwright');

async function debugLogin() {
  const browser = await chromium.launch({ 
    headless: false,
    timeout: 60000 
  });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to login page...');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/login', {
      waitUntil: 'networkidle'
    });

    // Try with the registered user
    console.log('Filling login form...');
    await page.fill('input[name="username"]', 'smoketest_1754113783741');
    await page.fill('input[name="password"]', 'SmokeTest123!');
    
    // Take screenshot before submission
    await page.screenshot({ path: 'debug-login-before.png' });
    
    console.log('Submitting login...');
    await page.click('button[type="submit"]');
    
    // Wait for response
    await page.waitForTimeout(5000);
    
    // Take screenshot after submission
    await page.screenshot({ path: 'debug-login-after.png' });
    
    const url = page.url();
    console.log('Current URL:', url);
    
    const errorText = await page.locator('.error-message, [role="alert"]').textContent().catch(() => null);
    if (errorText) {
      console.log('Error:', errorText);
    }
    
    // Keep browser open
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('Debug failed:', error);
  } finally {
    await browser.close();
  }
}

debugLogin().catch(console.error);