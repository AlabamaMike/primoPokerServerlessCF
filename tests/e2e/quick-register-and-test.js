const { chromium } = require('playwright');
const fs = require('fs').promises;

async function quickRegisterAndTest() {
  const timestamp = Date.now();
  const testUsername = `player${timestamp}`;
  const testPassword = `pass123`;  // Simple password
  const testEmail = `player${timestamp}@test.com`;

  console.log('Quick Registration and Test');
  console.log('==========================');
  console.log('Username:', testUsername);
  console.log('Password:', testPassword);
  console.log('Email:', testEmail);

  const browser = await chromium.launch({ 
    headless: true,
    timeout: 60000 
  });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // REGISTRATION
    console.log('\n1. REGISTRATION');
    console.log('---------------');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/register');
    
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);
    
    await page.screenshot({ path: 'quick-test-register.png' });
    
    console.log('Submitting registration...');
    await page.click('button[type="submit"]');
    
    // Wait for response
    await page.waitForTimeout(5000);
    
    const regUrl = page.url();
    console.log('URL after registration:', regUrl);
    
    if (regUrl.includes('lobby')) {
      console.log('✅ Registration successful - redirected to lobby');
      
      // Logout first
      const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign out")');
      if (await logoutButton.isVisible()) {
        await logoutButton.click();
        await page.waitForTimeout(2000);
      }
    }

    // LOGIN TEST
    console.log('\n2. LOGIN TEST');
    console.log('-------------');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/login');
    
    console.log('Filling login form...');
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    
    await page.screenshot({ path: 'quick-test-login.png' });
    
    console.log('Submitting login...');
    await page.click('button[type="submit"]');
    
    // Wait for response
    await page.waitForTimeout(5000);
    
    const loginUrl = page.url();
    console.log('URL after login:', loginUrl);
    
    const loginError = await page.locator('[role="alert"], .error-message').textContent().catch(() => null);
    if (loginError) {
      console.log('❌ Login error:', loginError);
    } else if (loginUrl.includes('lobby')) {
      console.log('✅ Login successful - in lobby');
      
      // Take screenshot of lobby
      await page.screenshot({ path: 'quick-test-lobby.png' });
      
      // Save working credentials
      const credentials = {
        username: testUsername,
        password: testPassword,
        email: testEmail,
        timestamp: new Date().toISOString(),
        status: 'WORKING'
      };
      
      await fs.writeFile(
        'working-credentials.json',
        JSON.stringify(credentials, null, 2)
      );
      
      console.log('\n✅ WORKING CREDENTIALS SAVED TO working-credentials.json');
    }
    
    // Close browser after a short delay
    await page.waitForTimeout(2000);

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

quickRegisterAndTest().catch(console.error);