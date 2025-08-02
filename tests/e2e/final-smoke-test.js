const { chromium } = require('playwright');
const fs = require('fs').promises;

async function finalSmokeTest() {
  const timestamp = Date.now();
  const testEmail = `smoketest${timestamp}@example.com`;
  const testPassword = `Test${timestamp}!`;
  const testUsername = `smoketest${timestamp}`;

  console.log('=== PRIMO POKER PRODUCTION SMOKE TEST ===');
  console.log('Email:', testEmail);
  console.log('Password:', testPassword);
  console.log('Username:', testUsername);

  const browser = await chromium.launch({ 
    headless: true,
    timeout: 60000 
  });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. REGISTRATION
    console.log('\n1. REGISTRATION TEST');
    console.log('-------------------');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/register');
    await page.waitForLoadState('networkidle');
    
    // Fill registration form
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);
    
    console.log('Submitting registration...');
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForURL(/\/(lobby|login)/, { timeout: 10000 }).catch(() => {});
    
    const regUrl = page.url();
    console.log('URL after registration:', regUrl);
    
    if (regUrl.includes('lobby')) {
      console.log('✅ Registration successful - Auto-logged into lobby');
      await page.screenshot({ path: 'smoke-test-lobby-after-reg.png' });
    } else if (regUrl.includes('login')) {
      console.log('Registration complete - Redirected to login');
    }

    // 2. LOGIN TEST (if needed)
    if (!regUrl.includes('lobby')) {
      console.log('\n2. LOGIN TEST');
      console.log('-------------');
      
      // The login form uses email, not username
      await page.fill('input[name="email"], input[type="email"]', testEmail);
      await page.fill('input[name="password"], input[type="password"]', testPassword);
      
      console.log('Submitting login...');
      await page.click('button[type="submit"]');
      
      await page.waitForURL(/\/lobby/, { timeout: 10000 });
      console.log('✅ Login successful - In lobby');
    }

    // 3. LOBBY TEST
    console.log('\n3. LOBBY TEST');
    console.log('-------------');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'smoke-test-lobby.png' });
    
    // Check for tables
    const tables = await page.locator('table, [data-testid*="table"], .table-row').count();
    console.log('Number of table elements found:', tables);
    
    // Check user info
    const userInfo = await page.locator('[data-testid*="user"], .user-info, .username').first().textContent().catch(() => 'Not found');
    console.log('User info:', userInfo);
    
    // Check balance
    const balance = await page.locator('[data-testid*="balance"], .balance, .chips').first().textContent().catch(() => 'Not found');
    console.log('Balance:', balance);

    // 4. TABLE CREATION TEST
    console.log('\n4. TABLE CREATION TEST');
    console.log('---------------------');
    
    // Look for create table button
    const createButton = page.locator('button:has-text("Create"), button:has-text("New Table"), a:has-text("Create")').first();
    if (await createButton.isVisible()) {
      console.log('Found create table button');
      await createButton.click();
      await page.waitForTimeout(3000);
      
      const createUrl = page.url();
      console.log('URL after clicking create:', createUrl);
      
      if (createUrl.includes('create') || page.url() !== regUrl) {
        console.log('✅ Navigated to table creation');
        await page.screenshot({ path: 'smoke-test-create-table.png' });
      }
    }

    // 5. JOIN TABLE TEST
    console.log('\n5. JOIN TABLE TEST');
    console.log('-----------------');
    
    // Go back to lobby if needed
    if (!page.url().includes('lobby')) {
      await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/lobby');
      await page.waitForLoadState('networkidle');
    }
    
    // Try to find and click a table
    const tableLink = page.locator('a[href*="/table/"], tr[onclick], .table-row').first();
    if (await tableLink.isVisible()) {
      console.log('Found table to join');
      await tableLink.click();
      await page.waitForTimeout(3000);
      
      const tableUrl = page.url();
      console.log('URL after clicking table:', tableUrl);
      
      if (tableUrl.includes('/table/') || tableUrl.includes('/game/')) {
        console.log('✅ Navigated to table/game');
        await page.screenshot({ path: 'smoke-test-table.png' });
      }
    }

    // Save test results
    const results = {
      timestamp: new Date().toISOString(),
      credentials: {
        email: testEmail,
        password: testPassword,
        username: testUsername
      },
      tests: {
        registration: regUrl.includes('lobby') || regUrl.includes('login'),
        login: page.url().includes('lobby'),
        lobby: tables > 0,
        tableCreation: page.url().includes('create'),
        tableJoin: page.url().includes('/table/') || page.url().includes('/game/')
      },
      finalUrl: page.url()
    };
    
    await fs.writeFile(
      'smoke-test-results.json',
      JSON.stringify(results, null, 2)
    );
    
    console.log('\n=== SMOKE TEST SUMMARY ===');
    console.log('Registration:', results.tests.registration ? '✅' : '❌');
    console.log('Login:', results.tests.login ? '✅' : '❌');
    console.log('Lobby:', results.tests.lobby ? '✅' : '❌');
    console.log('Table Creation:', results.tests.tableCreation ? '✅' : '❌');
    console.log('Table Join:', results.tests.tableJoin ? '✅' : '❌');
    console.log('\nResults saved to smoke-test-results.json');

  } catch (error) {
    console.error('Smoke test failed:', error);
    await page.screenshot({ path: 'smoke-test-error.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
}

finalSmokeTest().catch(console.error);