/**
 * Test configuration for multiplayer poker engine tests
 */

export interface TestConfig {
  // API Configuration
  apiUrl: string;
  wsUrl: string;
  
  // Test User Configuration
  testUsers: TestUser[];
  
  // Timing Configuration (in milliseconds)
  timing: {
    actionTimeout: number;      // Max time for a player action
    betweenActions: number;     // Delay between automated actions
    handSettlement: number;     // Time to wait after hand completes
    connectionTimeout: number;  // WebSocket connection timeout
    heartbeatInterval: number;  // WebSocket heartbeat interval
  };
  
  // Logging Configuration
  logging: {
    level: 'minimal' | 'normal' | 'detailed' | 'debug';
    saveHandHistories: boolean;
    screenshotOnError: boolean;
    logWebSocketMessages: boolean;
  };
  
  // Game Configuration
  game: {
    defaultBuyIn: number;
    defaultTableSize: number;
    handsToPlay: number;
  };
}

export interface TestUser {
  email: string;
  password: string;
  username: string;
}

// Production configuration
export const PRODUCTION_CONFIG: TestConfig = {
  apiUrl: 'https://primo-poker-server.alabamamike.workers.dev',
  wsUrl: 'wss://primo-poker-server.alabamamike.workers.dev',
  
  testUsers: [
    { email: 'e2e_test_1754187899779@example.com', password: 'TestPass123!_1754187899779', username: 'e2e_test_1754187899779' },
    { email: 'e2e_test_player2@example.com', password: 'TestPass123!', username: 'TestPlayer2' },
    { email: 'e2e_test_player3@example.com', password: 'TestPass123!', username: 'TestPlayer3' },
    { email: 'e2e_test_player4@example.com', password: 'TestPass123!', username: 'TestPlayer4' },
    { email: 'e2e_test_player5@example.com', password: 'TestPass123!', username: 'TestPlayer5' },
    { email: 'e2e_test_player6@example.com', password: 'TestPass123!', username: 'TestPlayer6' },
    { email: 'e2e_test_player7@example.com', password: 'TestPass123!', username: 'TestPlayer7' },
    { email: 'e2e_test_player8@example.com', password: 'TestPass123!', username: 'TestPlayer8' },
    { email: 'e2e_test_player9@example.com', password: 'TestPass123!', username: 'TestPlayer9' },
  ],
  
  timing: {
    actionTimeout: 5000,      // 5 seconds per action
    betweenActions: 500,      // 500ms between actions
    handSettlement: 2000,     // 2 seconds after hand
    connectionTimeout: 10000, // 10 seconds to connect
    heartbeatInterval: 30000, // 30 seconds heartbeat
  },
  
  logging: {
    level: process.env.TEST_LOG_LEVEL as any || 'normal',
    saveHandHistories: process.env.SAVE_HAND_HISTORIES === 'true' || false,
    screenshotOnError: true,
    logWebSocketMessages: process.env.LOG_WS_MESSAGES === 'true' || false,
  },
  
  game: {
    defaultBuyIn: 1000,
    defaultTableSize: 6,
    handsToPlay: 10, // Enough for full button rotation
  },
};

// Get config based on environment
export function getTestConfig(): TestConfig {
  const env = process.env.TEST_ENV || 'production';
  
  switch (env) {
    case 'production':
      return PRODUCTION_CONFIG;
    default:
      return PRODUCTION_CONFIG;
  }
}

// Helper to create custom config
export function createTestConfig(overrides: Partial<TestConfig>): TestConfig {
  const baseConfig = getTestConfig();
  return {
    ...baseConfig,
    ...overrides,
    timing: {
      ...baseConfig.timing,
      ...(overrides.timing || {}),
    },
    logging: {
      ...baseConfig.logging,
      ...(overrides.logging || {}),
    },
    game: {
      ...baseConfig.game,
      ...(overrides.game || {}),
    },
  };
}