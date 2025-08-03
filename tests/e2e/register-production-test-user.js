const fetch = require('node-fetch');

async function registerTestUser() {
  const timestamp = Date.now();
  const username = `e2e_test_${timestamp}`;
  const password = `TestPass123!_${timestamp}`;
  const email = `e2e_test_${timestamp}@example.com`;
  
  console.log('Registering test user...');
  console.log('Username:', username);
  console.log('Password:', password);
  console.log('Email:', email);
  
  try {
    const response = await fetch('https://primo-poker-server.alabamamike.workers.dev/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        email,
        password
      })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('\n✅ Test user registered successfully!');
      console.log('\nAdd these to your environment or .env.test file:');
      console.log(`TEST_USERNAME=${username}`);
      console.log(`TEST_PASSWORD=${password}`);
      console.log(`TEST_EMAIL=${email}`);
      
      // Write to a credentials file
      const fs = require('fs');
      const credentials = {
        username,
        password,
        email,
        createdAt: new Date().toISOString()
      };
      
      fs.writeFileSync('test-credentials.json', JSON.stringify(credentials, null, 2));
      console.log('\nCredentials saved to test-credentials.json');
      
      return credentials;
    } else {
      console.error('❌ Registration failed:', result);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

registerTestUser().then(creds => {
  console.log('\nYou can now run E2E tests with:');
  console.log(`TEST_USERNAME="${creds.username}" TEST_PASSWORD="${creds.password}" npm test`);
});