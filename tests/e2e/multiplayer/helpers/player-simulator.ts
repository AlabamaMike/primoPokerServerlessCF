/**
 * Player simulator for automated poker actions
 */

import { TestConfig } from '../config';
import { TestLogger } from './logger';
import { ApiClient, AuthTokens, PlayerInfo } from './api-client';
import { WebSocketHelper, PlayerWebSocket } from './websocket-helper';

export interface SimulatedPlayer {
  id: string;
  username: string;
  email: string;
  password: string;
  tokens?: AuthTokens;
  info?: PlayerInfo;
  websocket?: PlayerWebSocket;
  position?: number;
  chipCount: number;
  isActive: boolean;
  isFolded: boolean;
  currentBet: number;
  holeCards?: string[];
}

export interface ActionDecision {
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';
  amount?: number;
}

export class PlayerSimulator {
  private config: TestConfig;
  private logger: TestLogger;
  private apiClient: ApiClient;
  private wsHelper: WebSocketHelper;
  private players: Map<string, SimulatedPlayer> = new Map();

  constructor(
    config: TestConfig,
    logger: TestLogger,
    apiClient: ApiClient,
    wsHelper: WebSocketHelper
  ) {
    this.config = config;
    this.logger = logger;
    this.apiClient = apiClient;
    this.wsHelper = wsHelper;
  }

  /**
   * Create or authenticate a player
   */
  async setupPlayer(email: string, username: string, password: string): Promise<SimulatedPlayer> {
    this.logger.log(`Setting up player: ${username}`);

    let tokens: AuthTokens;
    
    // Try to login first, register if it fails
    try {
      tokens = await this.apiClient.login(username, password);
      this.logger.debug(`${username} logged in successfully`);
    } catch (loginError) {
      // Try to register new user
      try {
        this.logger.debug(`Registering new user: ${username}`);
        tokens = await this.apiClient.register(email, username, password);
      } catch (registerError: any) {
        // If registration fails with "already exists", try login again with a delay
        if (registerError.message.includes('already exists')) {
          this.logger.debug(`User exists, retrying login for: ${username}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          tokens = await this.apiClient.login(username, password);
        } else {
          throw registerError;
        }
      }
    }

    // Get player info
    const info = await this.apiClient.getProfile(tokens.accessToken);

    const player: SimulatedPlayer = {
      id: info.id,
      username,
      email,
      password,
      tokens,
      info,
      chipCount: info.chipCount,
      isActive: true,
      isFolded: false,
      currentBet: 0,
    };

    this.players.set(player.id, player);
    return player;
  }

  /**
   * Connect player to table via WebSocket
   */
  async connectToTable(playerId: string, tableId: string): Promise<void> {
    const player = this.players.get(playerId);
    if (!player || !player.tokens) {
      throw new Error(`Player ${playerId} not found or not authenticated`);
    }

    player.websocket = await this.wsHelper.connect(
      player.id,
      player.username,
      player.tokens.accessToken,
      tableId
    );

    // Register message handlers
    this.wsHelper.onMessage(player.id, 'player_joined', (msg) => {
      if (msg.payload?.playerId === player.id) {
        player.position = msg.payload.position;
        player.chipCount = msg.payload.chipCount;
        this.logger.detailed(`${player.username} seated at position ${player.position}`);
      }
    });

    this.wsHelper.onMessage(player.id, 'game_update', (msg) => {
      this.updatePlayerState(player, msg.payload);
    });

    this.wsHelper.onMessage(player.id, 'table_update', (msg) => {
      this.logger.detailed(`${player.username} received table update: phase=${msg.payload?.phase}`);
      this.updatePlayerState(player, msg.payload);
    });

    this.wsHelper.onMessage(player.id, 'hole_cards', (msg) => {
      const cards = msg.payload?.cards;
      if (cards && Array.isArray(cards)) {
        player.holeCards = cards.map(c => `${c.rank}${c.suit[0]}`); // Convert to string format
        this.logger.detailed(`${player.username} received hole cards: ${player.holeCards.join(' ')}`);
      }
    });
    
    // Log all messages in debug mode
    this.wsHelper.onMessage(player.id, '*', (msg) => {
      this.logger.debug(`${player.username} received: ${msg.type}`);
    });
  }

  /**
   * Have player join a table
   */
  async joinTable(playerId: string, tableId: string, buyIn: number): Promise<void> {
    const player = this.players.get(playerId);
    if (!player || !player.tokens) {
      throw new Error(`Player ${playerId} not found`);
    }

    await this.apiClient.joinTable(player.tokens.accessToken, tableId, buyIn);
    await this.connectToTable(playerId, tableId);
  }

  /**
   * Make an automated decision for a player
   */
  async makeDecision(playerId: string, gameState: any): Promise<ActionDecision> {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }

    // Simple decision logic for testing
    const currentPlayer = gameState.players?.find((p: any) => p.id === playerId);
    if (!currentPlayer) {
      throw new Error(`Player ${playerId} not in game state`);
    }

    const toCall = gameState.currentBet - currentPlayer.currentBet;
    const potOdds = toCall / (gameState.pot + toCall);

    // Basic strategy
    if (toCall === 0) {
      // No bet to call - check or bet
      if (Math.random() > 0.7) {
        // Bet 30% of the time
        const betSize = Math.floor(gameState.pot * 0.5);
        return { action: 'bet', amount: Math.min(betSize, currentPlayer.chipCount) };
      }
      return { action: 'check' };
    } else {
      // Facing a bet
      if (potOdds < 0.2 && Math.random() > 0.3) {
        // Good pot odds or bluff
        return { action: 'call' };
      } else if (Math.random() > 0.8) {
        // Occasionally raise
        const raiseSize = toCall * 2;
        return { action: 'raise', amount: Math.min(raiseSize, currentPlayer.chipCount) };
      } else if (Math.random() > 0.5) {
        // Call half the time
        return { action: 'call' };
      } else {
        // Fold
        return { action: 'fold' };
      }
    }
  }

  /**
   * Execute player action
   */
  async executeAction(playerId: string, decision: ActionDecision): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }

    this.logger.recordAction(playerId, decision.action, decision.amount);
    await this.wsHelper.sendAction(playerId, decision.action, decision.amount);
    
    // Update local state
    if (decision.action === 'fold') {
      player.isFolded = true;
    } else if (decision.action === 'bet' || decision.action === 'raise') {
      player.currentBet += decision.amount || 0;
    } else if (decision.action === 'call') {
      // Update will come from server
    }
  }

  /**
   * Update player state from game update
   */
  private updatePlayerState(player: SimulatedPlayer, gameState: any) {
    const playerState = gameState.players?.find((p: any) => p.id === player.id);
    if (playerState) {
      player.chipCount = playerState.chipCount;
      player.currentBet = playerState.currentBet || 0;
      player.isFolded = playerState.status === 'folded';
      player.isActive = playerState.status === 'active';
    }
  }

  /**
   * Get player by ID
   */
  getPlayer(playerId: string): SimulatedPlayer | undefined {
    return this.players.get(playerId);
  }

  /**
   * Get all players
   */
  getAllPlayers(): SimulatedPlayer[] {
    return Array.from(this.players.values());
  }

  /**
   * Disconnect a player
   */
  async disconnectPlayer(playerId: string): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;

    if (player.websocket) {
      this.wsHelper.disconnect(playerId);
    }
    
    player.isActive = false;
  }

  /**
   * Disconnect all players
   */
  async disconnectAll(): Promise<void> {
    for (const playerId of this.players.keys()) {
      await this.disconnectPlayer(playerId);
    }
  }

  /**
   * Wait for player's turn
   */
  async waitForTurn(playerId: string, timeout: number = 10000): Promise<any> {
    return this.wsHelper.waitForMessage(playerId, 'your_turn', timeout);
  }

  /**
   * Handle automated play for a player
   */
  async autoPlay(playerId: string, gameState: any): Promise<void> {
    const player = this.players.get(playerId);
    if (!player || player.isFolded || !player.isActive) {
      return;
    }

    // Wait a bit to simulate thinking
    await new Promise(resolve => setTimeout(resolve, this.config.timing.betweenActions));

    // Make decision and execute
    const decision = await this.makeDecision(playerId, gameState);
    await this.executeAction(playerId, decision);
  }
}