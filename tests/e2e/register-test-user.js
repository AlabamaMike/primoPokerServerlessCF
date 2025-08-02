const { chromium } = require('playwright');
const fs = require('fs').promises;

async function registerTestUser() {
  const timestamp = Date.now();
  const testUsername = `smoketest_${timestamp}`;
  const testPassword = `SmokeTest123!`;
  const testEmail = `smoketest_${timestamp}@example.com`;

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

    // Take screenshot of registration page
    await page.screenshot({ path: 'register-page-before.png' });

    // Fill registration form
    console.log('Filling registration form...');
    
    // Try to fill username
    const usernameInput = page.locator('input[name="username"], input[placeholder*="username" i]').first();
    await usernameInput.fill(testUsername);
    
    // Try to fill email if present
    try {
      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      if (await emailInput.isVisible({ timeout: 2000 })) {
        await emailInput.fill(testEmail);
      }
    } catch (e) {
      console.log('Email field not found, skipping...');
    }
    
    // Fill password
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await passwordInput.fill(testPassword);
    
    // Fill confirm password if present
    try {
      const confirmInput = page.locator('input[name="confirmPassword"], input[type="password"]').last();
      if (await confirmInput.isVisible({ timeout: 2000 })) {
        await confirmInput.fill(testPassword);
      }
    } catch (e) {
      console.log('Confirm password field not found, skipping...');
    }

    // Take screenshot before submission
    await page.screenshot({ path: 'register-page-filled.png' });

    // Submit form
    console.log('Submitting registration...');
    const submitButton = page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Sign up")').first();
    await submitButton.click();

    // Wait for navigation or error
    await page.waitForTimeout(5000);
    
    // Check for errors
    const errorElement = page.locator('[role="alert"], .error-message, .alert-danger, .error');
    const errorText = await errorElement.textContent().catch(() => null);
    
    if (errorText && errorText.trim()) {
      console.error('Registration error:', errorText);
      await page.screenshot({ path: 'register-error.png' });
    }

    // Take final screenshot
    await page.screenshot({ path: 'register-page-after.png' });

    const finalUrl = page.url();
    console.log('Final URL:', finalUrl);

    // Save credentials
    const credentials = {
      username: testUsername,
      password: testPassword,
      email: testEmail,
      timestamp: new Date().toISOString(),
      registrationUrl: finalUrl
    };

    await fs.writeFile(
      'test-credentials.json',
      JSON.stringify(credentials, null, 2)
    );

    console.log('✅ Registration process completed!');
    console.log('Credentials saved to test-credentials.json');
    
    // Keep browser open for 10 seconds to see result
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

registerTestUser().catch(console.error);