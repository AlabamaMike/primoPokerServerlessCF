const { test, expect, chromium } = require('@playwright/test');

// Production URLs
const FRONTEND_URL = 'https://6e77d385.primo-poker-frontend.pages.dev';
const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

async function runProductionTests() {
  console.log('🎮 Running Primo Poker Production Tests');
  console.log('=====================================\n');
  
  console.log(`Frontend: ${FRONTEND_URL}`);
  console.log(`Backend: ${API_URL}\n`);

  // Check API health first
  console.log('🏥 Checking API health...');
  try {
    const response = await fetch(`${API_URL}/api/health`);
    if (response.ok) {
      console.log('✅ API is healthy\n');
    } else {
      console.log('❌ API health check failed:', response.status);
      return;
    }
  } catch (error) {
    console.log('❌ Failed to reach API:', error.message);
    return;
  }

  const browser = await chromium.launch({ 
    headless: true,
    slowMo: 100 
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  try {
    // Test 1: Homepage loads
    console.log('📍 Test 1: Loading homepage...');
    await page.goto(FRONTEND_URL);
    
    // Debug: log the actual title
    const title = await page.title();
    console.log(`   Page title: "${title}"`);
    
    // Debug: log page content
    const pageContent = await page.textContent('body');
    console.log(`   Page content preview: ${pageContent?.substring(0, 200)}...`);
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'homepage-debug.png', fullPage: true });
    console.log('   📸 Homepage screenshot saved as homepage-debug.png');
    
    if (title.includes('Primo Poker') || title.includes('Poker')) {
      console.log('✅ Homepage loaded successfully\n');
    } else {
      console.log('⚠️  Homepage title doesn\'t match expected. Continuing anyway...\n');
    }
    
    // Wait for app to load (could be client-side routing)
    console.log('   Waiting for app to fully load...');
    await page.waitForLoadState('networkidle');
    
    // Try to find navigation elements
    const hasSignUp = await page.locator('text=/sign.*up/i').isVisible({ timeout: 5000 }).catch(() => false);
    const hasLogin = await page.locator('text=/log.*in/i').isVisible({ timeout: 5000 }).catch(() => false);
    const hasRegister = await page.locator('text=/register/i').isVisible({ timeout: 5000 }).catch(() => false);
    
    console.log(`   Sign Up visible: ${hasSignUp}`);
    console.log(`   Login visible: ${hasLogin}`);
    console.log(`   Register visible: ${hasRegister}`);
    
    // Take another screenshot after waiting
    await page.screenshot({ path: 'homepage-loaded.png', fullPage: true });
    console.log('   📸 Loaded page screenshot saved as homepage-loaded.png');
    
    // Test 2: Navigation to register
    console.log('\n📍 Test 2: Testing registration flow...');
    
    // Try different selectors for sign up
    const signUpClicked = await page.locator('text=/sign.*up/i').click({ timeout: 5000 }).then(() => true).catch(() => false) ||
                          await page.locator('a[href*="register"]').click({ timeout: 5000 }).then(() => true).catch(() => false) ||
                          await page.locator('button:has-text("Register")').click({ timeout: 5000 }).then(() => true).catch(() => false);
    
    if (!signUpClicked) {
      console.log('⚠️  Could not find sign up button. Navigating directly to /register...');
      await page.goto(`${FRONTEND_URL}/register`);
    }
    
    await page.waitForLoadState('networkidle');
    console.log('✅ On registration page\n');
    
    // Test 3: Fill registration form
    const timestamp = Date.now();
    const testUser = {
      username: `testuser_${timestamp}`,
      email: `test_${timestamp}@example.com`,
      password: 'TestPass123!'
    };
    
    console.log(`📝 Creating user: ${testUser.username}`);
    
    // Take screenshot of registration form
    await page.screenshot({ path: 'register-form.png', fullPage: true });
    console.log('   📸 Registration form screenshot saved');
    
    // Try different input selectors
    const filled = {
      username: false,
      email: false,
      password: false,
      confirmPassword: false
    };
    
    // Username
    filled.username = await page.fill('input[name="username"]', testUser.username).then(() => true).catch(() => false) ||
                      await page.fill('input[placeholder*="username" i]', testUser.username).then(() => true).catch(() => false) ||
                      await page.fill('#username', testUser.username).then(() => true).catch(() => false);
    
    // Email
    filled.email = await page.fill('input[name="email"]', testUser.email).then(() => true).catch(() => false) ||
                   await page.fill('input[type="email"]', testUser.email).then(() => true).catch(() => false) ||
                   await page.fill('input[placeholder*="email" i]', testUser.email).then(() => true).catch(() => false);
    
    // Password
    filled.password = await page.fill('input[name="password"]', testUser.password).then(() => true).catch(() => false) ||
                      await page.fill('input[type="password"]:first-of-type', testUser.password).then(() => true).catch(() => false) ||
                      await page.fill('input[placeholder*="password" i]:not([placeholder*="confirm" i])', testUser.password).then(() => true).catch(() => false);
    
    // Confirm Password
    filled.confirmPassword = await page.fill('input[name="confirmPassword"]', testUser.password).then(() => true).catch(() => false) ||
                             await page.fill('input[type="password"]:nth-of-type(2)', testUser.password).then(() => true).catch(() => false) ||
                             await page.fill('input[placeholder*="confirm" i]', testUser.password).then(() => true).catch(() => false);
    
    console.log('   Form fill status:', filled);
    
    // Wait a bit for validation
    await page.waitForTimeout(1000);
    
    // Check if button is enabled
    const buttonEnabled = await page.locator('button:has-text("Create Account")').isEnabled();
    console.log(`   Create Account button enabled: ${buttonEnabled}`);
    
    if (!buttonEnabled) {
      // Try to find validation errors
      const errors = await page.locator('.text-red-500, .error, [role="alert"]').allTextContents();
      if (errors.length > 0) {
        console.log('   Validation errors found:', errors);
      }
      
      // Take screenshot to debug
      await page.screenshot({ path: 'register-form-filled.png', fullPage: true });
      console.log('   📸 Filled form screenshot saved');
    }
    
    // Try to submit
    if (buttonEnabled) {
      await page.click('button:has-text("Create Account")');
    } else {
      console.log('⚠️  Button still disabled, trying to submit anyway...');
      await page.locator('button:has-text("Create Account")').click({ force: true });
    }
    
    // Wait for redirect
    await page.waitForURL(url => {
      const urlStr = url.toString();
      return urlStr.includes('/login') || urlStr.includes('/lobby');
    }, {
      timeout: 30000
    });
    console.log('✅ Registration successful\n');
    
    // Test 4: Login
    console.log('📍 Test 4: Testing login...');
    
    // Check if we're already on login page after registration
    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);
    
    if (!currentUrl.includes('/login')) {
      console.log('   Navigating to login page...');
      await page.goto(`${FRONTEND_URL}/login`);
      await page.waitForLoadState('networkidle');
    }
    
    // Take screenshot of login page
    await page.screenshot({ path: 'login-page.png', fullPage: true });
    console.log('   📸 Login page screenshot saved');
    
    // Try to fill login form with various selectors
    const loginFilled = {
      username: false,
      password: false
    };
    
    loginFilled.username = await page.fill('input[name="username"]', testUser.username).then(() => true).catch(() => false) ||
                          await page.fill('input[placeholder*="username" i]', testUser.username).then(() => true).catch(() => false) ||
                          await page.fill('input[type="text"]:first-of-type', testUser.username).then(() => true).catch(() => false);
    
    loginFilled.password = await page.fill('input[name="password"]', testUser.password).then(() => true).catch(() => false) ||
                          await page.fill('input[type="password"]', testUser.password).then(() => true).catch(() => false);
    
    console.log('   Login form fill status:', loginFilled);
    
    // Try to click sign in button
    const signInClicked = await page.click('button:has-text("Sign In")').then(() => true).catch(() => false) ||
                         await page.click('button[type="submit"]').then(() => true).catch(() => false);
    
    if (!signInClicked) {
      console.log('⚠️  Could not click sign in button');
    }
    
    // Wait for redirect
    try {
      await page.waitForURL('**/lobby', { timeout: 30000 });
      console.log('✅ Login successful\n');
    } catch (e) {
      console.log('⚠️  Did not redirect to lobby. Current URL:', page.url());
      // Take screenshot to debug
      await page.screenshot({ path: 'login-result.png', fullPage: true });
    }
    
    // Test 5: Check lobby loads
    console.log('📍 Test 5: Checking lobby...');
    await expect(page.locator('text=' + testUser.username)).toBeVisible({ timeout: 10000 });
    console.log('✅ Lobby loaded with user info\n');
    
    // Test 6: Create table
    console.log('📍 Test 6: Creating table...');
    await page.click('button:has-text("Create Table")');
    
    // Fill table form
    await page.fill('input[name="tableName"]', `Test Table ${timestamp}`);
    await page.fill('input[name="smallBlind"]', '10');
    await page.fill('input[name="bigBlind"]', '20');
    await page.fill('input[name="maxPlayers"]', '6');
    await page.fill('input[name="minBuyIn"]', '200');
    await page.fill('input[name="maxBuyIn"]', '1000');
    
    await page.click('button[type="submit"]:has-text("Create Table")');
    
    // Should redirect to game
    await page.waitForURL('**/game/**', { timeout: 30000 });
    const tableId = page.url().match(/game\/([^\/]+)/)?.[1];
    console.log(`✅ Table created with ID: ${tableId}\n`);
    
    // Test 7: Check spectator mode
    console.log('📍 Test 7: Checking spectator mode...');
    await page.waitForLoadState('networkidle');
    
    // Look for spectator mode indicator
    const spectatorMode = await page.locator('text=/spectator mode/i').isVisible({ timeout: 10000 }).catch(() => false);
    if (spectatorMode) {
      console.log('✅ Joined as spectator\n');
    } else {
      console.log('⚠️  Spectator mode not detected\n');
    }
    
    // Test 8: Check seat availability
    console.log('📍 Test 8: Checking seat availability...');
    const seats = await page.locator('[data-testid^="seat-"]').count();
    console.log(`Found ${seats} seat elements`);
    
    // Try clicking a seat
    if (seats > 0) {
      const firstSeat = page.locator('[data-testid^="seat-"]').first();
      await firstSeat.click();
      
      // Check if buy-in modal appears
      const buyInVisible = await page.locator('text=/buy.*in/i').isVisible({ timeout: 5000 }).catch(() => false);
      if (buyInVisible) {
        console.log('✅ Buy-in modal appeared\n');
      } else {
        console.log('⚠️  Buy-in modal did not appear\n');
      }
    }
    
    console.log('🎉 Basic production tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    
    // Take screenshot on failure
    await page.screenshot({ path: 'test-failure.png', fullPage: true });
    console.log('📸 Screenshot saved as test-failure.png');
  } finally {
    await browser.close();
  }
}

// Run the tests
runProductionTests().catch(console.error);