export interface TestPlayer {
  email: string;
  password: string;
  username: string;
  id?: string;
  token?: string;
}

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

export async function cleanupTestPlayers(players: TestPlayer[]): Promise<void> {
  // Cleanup logic if needed
  // This could involve deleting test accounts via API
  return Promise.resolve();
}