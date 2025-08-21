/**
 * API Mock Handlers - Phase 2
 * 
 * Simple fetch-based API mocking for:
 * - Wallet operations
 * - Chat system
 * - Lobby real-time updates
 * - User profiles and social features
 * - Spectator mode
 */

// Mock data stores
const mockWallets = new Map<string, any>();
const mockChatMessages = new Map<string, any[]>();
const mockProfiles = new Map<string, any>();
const mockFriendships = new Map<string, Set<string>>();
const mockBlockedUsers = new Map<string, Set<string>>();
const mockPlayerNotes = new Map<string, Map<string, string>>();
const mockTables = new Map<string, any>();
const mockSpectators = new Map<string, Set<string>>();

// Initialize test data
function initializeTestData() {
  // Create test wallets
  mockWallets.set('test-user-1', {
    playerId: 'test-user-1',
    balance: 10000,
    currency: 'USD',
    frozen: 0,
    lastUpdated: new Date().toISOString()
  });

  // Create test profiles
  mockProfiles.set('test-user-1', {
    id: 'test-user-1',
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
    },
    preferences: {
      soundEnabled: true,
      autoMuckCards: false,
      fourColorDeck: true
    }
  });

  // Create test tables
  for (let i = 1; i <= 5; i++) {
    mockTables.set(`table-${i}`, {
      id: `table-${i}`,
      name: `Test Table ${i}`,
      gameType: 'cash',
      stakes: '1/2',
      players: Math.floor(Math.random() * 9),
      maxPlayers: 9,
      avgPot: Math.random() * 200,
      waitlist: 0,
      isPrivate: false,
      spectatorCount: 0
    });
  }
}

// Initialize test data
initializeTestData();

// API route handlers
const apiHandlers = {
  // Wallet routes
  '/api/wallet/:playerId/balance': {
    GET: async (params: any) => {
      const wallet = mockWallets.get(params.playerId);
      if (!wallet) {
        return { status: 404, data: { error: 'Wallet not found' } };
      }
      return {
        status: 200,
        data: {
          balance: wallet.balance,
          currency: wallet.currency,
          availableBalance: wallet.balance - wallet.frozen
        }
      };
    }
  },

  '/api/wallet/:playerId/deposit': {
    POST: async (params: any, body: any) => {
      const wallet = mockWallets.get(params.playerId);
      if (!wallet) {
        return { status: 404, data: { error: 'Wallet not found' } };
      }
      if (body.amount <= 0) {
        return { status: 400, data: { error: 'Amount must be positive' } };
      }

      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 500));

      wallet.balance += body.amount;
      wallet.lastUpdated = new Date().toISOString();

      return {
        status: 200,
        data: {
          success: true,
          newBalance: wallet.balance,
          transactionId: `dep-${Date.now()}`
        }
      };
    }
  },

  '/api/wallet/:playerId/withdraw': {
    POST: async (params: any, body: any) => {
      const wallet = mockWallets.get(params.playerId);
      if (!wallet) {
        return { status: 404, data: { error: 'Wallet not found' } };
      }

      const availableBalance = wallet.balance - wallet.frozen;
      if (body.amount > availableBalance) {
        return { status: 400, data: { error: 'Insufficient funds' } };
      }

      wallet.balance -= body.amount;
      wallet.lastUpdated = new Date().toISOString();

      return {
        status: 200,
        data: {
          success: true,
          newBalance: wallet.balance,
          transactionId: `wd-${Date.now()}`
        }
      };
    }
  },

  '/api/wallet/:playerId/transfer': {
    POST: async (params: any, body: any) => {
      const wallet = mockWallets.get(params.playerId);
      if (!wallet) {
        return { status: 404, data: { error: 'Wallet not found' } };
      }

      const availableBalance = wallet.balance - wallet.frozen;
      if (body.amount > availableBalance) {
        return { status: 400, data: { error: 'Insufficient funds' } };
      }

      wallet.frozen += body.amount;
      wallet.lastUpdated = new Date().toISOString();

      return {
        status: 200,
        data: {
          success: true,
          newBalance: wallet.balance,
          transferredAmount: body.amount,
          transactionId: `tr-${Date.now()}`
        }
      };
    }
  },

  '/api/wallet/:playerId/transactions': {
    GET: async (params: any, query: any) => {
      const limit = parseInt(query.limit || '50');
      
      // Mock transaction history
      const transactions = [
        {
          id: 'tx-1',
          type: 'deposit',
          amount: 1000,
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          description: 'Initial deposit'
        },
        {
          id: 'tx-2',
          type: 'buy_in',
          amount: -200,
          tableId: 'table-1',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          description: 'Buy-in to Table 1'
        },
        {
          id: 'tx-3',
          type: 'win',
          amount: 350,
          tableId: 'table-1',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          description: 'Winnings from hand #12345'
        }
      ];

      return {
        status: 200,
        data: {
          transactions: transactions.slice(0, limit),
          nextCursor: transactions.length > limit ? 'next-cursor' : undefined
        }
      };
    }
  },

  // Chat routes
  '/api/chat/:tableId/messages': {
    GET: async (params: any, query: any) => {
      const limit = parseInt(query.limit || '50');
      const messages = mockChatMessages.get(params.tableId) || [];
      
      return {
        status: 200,
        data: {
          messages: messages.slice(-limit),
          hasMore: messages.length > limit
        }
      };
    },
    POST: async (params: any, body: any) => {
      if (!body.message || body.message.trim().length === 0) {
        return { status: 400, data: { error: 'Message cannot be empty' } };
      }

      // Check for spam (simple rate limiting)
      const tableMessages = mockChatMessages.get(params.tableId) || [];
      const recentMessages = tableMessages.filter(m => 
        m.playerId === body.playerId && 
        Date.now() - new Date(m.timestamp).getTime() < 1000
      );

      if (recentMessages.length >= 3) {
        return { status: 429, data: { error: 'Too many messages. Please slow down.' } };
      }

      const newMessage = {
        id: `msg-${Date.now()}`,
        playerId: body.playerId,
        message: body.message,
        type: body.type || 'text',
        timestamp: new Date().toISOString(),
        edited: false,
        reactions: []
      };

      tableMessages.push(newMessage);
      mockChatMessages.set(params.tableId, tableMessages);

      return { status: 200, data: newMessage };
    }
  },

  // Profile routes
  '/api/profiles/:userId': {
    GET: async (params: any) => {
      const profile = mockProfiles.get(params.userId);
      if (!profile) {
        return { status: 404, data: { error: 'Profile not found' } };
      }
      return { status: 200, data: profile };
    },
    PATCH: async (params: any, body: any) => {
      const profile = mockProfiles.get(params.userId);
      if (!profile) {
        return { status: 404, data: { error: 'Profile not found' } };
      }

      Object.assign(profile, body);
      mockProfiles.set(params.userId, profile);

      return { status: 200, data: profile };
    }
  },

  // Social routes
  '/api/friends/add': {
    POST: async (params: any, body: any) => {
      const userFriends = mockFriendships.get(body.userId) || new Set();
      userFriends.add(body.friendId);
      mockFriendships.set(body.userId, userFriends);

      return { status: 200, data: { success: true } };
    }
  },

  '/api/users/block': {
    POST: async (params: any, body: any) => {
      const blockedList = mockBlockedUsers.get(body.userId) || new Set();
      blockedList.add(body.blockedUserId);
      mockBlockedUsers.set(body.userId, blockedList);

      return { status: 200, data: { success: true } };
    }
  },

  // Spectator routes
  '/api/tables/:tableId/spectate': {
    POST: async (params: any, body: any) => {
      const table = mockTables.get(params.tableId);
      if (!table) {
        return { status: 404, data: { error: 'Table not found' } };
      }

      const spectators = mockSpectators.get(params.tableId) || new Set();
      spectators.add(body.userId);
      mockSpectators.set(params.tableId, spectators);

      table.spectatorCount = spectators.size;

      return {
        status: 200,
        data: {
          success: true,
          spectatorCount: spectators.size
        }
      };
    }
  }
};

// Mock fetch implementation
export function setupFetchMock() {
  const originalFetch = global.fetch;

  global.fetch = jest.fn(async (url: string, options: any = {}) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const method = options.method || 'GET';
    
    // Parse URL
    const urlParts = urlStr.split('?');
    const pathname = urlParts[0];
    const queryParams = urlParts[1] ? 
      Object.fromEntries(new URLSearchParams(urlParts[1])) : {};

    // Find matching handler
    for (const [route, handlers] of Object.entries(apiHandlers)) {
      const routePattern = route.replace(/:(\w+)/g, '(?<$1>[^/]+)');
      const regex = new RegExp(`^${routePattern}$`);
      const match = pathname.match(regex);

      if (match && handlers[method]) {
        const params = match.groups || {};
        const body = options.body ? JSON.parse(options.body) : {};
        
        const result = await handlers[method](params, method === 'GET' ? queryParams : body);
        
        return {
          ok: result.status >= 200 && result.status < 300,
          status: result.status,
          statusText: result.status === 200 ? 'OK' : 'Error',
          json: async () => result.data,
          text: async () => JSON.stringify(result.data),
          headers: new Headers({
            'content-type': 'application/json'
          })
        } as Response;
      }
    }

    // Default to original fetch for unmatched routes
    return originalFetch(url, options);
  });

  return () => {
    global.fetch = originalFetch;
  };
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
    mockWallets.set(userId, {
      playerId: userId,
      balance: initialBalance,
      currency: 'USD',
      frozen: 0,
      lastUpdated: new Date().toISOString()
    });

    mockProfiles.set(userId, {
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
      }
    });
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
  addChatMessage(tableId: string, playerId: string, message: string) {
    const messages = mockChatMessages.get(tableId) || [];
    messages.push({
      id: `msg-${Date.now()}`,
      playerId,
      message,
      type: 'text',
      timestamp: new Date().toISOString(),
      edited: false,
      reactions: []
    });
    mockChatMessages.set(tableId, messages);
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