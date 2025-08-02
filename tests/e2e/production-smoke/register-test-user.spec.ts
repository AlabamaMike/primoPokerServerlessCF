import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';

// Generate unique test user credentials
const timestamp = Date.now();
const testUsername = `test_user_${timestamp}`;
const testPassword = `TestPass123!_${timestamp}`;
const testEmail = `test_${timestamp}@example.com`;

console.log('Test User Credentials:');
console.log('Username:', testUsername);
console.log('Password:', testPassword);
console.log('Email:', testEmail);

test('Register test user for smoke tests', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to production site
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev');
    
    // Look for registration link/button
    const registerLink = page.locator('a[href*="register"], button:has-text("Register"), a:has-text("Sign up"), button:has-text("Sign up")').first();
    
    if (await registerLink.isVisible({ timeout: 5000 })) {
      await registerLink.click();
    } else {
      // Try direct navigation to register page
      await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/register');
    }

    // Wait for registration form
    await page.waitForLoadState('networkidle');
    
    // Fill registration form
    // Try different possible field selectors
    const usernameSelectors = [
      'input[name="username"]',
      'input[placeholder*="username" i]',
      'input[type="text"]:near(:text("Username"))',
      'input#username'
    ];
    
    const emailSelectors = [
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="email" i]',
      'input:near(:text("Email"))'
    ];
    
    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]:first',
      'input[placeholder*="password" i]:first',
      'input:near(:text("Password")):first'
    ];
    
    const confirmPasswordSelectors = [
      'input[name="confirmPassword"]',
      'input[name="password_confirmation"]',
      'input[type="password"]:last',
      'input[placeholder*="confirm" i]',
      'input:near(:text("Confirm")):last'
    ];

    // Fill username
    let filled = false;
    for (const selector of usernameSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.isVisible({ timeout: 1000 })) {
          await input.fill(testUsername);
          filled = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!filled) {
      throw new Error('Could not find username input field');
    }

    // Fill email if present
    for (const selector of emailSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.isVisible({ timeout: 1000 })) {
          await input.fill(testEmail);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // Fill password
    filled = false;
    for (const selector of passwordSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.isVisible({ timeout: 1000 })) {
          await input.fill(testPassword);
          filled = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!filled) {
      throw new Error('Could not find password input field');
    }

    // Fill confirm password if present
    for (const selector of confirmPasswordSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.isVisible({ timeout: 1000 })) {
          await input.fill(testPassword);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // Submit registration
    const submitButton = page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Sign up"), button:has-text("Create account")').first();
    await submitButton.click();

    // Wait for registration to complete
    await page.waitForURL(/\/(lobby|dashboard|home|login)/, { timeout: 10000 }).catch(() => {
      console.log('Registration might have failed or redirected to unexpected page');
    });

    // Check for success indicators
    const currentUrl = page.url();
    const errorMessage = await page.locator('[role="alert"], .error-message, .alert-danger').textContent().catch(() => null);
    
    if (errorMessage) {
      console.error('Registration error:', errorMessage);
      throw new Error(`Registration failed: ${errorMessage}`);
    }

    // Save credentials to file
    const fs = require('fs').promises;
    const credentials = {
      username: testUsername,
      password: testPassword,
      email: testEmail,
      timestamp: new Date().toISOString()
    };
    
    await fs.writeFile(
      'test-credentials.json',
      JSON.stringify(credentials, null, 2)
    );
    
    console.log('✅ Test user registered successfully!');
    console.log('Credentials saved to test-credentials.json');
    console.log('Final URL:', currentUrl);

    // Take screenshot of successful registration
    await page.screenshot({ 
      path: 'registration-success.png',
      fullPage: true 
    });

  } finally {
    await browser.close();
  }
});