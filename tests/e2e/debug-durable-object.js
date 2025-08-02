// Debug script to test Durable Object directly
async function testDurableObject() {
  const baseUrl = 'https://primo-poker-server.alabamamike.workers.dev';
  
  console.log('Testing Durable Object communication...');
  
  // Step 1: Register a test user
  const testUser = {
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'password123'
  };
  
  try {
    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testUser)
    });
    
    const registerData = await registerResponse.json();
    
    if (!registerData.success) {
      console.error('Registration failed:', registerData.error);
      return;
    }
    
    const accessToken = registerData.data.tokens.accessToken;
    
    // Step 2: Try to create table with minimal config
    const tableConfig = {
      name: 'Debug Test Table',
      gameType: 'texas_holdem',
      bettingStructure: 'no_limit',  
      gameFormat: 'cash',
      maxPlayers: 6,
      minBuyIn: 20,
      maxBuyIn: 200,
      smallBlind: 1,
      bigBlind: 2,
    };
    
    console.log('Creating table...');
    
    const createResponse = await fetch(`${baseUrl}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(tableConfig)
    });
    
    console.log('Create table status:', createResponse.status);
    console.log('Create table headers:', Object.fromEntries(createResponse.headers.entries()));
    const createText = await createResponse.text();
    console.log('Create table response body:', createText);
    
    // Step 3: Test different failure cases to understand the routing
    console.log('\n--- Testing invalid auth ---');
    const invalidAuthResponse = await fetch(`${baseUrl}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid'
      },
      body: JSON.stringify(tableConfig)
    });
    console.log('Invalid auth status:', invalidAuthResponse.status);
    console.log('Invalid auth response:', await invalidAuthResponse.text());
    
    console.log('\n--- Testing no auth ---');
    const noAuthResponse = await fetch(`${baseUrl}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tableConfig)
    });
    console.log('No auth status:', noAuthResponse.status);
    console.log('No auth response:', await noAuthResponse.text());
    
    console.log('\n--- Testing invalid JSON ---');
    const invalidJsonResponse = await fetch(`${baseUrl}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: 'invalid json'
    });
    console.log('Invalid JSON status:', invalidJsonResponse.status);
    console.log('Invalid JSON response:', await invalidJsonResponse.text());
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testDurableObject().catch(console.error);