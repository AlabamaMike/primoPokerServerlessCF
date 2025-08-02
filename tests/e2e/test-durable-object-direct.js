// Test Durable Object directly to see what's happening

async function testDurableObject() {
  console.log('Testing Durable Object endpoints directly...\n');
  
  // First, let's try to create a table with a simple fetch
  const tableId = 'test-' + Date.now();
  
  // This simulates what the API route is trying to do
  console.log('1. Testing if Durable Object responds to /create endpoint...');
  
  // Try different approaches
  const tests = [
    {
      name: 'Direct DO URL (if exposed)',
      url: `https://primo-poker-server.alabamamike.workers.dev/tables/${tableId}/create`,
      method: 'POST',
      body: { config: { name: 'Test' } }
    },
    {
      name: 'API Tables endpoint',
      url: `https://primo-poker-server.alabamamike.workers.dev/api/tables`,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer invalid-but-should-get-past-route'
      },
      body: {
        name: 'Test',
        gameType: 'texas_holdem',
        bettingStructure: 'no_limit',
        gameFormat: 'cash',
        maxPlayers: 6,
        minBuyIn: 40,
        maxBuyIn: 200,
        smallBlind: 1,
        bigBlind: 2
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`\nTesting: ${test.name}`);
    console.log(`URL: ${test.url}`);
    
    try {
      const response = await fetch(test.url, {
        method: test.method,
        headers: {
          'Content-Type': 'application/json',
          ...test.headers
        },
        body: JSON.stringify(test.body)
      });
      
      console.log(`Status: ${response.status} ${response.statusText}`);
      
      const text = await response.text();
      console.log('Response:', text);
      
      // Try to parse as JSON
      try {
        const json = JSON.parse(text);
        console.log('Parsed:', JSON.stringify(json, null, 2));
      } catch (e) {
        // Not JSON
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
  
  console.log('\n2. Checking if this is a deployment/migration issue...');
  console.log('The 404 from the Durable Object suggests:');
  console.log('- The DO is responding (not a binding issue)');
  console.log('- The DO fetch() method is being called');
  console.log('- But the path "/create" is not being matched');
  console.log('\nThis likely means the deployed DO code is older than our local code.');
}

testDurableObject();