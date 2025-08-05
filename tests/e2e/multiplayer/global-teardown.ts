/**
 * Global teardown for multiplayer tests
 */

export default async function globalTeardown() {
  console.log('\n🧹 Running global teardown...');
  
  // Any cleanup needed after all tests
  // For now, we'll just log completion
  
  console.log('✅ Global teardown complete\n');
}