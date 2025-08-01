#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Setting up Playwright E2E Testing for Primo Poker...\n');

const e2eDir = path.join(__dirname);

try {
  console.log('📦 Installing dependencies...');
  execSync('npm install', { cwd: e2eDir, stdio: 'inherit' });

  console.log('\n🌐 Installing Playwright browsers...');
  execSync('npx playwright install', { cwd: e2eDir, stdio: 'inherit' });

  console.log('\n✅ Setup complete!');
  console.log('\n📋 Available commands:');
  console.log('  npm test              - Run all tests headlessly');
  console.log('  npm run test:headed   - Run tests with browser UI');
  console.log('  npm run test:debug    - Run tests in debug mode');
  console.log('  npm run test:ui       - Open Playwright UI mode');
  console.log('  npm run test:report   - View test report');
  console.log('\n🎯 To run connection debugging tests:');
  console.log('  npx playwright test debug.spec.ts --headed');
  console.log('\n📸 Screenshots and videos will be saved in test-results/');
  
} catch (error) {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
}
