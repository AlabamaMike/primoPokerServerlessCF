/**
 * Shared Mock Data Utilities
 * 
 * Centralized mock data structures and utilities
 * to avoid duplication between handlers.ts and api-handlers.ts
 */

// Mock data interfaces
interface MockWallet {
  playerId: string;
  balance: number;
  currency: string;
  frozen: number;
  lastUpdated: string;
}

interface MockProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  level: number;
  experience: number;
  achievements: string[];
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    totalWinnings: number;
  };
  preferences: {
    soundEnabled: boolean;
    autoMuckCards: boolean;
    fourColorDeck: boolean;
  };
}

interface MockTable {
  id: string;
  name: string;
  gameType: string;
  stakes: string;
  players: number;
  maxPlayers: number;
  avgPot: number;
  waitlist: number;
  isPrivate: boolean;
  spectatorCount: number;
}

interface MockChatMessage {
  id: string;
  playerId: string;
  message: string;
  type: string;
  timestamp: string;
  edited: boolean;
  reactions: any[];
}

// Mock data stores
export const mockWallets = new Map<string, MockWallet>();
export const mockChatMessages = new Map<string, MockChatMessage[]>();
export const mockProfiles = new Map<string, MockProfile>();
export const mockFriendships = new Map<string, Set<string>>();
export const mockBlockedUsers = new Map<string, Set<string>>();
export const mockPlayerNotes = new Map<string, Map<string, string>>();
export const mockTables = new Map<string, MockTable>();
export const mockSpectators = new Map<string, Set<string>>();

// Factory functions
export const createMockWallet = (playerId: string, balance = 10000): MockWallet => ({
  playerId,
  balance,
  currency: 'USD',
  frozen: 0,
  lastUpdated: new Date().toISOString()
});

export const createMockProfile = (userId: string, overrides?: Partial<MockProfile>): MockProfile => ({
  id: userId,
  username: `User${userId}`,
  displayName: `Test User ${userId}`,
  avatar: 'default.png',
  level: 1,
  experience: 0,
  achievements: [],
  stats: {
    gamesPlayed: 0,
    gamesWon: 0,
    totalWinnings: 0
  },
  preferences: {
    soundEnabled: true,
    autoMuckCards: false,
    fourColorDeck: true
  },
  ...overrides
});

export const createMockTable = (id: string, overrides?: Partial<MockTable>): MockTable => ({
  id,
  name: `Test Table ${id}`,
  gameType: 'cash',
  stakes: '1/2',
  players: Math.floor(Math.random() * 9),
  maxPlayers: 9,
  avgPot: Math.random() * 200,
  waitlist: 0,
  isPrivate: false,
  spectatorCount: 0,
  ...overrides
});

// Initialize test data
export function initializeTestData() {
  // Create test wallets
  mockWallets.set('test-user-1', createMockWallet('test-user-1'));

  // Create test profiles
  mockProfiles.set('test-user-1', createMockProfile('test-user-1', {
    username: 'TestPlayer1',
    displayName: 'Test Player One',
    avatar: 'avatar1.png',
    level: 5,
    experience: 2500,
    achievements: ['first_win', 'streak_5'],
    stats: {
      gamesPlayed: 100,
      gamesWon: 45,
      totalWinnings: 5000
    }
  }));

  // Create test tables
  for (let i = 1; i <= 5; i++) {
    mockTables.set(`table-${i}`, createMockTable(`${i}`));
  }
}

// Helper functions for tests
export const mockHelpers = {
  // Reset all mock data
  resetMockData() {
    mockWallets.clear();
    mockChatMessages.clear();
    mockProfiles.clear();
    mockFriendships.clear();
    mockBlockedUsers.clear();
    mockPlayerNotes.clear();
    mockTables.clear();
    mockSpectators.clear();
    initializeTestData();
  },

  // Add test user
  addTestUser(userId: string, initialBalance: number = 10000) {
    mockWallets.set(userId, createMockWallet(userId, initialBalance));
    mockProfiles.set(userId, createMockProfile(userId));
  },

  // Simulate wallet transaction
  simulateTransaction(playerId: string, type: string, amount: number) {
    const wallet = mockWallets.get(playerId);
    if (wallet) {
      if (type === 'deposit' || type === 'win') {
        wallet.balance += amount;
      } else if (type === 'withdrawal' || type === 'loss' || type === 'buy_in') {
        wallet.balance -= Math.abs(amount);
      }
      wallet.lastUpdated = new Date().toISOString();
    }
  },

  // Add chat message
  addChatMessage(tableId: string, playerId: string, message: string): MockChatMessage {
    const messages = mockChatMessages.get(tableId) || [];
    const newMessage: MockChatMessage = {
      id: `msg-${Date.now()}`,
      playerId,
      message,
      type: 'text',
      timestamp: new Date().toISOString(),
      edited: false,
      reactions: []
    };
    messages.push(newMessage);
    mockChatMessages.set(tableId, messages);
    return newMessage;
  },

  // Get mock data (for assertions in tests)
  getMockData() {
    return {
      wallets: mockWallets,
      chatMessages: mockChatMessages,
      profiles: mockProfiles,
      friendships: mockFriendships,
      blockedUsers: mockBlockedUsers,
      playerNotes: mockPlayerNotes,
      tables: mockTables,
      spectators: mockSpectators
    };
  }
};