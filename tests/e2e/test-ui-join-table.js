const { chromium } = require('playwright');

const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';
const FRONTEND_URL = 'https://6e77d385.primo-poker-frontend.pages.dev';

// Test user
const TEST_USER = {
  username: 'smoketest1754114281188',
  password: 'Test1754114281188!'
};

async function loginUser(username, password) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  if (!data.success) {
    throw new Error(`Failed to login: ${JSON.stringify(data)}`);
  }
  
  return {
    token: data.data.tokens.accessToken,
    userId: data.data.user.id,
    username: data.data.user.username
  };
}

async function testUIJoinTable() {
  console.log('=== TESTING UI JOIN TABLE ===\n');
  
  try {
    // Step 1: Login
    console.log('1. Logging in...');
    const user = await loginUser(TEST_USER.username, TEST_USER.password);
    console.log(`   Logged in as ${user.username} ✅`);

    // Step 2: Create a table via API
    console.log('\n2. Creating table via API...');
    const createResponse = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.token}`
      },
      body: JSON.stringify({
        name: 'UI Test Table',
        gameType: 'texas_holdem',
        bettingStructure: 'no_limit',
        gameFormat: 'cash',
        maxPlayers: 6,
        minBuyIn: 40,
        maxBuyIn: 200,
        smallBlind: 1,
        bigBlind: 2
      })
    });
    
    const createData = await createResponse.json();
    const tableId = createData.data?.tableId || createData.tableId;
    console.log(`   Table created: ${tableId} ✅`);

    // Step 3: Test REST API join directly
    console.log('\n3. Testing REST API join directly...');
    const joinResponse = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.token}`
      },
      body: JSON.stringify({ buyIn: 100 })
    });
    
    const joinData = await joinResponse.json();
    console.log('   Join response:', JSON.stringify(joinData, null, 2));

    // Step 4: Open browser and test UI
    console.log('\n4. Testing UI join...');
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Add console logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('   Browser console error:', msg.text());
      }
    });
    
    // Navigate to lobby
    await page.goto(`${FRONTEND_URL}/lobby`);
    
    // Set auth token
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
    }, user.token);
    
    // Reload to apply token
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Look for the table in the list
    console.log('   Looking for table in lobby...');
    const tableRows = await page.$$('tr');
    console.log(`   Found ${tableRows.length} table rows`);
    
    // Try to find and click join button
    const joinButton = await page.$(`button:has-text("Join")`);
    if (joinButton) {
      console.log('   Found join button, clicking...');
      await joinButton.click();
      await page.waitForTimeout(2000);
      
      // Check if modal appeared
      const modal = await page.$('div[role="dialog"]');
      if (modal) {
        console.log('   Join modal appeared ✅');
        
        // Fill buy-in amount
        const buyInInput = await page.$('input[type="number"]');
        if (buyInInput) {
          await buyInInput.fill('100');
          console.log('   Filled buy-in amount');
        }
        
        // Click join in modal
        const modalJoinButton = await modal.$('button:has-text("Join Table")');
        if (modalJoinButton) {
          console.log('   Clicking modal join button...');
          await modalJoinButton.click();
          await page.waitForTimeout(2000);
        }
      }
    }
    
    // Take screenshot
    await page.screenshot({ path: 'ui-join-test.png' });
    console.log('   Screenshot saved');
    
    // Check current URL
    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/game/')) {
      console.log('   ✅ Successfully navigated to game page');
    } else {
      console.log('   ❌ Still on lobby page');
      
      // Check for error messages
      const errorToast = await page.$('.toast-error');
      if (errorToast) {
        const errorText = await errorToast.textContent();
        console.log(`   Error toast: ${errorText}`);
      }
    }
    
    await browser.close();
    
    // Step 5: Check table state
    console.log('\n5. Checking table state...');
    const stateResponse = await fetch(`${API_URL}/api/tables/${tableId}`, {
      headers: {
        'Authorization': `Bearer ${user.token}`
      }
    });
    
    const stateData = await stateResponse.json();
    if (stateData.success) {
      console.log(`   Players at table: ${stateData.data.playerCount || 0}`);
      console.log(`   Join successful: ${stateData.data.playerCount > 0 ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testUIJoinTable();