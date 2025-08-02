const { chromium } = require('playwright');

async function debugTableJoin() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Enable console logging
  page.on('console', msg => {
    console.log(`BROWSER LOG [${msg.type()}]:`, msg.text());
  });
  
  // Enable network request/response logging
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      console.log(`API Response: ${response.url()} - Status: ${response.status()}`);
    }
  });
  
  try {
    // Navigate and login
    console.log('1. Navigating to production site...');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/login');
    
    console.log('2. Logging in...');
    await page.fill('input[name="username"]', 'smoketest1754114281188');
    await page.fill('input[name="password"]', 'Test1754114281188!');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/lobby/**', { timeout: 10000 });
    console.log('3. Successfully logged in and in lobby');
    
    // Check for connection status
    await page.waitForTimeout(2000);
    const pageContent = await page.content();
    const isConnected = !pageContent.includes('Connection Error');
    console.log('4. Connection status:', isConnected ? 'Connected' : 'Not connected');
    
    // Try to create a new table
    console.log('\n5. Attempting to create a table...');
    const createButton = await page.locator('button:has-text("Create Table")').first();
    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForTimeout(2000);
      
      // Fill in table creation form
      const tableNameInput = await page.locator('input[name="name"], input[placeholder*="table name" i]').first();
      if (await tableNameInput.isVisible()) {
        await tableNameInput.fill('Test Debug Table');
        
        // Submit form
        const submitButton = await page.locator('button:has-text("Create"), button[type="submit"]').last();
        await submitButton.click();
        
        console.log('6. Table creation form submitted');
        await page.waitForTimeout(3000);
      }
    }
    
    // Get current page content after action
    const currentUrl = page.url();
    console.log('7. Current URL:', currentUrl);
    
    // Check for any error messages
    const errorElements = await page.locator('[role="alert"], .error-message, .toast-error, [class*="error"]').all();
    for (const element of errorElements) {
      const text = await element.textContent();
      console.log('ERROR FOUND:', text);
    }
    
    // Try to join an existing table
    console.log('\n8. Attempting to join a table...');
    if (currentUrl.includes('/lobby')) {
      const joinButtons = await page.locator('button:has-text("Join Table")').all();
      if (joinButtons.length > 0) {
        console.log(`Found ${joinButtons.length} tables to join`);
        
        // Click the first join button
        await joinButtons[0].click();
        console.log('9. Clicked Join Table button');
        
        // Wait and capture any errors
        await page.waitForTimeout(3000);
        
        // Check for notifications/toasts
        const notifications = await page.locator('.toast, [role="alert"], [class*="notification"]').all();
        for (const notif of notifications) {
          const notifText = await notif.textContent();
          console.log('NOTIFICATION:', notifText);
        }
      }
    }
    
    // Take screenshots
    await page.screenshot({ path: 'debug-table-join-final.png' });
    
    // Check browser console for errors
    const jsErrors = await page.evaluate(() => {
      return window.__errors || [];
    });
    console.log('JavaScript errors:', jsErrors);
    
  } catch (error) {
    console.error('Debug error:', error);
    await page.screenshot({ path: 'debug-table-join-error.png' });
  } finally {
    await browser.close();
  }
}

debugTableJoin();