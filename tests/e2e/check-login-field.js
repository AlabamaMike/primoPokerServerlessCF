const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

async function checkLogin() {
  // Try with username
  const response1 = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'smoketest1754114281188',
      password: 'Test1754114281188!'
    })
  });
  
  const data1 = await response1.json();
  console.log('Login with username:', data1.success ? 'SUCCESS' : 'FAILED');
  
  // Try with email
  const response2 = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'smoketest1754114281188@test.com',
      password: 'Test1754114281188!'
    })
  });
  
  const data2 = await response2.json();
  console.log('Login with email:', data2.success ? 'SUCCESS' : 'FAILED');
  
  // Try with both
  const response3 = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'smoketest1754114281188',
      email: 'smoketest1754114281188@test.com',
      password: 'Test1754114281188!'
    })
  });
  
  const data3 = await response3.json();
  console.log('Login with both:', data3.success ? 'SUCCESS' : 'FAILED');
}

checkLogin();