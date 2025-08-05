// Manual test script to verify API connectivity
const https = require('https');

const apiUrl = 'https://primo-poker-server.alabamamike.workers.dev';
const testEmail = 'e2e_test_1754187899779@example.com';
const testPassword = 'TestPass123!_1754187899779';

console.log('Testing API connectivity...\n');

// Test 1: Health check
console.log('1. Testing health endpoint...');
https.get(`${apiUrl}/api/health`, (res) => {
  console.log(`   Status: ${res.statusCode}`);
  console.log(`   Headers:`, res.headers);
  
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`   Response:`, JSON.parse(data));
    console.log('\n2. Testing login endpoint...');
    testLogin();
  });
}).on('error', (e) => {
  console.error(`   Error: ${e.message}`);
});

function testLogin() {
  const postData = JSON.stringify({
    username: testEmail,
    password: testPassword
  });

  const options = {
    hostname: 'primo-poker-server.alabamamike.workers.dev',
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': postData.length
    }
  };

  const req = https.request(options, (res) => {
    console.log(`   Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const response = JSON.parse(data);
      console.log(`   Success:`, response.success);
      console.log(`   User:`, response.data?.user?.username);
      console.log(`   Token received:`, !!response.data?.tokens?.accessToken);
    });
  });

  req.on('error', (e) => {
    console.error(`   Error: ${e.message}`);
  });

  req.write(postData);
  req.end();
}