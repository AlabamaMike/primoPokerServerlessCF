/**
 * Test player interface for E2E multiplayer tests
 */
export interface TestPlayer {
  /** Player email address */
  email: string;
  /** Player password for authentication */
  password: string;
  /** Player display username */
  username: string;
  /** Player ID (assigned after registration) */
  id?: string;
  /** JWT authentication token */
  token?: string;
}

/**
 * Creates an array of test players with unique credentials
 * @param count Number of test players to create
 * @returns Promise resolving to array of test players
 * @example
 * const players = await setupTestPlayers(6); // Create 6 players for a full table
 */
export async function setupTestPlayers(count: number): Promise<TestPlayer[]> {
  const players: TestPlayer[] = [];
  const timestamp = Date.now();
  
  for (let i = 0; i < count; i++) {
    players.push({
      email: `test_player_${i}_${timestamp}@example.com`,
      password: `TestPass123!_${timestamp}`,
      username: `Player${i + 1}`
    });
  }
  
  return players;
}

/**
 * Cleans up test players after test completion
 * @param players Array of test players to clean up
 * @returns Promise that resolves when cleanup is complete
 * @todo Implement actual cleanup via API if needed
 */
export async function cleanupTestPlayers(players: TestPlayer[]): Promise<void> {
  // Cleanup logic if needed
  // This could involve deleting test accounts via API
  return Promise.resolve();
}