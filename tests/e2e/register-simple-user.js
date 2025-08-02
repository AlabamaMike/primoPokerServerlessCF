const { chromium } = require('playwright');
const fs = require('fs').promises;

async function registerSimpleUser() {
  const timestamp = Date.now();
  const testUsername = `test${timestamp}`;
  const testPassword = `pass${timestamp}`;

  console.log('Registering test user...');
  console.log('Username:', testUsername);
  console.log('Password:', testPassword);

  const browser = await chromium.launch({ 
    headless: true,
    timeout: 60000 
  });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to registration page
    console.log('Navigating to registration page...');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/register', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Fill registration form
    console.log('Filling registration form...');
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    
    // Try to fill confirm password if present
    try {
      const confirmInput = page.locator('input[name="confirmPassword"], input[type="password"]').last();
      const passwordInputs = await page.locator('input[type="password"]').count();
      if (passwordInputs > 1) {
        await confirmInput.fill(testPassword);
      }
    } catch (e) {
      console.log('No confirm password field');
    }

    // Submit form
    console.log('Submitting registration...');
    await page.click('button[type="submit"]');

    // Wait for navigation
    await page.waitForTimeout(5000);
    
    const finalUrl = page.url();
    console.log('Final URL:', finalUrl);

    // Save credentials
    const credentials = {
      username: testUsername,
      password: testPassword,
      timestamp: new Date().toISOString()
    };

    await fs.writeFile(
      'simple-test-credentials.json',
      JSON.stringify(credentials, null, 2)
    );

    console.log('✅ Registration completed!');
    
    // Now try to login with these credentials
    console.log('\nTesting login with new credentials...');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/login');
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');
    
    await page.waitForTimeout(5000);
    const loginUrl = page.url();
    console.log('Login URL:', loginUrl);
    
    if (loginUrl.includes('lobby')) {
      console.log('✅ Login successful!');
    } else {
      const error = await page.locator('[role="alert"], .error-message').textContent().catch(() => 'No error message');
      console.log('Login error:', error);
    }

  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

registerSimpleUser().catch(console.error);