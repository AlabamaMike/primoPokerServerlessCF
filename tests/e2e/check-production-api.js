const https = require('https');

// Possible production API URLs based on Cloudflare Workers patterns
const possibleUrls = [
  'https://primo-poker-server.workers.dev',
  'https://primo-poker-server.primopoker.workers.dev',
  'https://api.primo-poker.com',
  'https://primo-poker-api.workers.dev'
];

async function checkUrl(url) {
  return new Promise((resolve) => {
    console.log(`Checking ${url}...`);
    
    https.get(`${url}/api/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ ${url} - Status: ${res.statusCode}`);
          console.log(`   Response: ${data}`);
          resolve({ url, success: true, data });
        } else {
          console.log(`❌ ${url} - Status: ${res.statusCode}`);
          resolve({ url, success: false, status: res.statusCode });
        }
      });
    }).on('error', (err) => {
      console.log(`❌ ${url} - Error: ${err.message}`);
      resolve({ url, success: false, error: err.message });
    });
  });
}

async function main() {
  console.log('Searching for production API...\n');
  
  const results = await Promise.all(possibleUrls.map(checkUrl));
  
  const working = results.filter(r => r.success);
  
  if (working.length > 0) {
    console.log('\n✅ Found working API endpoints:');
    working.forEach(r => {
      console.log(`   ${r.url}`);
    });
  } else {
    console.log('\n❌ No working API endpoints found');
    console.log('\nThe backend may not be deployed to production yet.');
    console.log('To deploy the backend:');
    console.log('1. cd apps/poker-server');
    console.log('2. npx wrangler login');
    console.log('3. npm run deploy');
  }
}

main();