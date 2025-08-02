const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

async function testTableListing() {
  console.log('=== TESTING TABLE LISTING API ===\n');
  
  try {
    // Get table list
    console.log('Fetching table list...');
    const response = await fetch(`${API_URL}/api/tables`);
    const data = await response.json();
    
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.data && data.data.length > 0) {
      console.log('\nFirst table structure:');
      const firstTable = data.data[0];
      console.log('Fields present:');
      Object.keys(firstTable).forEach(key => {
        console.log(`  - ${key}: ${typeof firstTable[key]} = ${JSON.stringify(firstTable[key])}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testTableListing();