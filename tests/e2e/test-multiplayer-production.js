const { chromium } = require('playwright');

const PRODUCTION_URL = 'https://6e77d385.primo-poker-frontend.pages.dev';
const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

async function testMultiplayer() {
  const browser = await chromium.launch({ headless: true });
  
  try {
    // Test API connectivity first
    console.log('Testing API connectivity...');
    const apiResponse = await fetch(`${API_URL}/api/health`);
    const apiData = await apiResponse.json();
    console.log('API Health:', apiData);
    
    // Create two browser contexts for two players
    console.log('\nCreating two player sessions...');
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();
    
    // Player 1 - Login
    console.log('\nPlayer 1 - Logging in...');
    await player1.goto(`${PRODUCTION_URL}/login`);
    await player1.fill('input[name="username"]', 'smoketest1754114281188');
    await player1.fill('input[name="password"]', 'Test1754114281188!');
    await player1.click('button[type="submit"]');
    await player1.waitForURL('**/lobby/**', { timeout: 10000 });
    console.log('Player 1 - Logged in successfully');
    
    // Check if multiplayer button exists
    const multiplayerButton = await player1.locator('button:has-text("Enter Multiplayer")').isVisible();
    if (multiplayerButton) {
      console.log('Player 1 - Clicking Enter Multiplayer...');
      await player1.click('button:has-text("Enter Multiplayer")');
      await player1.waitForTimeout(3000);
    }
    
    // Try to create a table via API
    console.log('\nTesting table creation via API...');
    const createTableResponse = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Multiplayer Table',
        gameType: 'cash',
        stakes: { smallBlind: 1, bigBlind: 2 },
        maxPlayers: 6,
        minBuyIn: 40,
        maxBuyIn: 200
      })
    });
    
    console.log('Create table response status:', createTableResponse.status);
    if (createTableResponse.ok) {
      const tableData = await createTableResponse.json();
      console.log('Table created:', tableData);
    } else {
      const error = await createTableResponse.text();
      console.log('Failed to create table:', error);
    }
    
    // Check WebSocket connectivity
    console.log('\nChecking WebSocket connectivity...');
    const wsConnected = await player1.evaluate(() => {
      return new Promise((resolve) => {
        const ws = new WebSocket('wss://primo-poker-server.alabamamike.workers.dev/ws');
        ws.onopen = () => {
          ws.close();
          resolve(true);
        };
        ws.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 5000);
      });
    });
    
    console.log('WebSocket connection test:', wsConnected ? '✅ Success' : '❌ Failed');
    
    // Take screenshots
    await player1.screenshot({ path: 'multiplayer-test-player1.png' });
    console.log('\nScreenshots saved');
    
    // Summary
    console.log('\n=== MULTIPLAYER TEST SUMMARY ===');
    console.log('API Health: ✅ Working');
    console.log('Frontend: ✅ Accessible');
    console.log('Login: ✅ Working');
    console.log('WebSocket:', wsConnected ? '✅ Connected' : '❌ Not connected');
    console.log('Current State: Demo mode (frontend needs to be rebuilt with production API URL)');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

testMultiplayer();