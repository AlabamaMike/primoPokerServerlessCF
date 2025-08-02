const { chromium } = require('playwright');

const FRONTEND_URL = 'https://6e77d385.primo-poker-frontend.pages.dev';
const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

// Test user
const TEST_USER = {
  username: 'smoketest1754114281188',
  email: 'smoketest1754114281188@test.com',
  password: 'Test1754114281188!'
};

async function testFullUIFlow() {
  console.log('=== TESTING FULL UI FLOW ===\n');
  
  const browser = await chromium.launch({ 
    headless: true, // Run headless
    slowMo: 500 // Slow down actions slightly
  });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Listen for console messages
    page.on('console', msg => {
      console.log(`Browser console [${msg.type()}]:`, msg.text());
    });
    
    // Listen for page errors
    page.on('pageerror', error => {
      console.log('Page error:', error.message);
    });
    
    // Step 1: Navigate to login page
    console.log('1. Navigating to login page...');
    await page.goto(`${FRONTEND_URL}/auth/login`);
    await page.waitForTimeout(2000);
    
    // Step 2: Fill login form
    console.log('2. Filling login form...');
    // Note: The form says "Email" but backend expects username
    await page.fill('input[type="email"]', TEST_USER.username);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.screenshot({ path: 'login-filled.png' });
    
    // Step 3: Click login button
    console.log('3. Clicking login button...');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(3000);
    
    // Check for error messages
    const errorElement = await page.$('.text-red-500');
    if (errorElement) {
      const errorText = await errorElement.textContent();
      console.log('   Login error:', errorText);
    }
    
    // Step 4: Check if we're in the lobby
    const currentUrl = page.url();
    console.log(`4. Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/lobby')) {
      console.log('   ✅ Successfully logged in and in lobby');
      
      // Step 5: Create a table
      console.log('5. Creating a new table...');
      await page.click('button:has-text("Create Table")');
      await page.waitForTimeout(1000);
      
      // Fill table creation form
      await page.fill('input[placeholder*="Table Name"]', 'Test Table UI');
      await page.click('button:has-text("Create Table")');
      await page.waitForTimeout(2000);
      
      // Step 6: Look for tables
      console.log('6. Looking for tables...');
      const tableRows = await page.$$('.bg-white\\/10');
      console.log(`   Found ${tableRows.length} tables`);
      
      // Step 7: Try to join a table
      if (tableRows.length > 0) {
        console.log('7. Clicking join on first table...');
        const joinButton = await page.$('button:has-text("Join")');
        if (joinButton) {
          await joinButton.click();
          await page.waitForTimeout(2000);
          
          // Check if modal appeared
          const modal = await page.$('[role="dialog"]');
          if (modal) {
            console.log('   ✅ Join modal appeared');
            await page.screenshot({ path: 'join-modal.png' });
            
            // Click join button in modal
            await page.click('button:has-text("Join Table")');
            await page.waitForTimeout(3000);
            
            // Check final URL
            const finalUrl = page.url();
            console.log(`8. Final URL: ${finalUrl}`);
            
            if (finalUrl.includes('/game/')) {
              console.log('   ✅ Successfully joined game!');
              await page.screenshot({ path: 'game-page.png' });
            }
          }
        }
      }
    } else {
      console.log('   ❌ Login failed - not in lobby');
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'final-state.png' });
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

testFullUIFlow();