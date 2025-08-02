// Decode JWT token to check expiration
function parseJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWT format');
      return null;
    }
    
    // Decode the payload (second part)
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch (error) {
    console.error('Error parsing JWT:', error);
    return null;
  }
}

// Example token from the WebSocket logs
const token = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIyYzBiNzUyMC1jNTY4LTQ5NTQtYjBjMi04ZWFmZjBiNjA0MzciLCJ1c2VybmFtZSI6InNtb2tldGVzdDE3NTQxMTQyODExODgiLCJlbWFpbCI6InNtb2tldGVzdDE3NTQxMTQyODExODhAdGVzdC5jb20iLCJyb2xlcyI6WyJwbGF5ZXIiXSwic2Vzc2lvbklkIjoiODVkYmVlNzQtN2M0Zi00YjM0LTg1MmMtN2JlZTJkMDcxYzNiIiwiaWF0IjoxNzU0MTQ3NDEwLCJleHAiOjE3NTQxNTEwMTB9';

const payload = parseJWT(token);
if (payload) {
  const now = Math.floor(Date.now() / 1000);
  const issued = new Date(payload.iat * 1000);
  const expires = new Date(payload.exp * 1000);
  
  console.log('Token Details:');
  console.log('- User:', payload.username);
  console.log('- Issued at:', issued.toLocaleString());
  console.log('- Expires at:', expires.toLocaleString());
  console.log('- Current time:', new Date().toLocaleString());
  console.log('- Time until expiry:', ((payload.exp - now) / 60).toFixed(1), 'minutes');
  
  if (now > payload.exp) {
    console.log('\n❌ TOKEN HAS EXPIRED!');
    console.log('Expired', ((now - payload.exp) / 60).toFixed(1), 'minutes ago');
  } else {
    console.log('\n✅ Token is still valid');
  }
}