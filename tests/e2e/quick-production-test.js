const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to production site
    console.log('Navigating to production site...');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev');
    
    // Take screenshot of homepage
    await page.screenshot({ path: 'production-homepage.png' });
    console.log('Homepage loaded successfully');
    
    // Navigate to login
    console.log('Navigating to login page...');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/login');
    await page.waitForLoadState('networkidle');
    
    // Fill login form
    console.log('Filling login form...');
    await page.fill('input[name="username"]', 'smoketest1754114281188');
    await page.fill('input[name="password"]', 'Test1754114281188!');
    
    // Submit login
    console.log('Submitting login...');
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForNavigation({ timeout: 10000 }).catch(() => {
      console.log('Navigation timeout, checking current page...');
    });
    
    // Check where we are
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    // Take screenshot
    await page.screenshot({ path: 'production-after-login.png' });
    
    // Check if we're logged in
    const welcomeText = await page.textContent('body');
    if (welcomeText.includes('Welcome back, smoketest1754114281188')) {
      console.log('✅ Login successful!');
    } else {
      console.log('❌ Login may have failed');
    }
    
    // Check for demo mode
    if (welcomeText.includes('Demo Mode')) {
      console.log('⚠️  Site is running in demo mode');
    }
    
    if (welcomeText.includes('Connection Error')) {
      console.log('⚠️  WebSocket connection error detected');
    }
    
    // Try to join a table
    console.log('\nAttempting to join a table...');
    const joinButtons = await page.locator('button:has-text("Join Table")').all();
    if (joinButtons.length > 0) {
      console.log(`Found ${joinButtons.length} tables available`);
      await joinButtons[0].click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'production-table-view.png' });
      console.log('Table view screenshot saved');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'production-error.png' });
  } finally {
    await browser.close();
  }
})();