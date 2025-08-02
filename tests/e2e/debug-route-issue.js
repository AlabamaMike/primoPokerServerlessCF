// Debug script to test the route handling issue
async function testRouteHandling() {
  const baseUrl = 'https://primo-poker-server.alabamamike.workers.dev';
  
  console.log('Testing route handling...');
  
  // Test 1: Health check (should work)
  try {
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    console.log('Health check status:', healthResponse.status);
    console.log('Health check body:', await healthResponse.text());
  } catch (error) {
    console.error('Health check error:', error);
  }
  
  // Test 2: GET /api/tables (should work)
  try {
    const tablesResponse = await fetch(`${baseUrl}/api/tables`);
    console.log('GET /api/tables status:', tablesResponse.status);
    console.log('GET /api/tables body:', await tablesResponse.text());
  } catch (error) {
    console.error('GET /api/tables error:', error);
  }
  
  // Test 3: POST /api/tables without auth (should get 401)
  try {
    const createResponse = await fetch(`${baseUrl}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Table',
        gameType: 'TEXAS_HOLDEM',
        smallBlind: 1,
        bigBlind: 2,
        maxPlayers: 6
      })
    });
    console.log('POST /api/tables (no auth) status:', createResponse.status);
    console.log('POST /api/tables (no auth) body:', await createResponse.text());
  } catch (error) {
    console.error('POST /api/tables (no auth) error:', error);
  }
  
  // Test 4: OPTIONS request
  try {
    const optionsResponse = await fetch(`${baseUrl}/api/tables`, {
      method: 'OPTIONS',
    });
    console.log('OPTIONS /api/tables status:', optionsResponse.status);
    console.log('OPTIONS /api/tables headers:', Object.fromEntries(optionsResponse.headers.entries()));
  } catch (error) {
    console.error('OPTIONS /api/tables error:', error);
  }
}

testRouteHandling().catch(console.error);