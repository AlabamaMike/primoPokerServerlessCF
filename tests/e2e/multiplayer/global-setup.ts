/**
 * Global setup for multiplayer tests
 */

import { getTestConfig } from './config';
import { ApiClient } from './helpers/api-client';
import { TestLogger } from './helpers/logger';

export default async function globalSetup() {
  console.log('\n🚀 Starting multiplayer test suite setup...\n');
  
  const config = getTestConfig();
  const logger = new TestLogger(config, 'global-setup');
  const apiClient = new ApiClient(config, logger);
  
  // Check API health
  console.log('🏥 Checking API health...');
  const healthy = await apiClient.healthCheck();
  
  if (!healthy) {
    throw new Error('API health check failed. Ensure the server is running.');
  }
  
  console.log('✅ API is healthy');
  
  // Ensure test users exist
  console.log('👥 Setting up test users...');
  
  for (const user of config.testUsers.slice(1)) { // Skip first user as it already exists
    try {
      // Try to register user
      await apiClient.register(user.email, user.username, user.password);
      console.log(`  ✅ Created user: ${user.username}`);
    } catch (error) {
      // User might already exist, try to login
      try {
        await apiClient.login(user.username, user.password);
        console.log(`  ✅ User exists: ${user.username}`);
      } catch (loginError) {
        console.error(`  ❌ Failed to setup user ${user.username}:`, error);
      }
    }
  }
  
  console.log('\n✅ Global setup complete\n');
}