/**
 * MSW (Mock Service Worker) Handlers - Phase 2
 * 
 * Comprehensive API mocking for:
 * - Wallet operations
 * - Chat system
 * - Lobby real-time updates
 * - User profiles and social features
 * - Spectator mode
 */

import { rest } from 'msw';
import { setupServer } from 'msw/node';
import {
  mockWallets,
  mockChatMessages,
  mockProfiles,
  mockFriendships,
  mockBlockedUsers,
  mockPlayerNotes,
  mockTables,
  mockSpectators,
  initializeTestData,
  mockHelpers
} from './shared-mock-data';

// Initialize test data
initializeTestData();

// Wallet API handlers
const walletHandlers = [
  // Get wallet balance
  rest.get('/api/wallet/:playerId/balance', (req, res, ctx) => {
    const { playerId } = req.params;
    const wallet = mockWallets.get(playerId as string);

    if (!wallet) {
      return res(
        ctx.status(404),
        ctx.json({ error: 'Wallet not found' })
      );
    }

    return res(
      ctx.status(200),
      ctx.json({
        balance: wallet.balance,
        currency: wallet.currency,
        availableBalance: wallet.balance - wallet.frozen
      })
    );
  }),

  // Deposit funds
  rest.post('/api/wallet/:playerId/deposit', async (req, res, ctx) => {
    const { playerId } = req.params;
    const { amount, method } = await req.json();
    const wallet = mockWallets.get(playerId as string);

    if (!wallet) {
      return res(
        ctx.status(404),
        ctx.json({ error: 'Wallet not found' })
      );
    }

    if (amount <= 0) {
      return res(
        ctx.status(400),
        ctx.json({ error: 'Amount must be positive' })
      );
    }

    // Simulate payment processing delay
    await ctx.delay(500);

    wallet.balance += amount;
    wallet.lastUpdated = new Date().toISOString();

    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        newBalance: wallet.balance,
        transactionId: `dep-${Date.now()}`
      })
    );
  }),

  // Withdraw funds
  rest.post('/api/wallet/:playerId/withdraw', async (req, res, ctx) => {
    const { playerId } = req.params;
    const { amount, method } = await req.json();
    const wallet = mockWallets.get(playerId as string);

    if (!wallet) {
      return res(
        ctx.status(404),
        ctx.json({ error: 'Wallet not found' })
      );
    }

    const availableBalance = wallet.balance - wallet.frozen;
    if (amount > availableBalance) {
      return res(
        ctx.status(400),
        ctx.json({ error: 'Insufficient funds' })
      );
    }

    wallet.balance -= amount;
    wallet.lastUpdated = new Date().toISOString();

    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        newBalance: wallet.balance,
        transactionId: `wd-${Date.now()}`
      })
    );
  }),

  // Transfer to table
  rest.post('/api/wallet/:playerId/transfer', async (req, res, ctx) => {
    const { playerId } = req.params;
    const { tableId, amount } = await req.json();
    const wallet = mockWallets.get(playerId as string);

    if (!wallet) {
      return res(
        ctx.status(404),
        ctx.json({ error: 'Wallet not found' })
      );
    }

    const availableBalance = wallet.balance - wallet.frozen;
    if (amount > availableBalance) {
      return res(
        ctx.status(400),
        ctx.json({ error: 'Insufficient funds' })
      );
    }

    wallet.frozen += amount;
    wallet.lastUpdated = new Date().toISOString();

    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        newBalance: wallet.balance,
        transferredAmount: amount,
        transactionId: `tr-${Date.now()}`
      })
    );
  }),

  // Get transaction history
  rest.get('/api/wallet/:playerId/transactions', (req, res, ctx) => {
    const { playerId } = req.params;
    const limit = req.url.searchParams.get('limit') || '50';
    const cursor = req.url.searchParams.get('cursor');

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

    return res(
      ctx.status(200),
      ctx.json({
        transactions: transactions.slice(0, parseInt(limit)),
        nextCursor: transactions.length > parseInt(limit) ? 'next-cursor' : undefined
      })
    );
  })
];

// Chat API handlers
const chatHandlers = [
  // Send chat message
  rest.post('/api/chat/:tableId/messages', async (req, res, ctx) => {
    const { tableId } = req.params;
    const { playerId, message, type = 'text' } = await req.json();

    if (!message || message.trim().length === 0) {
      return res(
        ctx.status(400),
        ctx.json({ error: 'Message cannot be empty' })
      );
    }

    // Check for spam (simple rate limiting)
    const tableMessages = mockChatMessages.get(tableId as string) || [];
    const recentMessages = tableMessages.filter(m => 
      m.playerId === playerId && 
      Date.now() - new Date(m.timestamp).getTime() < 1000
    );

    if (recentMessages.length >= 3) {
      return res(
        ctx.status(429),
        ctx.json({ error: 'Too many messages. Please slow down.' })
      );
    }

    const newMessage = {
      id: `msg-${Date.now()}`,
      playerId,
      message,
      type,
      timestamp: new Date().toISOString(),
      edited: false,
      reactions: []
    };

    tableMessages.push(newMessage);
    mockChatMessages.set(tableId as string, tableMessages);

    return res(
      ctx.status(200),
      ctx.json(newMessage)
    );
  }),

  // Get chat history
  rest.get('/api/chat/:tableId/messages', (req, res, ctx) => {
    const { tableId } = req.params;
    const limit = req.url.searchParams.get('limit') || '50';
    const before = req.url.searchParams.get('before');

    const messages = mockChatMessages.get(tableId as string) || [];
    
    return res(
      ctx.status(200),
      ctx.json({
        messages: messages.slice(-parseInt(limit)),
        hasMore: messages.length > parseInt(limit)
      })
    );
  }),

  // Report message
  rest.post('/api/chat/messages/:messageId/report', async (req, res, ctx) => {
    const { messageId } = req.params;
    const { reason, details } = await req.json();

    return res(
      ctx.status(200),
      ctx.json({
        reportId: `report-${Date.now()}`,
        status: 'pending'
      })
    );
  })
];

// Profile and Social API handlers
const profileHandlers = [
  // Get user profile
  rest.get('/api/profiles/:userId', (req, res, ctx) => {
    const { userId } = req.params;
    const profile = mockProfiles.get(userId as string);

    if (!profile) {
      return res(
        ctx.status(404),
        ctx.json({ error: 'Profile not found' })
      );
    }

    return res(
      ctx.status(200),
      ctx.json(profile)
    );
  }),

  // Update profile
  rest.patch('/api/profiles/:userId', async (req, res, ctx) => {
    const { userId } = req.params;
    const updates = await req.json();
    const profile = mockProfiles.get(userId as string);

    if (!profile) {
      return res(
        ctx.status(404),
        ctx.json({ error: 'Profile not found' })
      );
    }

    Object.assign(profile, updates);
    mockProfiles.set(userId as string, profile);

    return res(
      ctx.status(200),
      ctx.json(profile)
    );
  }),

  // Add friend
  rest.post('/api/friends/add', async (req, res, ctx) => {
    const { userId, friendId } = await req.json();

    const userFriends = mockFriendships.get(userId) || new Set();
    userFriends.add(friendId);
    mockFriendships.set(userId, userFriends);

    return res(
      ctx.status(200),
      ctx.json({ success: true })
    );
  }),

  // Block user
  rest.post('/api/users/block', async (req, res, ctx) => {
    const { userId, blockedUserId } = await req.json();

    const blockedList = mockBlockedUsers.get(userId) || new Set();
    blockedList.add(blockedUserId);
    mockBlockedUsers.set(userId, blockedList);

    return res(
      ctx.status(200),
      ctx.json({ success: true })
    );
  }),

  // Add player note
  rest.post('/api/players/:playerId/notes', async (req, res, ctx) => {
    const { playerId } = req.params;
    const { userId, note } = await req.json();

    const userNotes = mockPlayerNotes.get(userId) || new Map();
    userNotes.set(playerId as string, note);
    mockPlayerNotes.set(userId, userNotes);

    return res(
      ctx.status(200),
      ctx.json({ success: true })
    );
  })
];

// Spectator API handlers
const spectatorHandlers = [
  // Join as spectator
  rest.post('/api/tables/:tableId/spectate', async (req, res, ctx) => {
    const { tableId } = req.params;
    const { userId } = await req.json();

    const table = mockTables.get(tableId as string);
    if (!table) {
      return res(
        ctx.status(404),
        ctx.json({ error: 'Table not found' })
      );
    }

    const spectators = mockSpectators.get(tableId as string) || new Set();
    spectators.add(userId);
    mockSpectators.set(tableId as string, spectators);

    table.spectatorCount = spectators.size;

    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        spectatorCount: spectators.size
      })
    );
  }),

  // Leave spectator mode
  rest.post('/api/tables/:tableId/spectate/leave', async (req, res, ctx) => {
    const { tableId } = req.params;
    const { userId } = await req.json();

    const spectators = mockSpectators.get(tableId as string);
    if (spectators) {
      spectators.delete(userId);
      
      const table = mockTables.get(tableId as string);
      if (table) {
        table.spectatorCount = spectators.size;
      }
    }

    return res(
      ctx.status(200),
      ctx.json({ success: true })
    );
  }),

  // Get spectator view
  rest.get('/api/tables/:tableId/spectator-view', (req, res, ctx) => {
    const { tableId } = req.params;
    const table = mockTables.get(tableId as string);

    if (!table) {
      return res(
        ctx.status(404),
        ctx.json({ error: 'Table not found' })
      );
    }

    return res(
      ctx.status(200),
      ctx.json({
        tableId,
        gameState: {
          phase: 'FLOP',
          pot: 150,
          communityCards: ['Ah', 'Kd', '7c'],
          players: [
            { id: 'p1', username: 'Player1', chips: 980, bet: 20, folded: false },
            { id: 'p2', username: 'Player2', chips: 950, bet: 50, folded: false }
          ],
          currentPlayer: 'p1'
        },
        spectatorCount: table.spectatorCount,
        chatEnabled: true
      })
    );
  })
];

// Lobby WebSocket mock handler
const lobbyWebSocketHandler = rest.get('/ws/lobby', (req, res, ctx) => {
  return res(
    ctx.status(101),
    ctx.set('Upgrade', 'websocket'),
    ctx.set('Connection', 'Upgrade')
  );
});

// Combine all handlers
export const handlers = [
  ...walletHandlers,
  ...chatHandlers,
  ...profileHandlers,
  ...spectatorHandlers,
  lobbyWebSocketHandler
];

// Create mock server
export const server = setupServer(...handlers);

// Re-export mockHelpers from shared module
export { mockHelpers };