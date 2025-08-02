const { chromium } = require('playwright');
const fs = require('fs').promises;

async function registerCompleteUser() {
  const timestamp = Date.now();
  const testUsername = `smoketest${timestamp}`;
  const testPassword = `Test${timestamp}!`;
  const testEmail = `smoketest${timestamp}@test.com`;

  console.log('Registering complete test user...');
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

    // Navigate to registration page
    console.log('\nNavigating to registration page...');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/register', {
      waitUntil: 'networkidle'
    });

    // Fill all required fields
    console.log('Filling registration form...');
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);

    // Check button state
    const isDisabled = await page.locator('button[type="submit"]').isDisabled();
    console.log('Submit button disabled:', isDisabled);

    // Submit form
    console.log('Submitting registration...');
    await page.click('button[type="submit"]');

    // Wait for navigation
    await page.waitForURL(/\/(lobby|login)/, { timeout: 10000 }).catch(() => {
      console.log('No navigation detected');
    });
    
    const finalUrl = page.url();
    console.log('Final URL after registration:', finalUrl);

    // Check for errors
    const errorText = await page.locator('[role="alert"], .error-message').textContent().catch(() => null);
    if (errorText) {
      console.log('Registration error:', errorText);
    }

    // Save credentials
    const credentials = {
      username: testUsername,
      password: testPassword,
      email: testEmail,
      timestamp: new Date().toISOString()
    };

    await fs.writeFile(
      'valid-test-credentials.json',
      JSON.stringify(credentials, null, 2)
    );

    console.log('\n✅ Registration completed! Credentials saved to valid-test-credentials.json');
    
    // Test login
    console.log('\nTesting login with new credentials...');
    if (!finalUrl.includes('lobby')) {
      await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/login');
    }
    
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');
    
    await page.waitForURL(/\/lobby/, { timeout: 10000 }).catch(() => {
      console.log('Login navigation failed');
    });
    
    const loginUrl = page.url();
    console.log('URL after login:', loginUrl);
    
    if (loginUrl.includes('lobby')) {
      console.log('✅ Login successful! User is in lobby.');
      
      // Take screenshot of lobby
      await page.screenshot({ path: 'lobby-after-login.png' });
    } else {
      const error = await page.locator('[role="alert"], .error-message').textContent().catch(() => 'No error');
      console.log('Login error:', error);
    }

  } catch (error) {
    console.error('Process failed:', error);
  } finally {
    await browser.close();
  }
}

registerCompleteUser().catch(console.error);