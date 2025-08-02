const { chromium } = require('playwright');

async function checkRegisterForm() {
  const browser = await chromium.launch({ 
    headless: true,
    timeout: 60000 
  });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to registration page...');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/register', {
      waitUntil: 'networkidle'
    });

    // Take screenshot of empty form
    await page.screenshot({ path: 'register-form-empty.png' });

    // Check all input fields
    const inputs = await page.locator('input').all();
    console.log(`Found ${inputs.length} input fields:`);
    
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const name = await input.getAttribute('name');
      const type = await input.getAttribute('type');
      const placeholder = await input.getAttribute('placeholder');
      const required = await input.getAttribute('required');
      console.log(`  ${i + 1}. name="${name}" type="${type}" placeholder="${placeholder}" required="${required}"`);
    }

    // Try filling form step by step
    const timestamp = Date.now();
    console.log('\nFilling form step by step...');
    
    // Fill username
    await page.fill('input[name="username"]', `test${timestamp}`);
    await page.waitForTimeout(500);
    
    // Check if button is still disabled
    const button1 = await page.locator('button[type="submit"]').isDisabled();
    console.log('After username - Button disabled:', button1);
    
    // Fill email if present
    try {
      await page.fill('input[name="email"], input[type="email"]', `test${timestamp}@example.com`);
      await page.waitForTimeout(500);
      const button2 = await page.locator('button[type="submit"]').isDisabled();
      console.log('After email - Button disabled:', button2);
    } catch (e) {
      console.log('No email field found');
    }
    
    // Fill password
    await page.fill('input[name="password"]', `Pass${timestamp}!`);
    await page.waitForTimeout(500);
    const button3 = await page.locator('button[type="submit"]').isDisabled();
    console.log('After password - Button disabled:', button3);
    
    // Fill confirm password
    const passwordInputs = await page.locator('input[type="password"]').count();
    if (passwordInputs > 1) {
      await page.locator('input[type="password"]').last().fill(`Pass${timestamp}!`);
      await page.waitForTimeout(500);
      const button4 = await page.locator('button[type="submit"]').isDisabled();
      console.log('After confirm password - Button disabled:', button4);
    }
    
    // Take screenshot of filled form
    await page.screenshot({ path: 'register-form-filled.png' });
    
    // Check for any error messages
    const errors = await page.locator('.error, .text-red-500, [role="alert"]').allTextContents();
    if (errors.length > 0) {
      console.log('\nError messages found:');
      errors.forEach(err => console.log(' -', err));
    }

  } catch (error) {
    console.error('Check failed:', error);
  } finally {
    await browser.close();
  }
}

checkRegisterForm().catch(console.error);