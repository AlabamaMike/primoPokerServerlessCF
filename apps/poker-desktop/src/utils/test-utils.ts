import { invoke } from '@tauri-apps/api/tauri';

const IS_TEST_MODE = import.meta.env.VITE_TEST_MODE === 'true';

// Mock data for testing
const mockUser = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  name: 'Test User'
};

const mockAuthToken = {
  access_token: 'mock-jwt-token-for-websocket'
};

const mockTables = [
  {
    id: 'table-123',
    name: 'WebSocket Test Table',
    playerCount: 2,
    maxPlayers: 9,
    gamePhase: 'pre_flop',
    pot: 0,
    blinds: { small: 10, big: 20 }
  }
];

export async function testSafeInvoke<T>(command: string, args?: any): Promise<T> {
  if (!IS_TEST_MODE) {
    return invoke<T>(command, args);
  }

  // Mock responses for test mode
  console.log(`[Test Mode] Mock invoke: ${command}`, args);
  
  switch (command) {
    case 'check_backend_connection':
      return {
        connected: true,
        backend_url: 'https://primo-poker-server.alabamamike.workers.dev',
        latency_ms: 100
      } as T;
      
    case 'get_auth_token':
      return mockAuthToken as T;
      
    case 'get_user':
      return mockUser as T;
      
    case 'login':
      if (args.email === 'test@example.com' && args.password === 'password') {
        return {
          user: mockUser,
          tokens: {
            accessToken: 'mock-jwt-token-for-websocket',
            refreshToken: 'mock-refresh-token'
          },
          message: 'Login successful'
        } as T;
      }
      throw new Error('Invalid credentials');
      
    case 'get_tables':
      // Return more detailed table data for lobby v2
      return [
        {
          id: 'table-123',
          name: 'Dragon\'s Fortune',
          gameType: 'nlhe',
          stakes: { currency: '€', small: 1, big: 2 },
          maxPlayers: 6,
          players: 5,
          avgPot: 88,
          waitlist: 0,
          speed: 'normal',
          handsPerHour: 65,
          playersPerFlop: 42,
          rakebackPercent: 10,
          features: ['featured', 'lucky8']
        },
        {
          id: 'table-456',
          name: 'Sakura Lounge',
          gameType: 'plo',
          stakes: { currency: '€', small: 0.5, big: 1 },
          maxPlayers: 6,
          players: 6,
          avgPot: 45,
          waitlist: 3,
          speed: 'turbo',
          handsPerHour: 90,
          playersPerFlop: 68,
          rakebackPercent: 0,
          features: ['turbo']
        },
        {
          id: 'table-789',
          name: 'Beginner Haven',
          gameType: 'nlhe',
          stakes: { currency: '€', small: 0.05, big: 0.10 },
          maxPlayers: 9,
          players: 3,
          avgPot: 2.5,
          waitlist: 0,
          speed: 'normal',
          handsPerHour: 55,
          playersPerFlop: 35,
          rakebackPercent: 15,
          features: ['beginner', 'protected']
        },
        {
          id: 'table-888',
          name: 'Lucky Eights',
          gameType: 'nlhe',
          stakes: { currency: '€', small: 8, big: 16 },
          maxPlayers: 8,
          players: 8,
          avgPot: 888,
          waitlist: 8,
          speed: 'normal',
          handsPerHour: 58,
          playersPerFlop: 38,
          rakebackPercent: 8,
          features: ['lucky8', 'featured']
        }
      ] as T;
      
    case 'create_table':
      return {
        id: 'new-table-456',
        name: args.config.name || 'New Test Table',
        playerCount: 0,
        maxPlayers: 9,
        gamePhase: 'waiting',
        pot: 0,
        blinds: args.config.blinds || { small: 10, big: 20 }
      } as T;
      
    case 'join_table':
      return { success: true } as T;
      
    case 'logout':
      return { success: true } as T;
      
    case 'get_lobby_stats':
      return {
        playersOnline: 8888,
        activeTables: 88,
        totalPot: 888888
      } as T;
      
    case 'get_table_details':
      return {
        id: args.tableId,
        name: 'Test Table',
        gameType: 'nlhe',
        stakes: { smallBlind: 1, bigBlind: 2 },
        maxPlayers: 6,
        currentPlayers: 4,
        pot: 100,
        status: 'active',
        createdAt: new Date().toISOString()
      } as T;
      
    case 'join_waitlist':
      return { success: true, position: 3 } as T;
      
    default:
      console.warn(`[Test Mode] Unknown command: ${command}`);
      throw new Error(`Mock not implemented for command: ${command}`);
  }
}