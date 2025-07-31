import { Player, GameState, RandomUtils } from '@primo-poker/shared';
import type { Table } from '@primo-poker/shared';

// Repository interfaces
export interface IPlayerRepository {
  findById(id: string): Promise<Player | null>;
  findByUsername(username: string): Promise<Player | null>;
  findByEmail(email: string): Promise<Player | null>;
  create(player: Omit<Player, 'id'>): Promise<Player>;
  update(id: string, updates: Partial<Player>): Promise<Player>;
  delete(id: string): Promise<void>;
}

export interface IGameRepository {
  findById(id: string): Promise<GameState | null>;
  create(gameState: GameState): Promise<GameState>;
  update(id: string, updates: Partial<GameState>): Promise<GameState>;
  findByTableId(tableId: string): Promise<GameState[]>;
  delete(id: string): Promise<void>;
}

export interface ITournamentRepository {
  findById(id: string): Promise<Tournament | null>;
  create(tournament: Omit<Tournament, 'id'>): Promise<Tournament>;
  update(id: string, updates: Partial<Tournament>): Promise<Tournament>;
  findActive(): Promise<Tournament[]>;
  delete(id: string): Promise<void>;
}

// Domain entities
export interface Tournament {
  id: string;
  name: string;
  buyIn: number;
  prizePool: number;
  maxPlayers: number;
  registeredPlayers: string[];
  startTime: Date;
  status: 'registering' | 'started' | 'finished';
  structure: TournamentStructure;
  createdAt: Date;
  updatedAt: Date;
}

export interface TournamentStructure {
  blindLevels: BlindLevel[];
  levelDuration: number; // minutes
  startingChips: number;
}

export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
}

// Cloudflare D1 implementations
export class D1PlayerRepository implements IPlayerRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<Player | null> {
    const stmt = this.db.prepare('SELECT * FROM players WHERE id = ?');
    const result = await stmt.bind(id).first();
    
    if (!result) return null;
    
    return this.mapRowToPlayer(result);
  }

  async findByUsername(username: string): Promise<Player | null> {
    const stmt = this.db.prepare('SELECT * FROM players WHERE username = ?');
    const result = await stmt.bind(username).first();
    
    if (!result) return null;
    
    return this.mapRowToPlayer(result);
  }

  async findByEmail(email: string): Promise<Player | null> {
    const stmt = this.db.prepare('SELECT * FROM players WHERE email = ?');
    const result = await stmt.bind(email).first();
    
    if (!result) return null;
    
    return this.mapRowToPlayer(result);
  }

  async create(player: Omit<Player, 'id'>): Promise<Player> {
    const id = RandomUtils.generateUUID();
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO players (id, username, email, chip_count, status, time_bank, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      id,
      player.username,
      player.email,
      player.chipCount,
      player.status,
      player.timeBank,
      now,
      now
    ).run();
    
    return { ...player, id };
  }

  async update(id: string, updates: Partial<Player>): Promise<Player> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Player not found');
    }
    
    const updated = { ...existing, ...updates };
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      UPDATE players 
      SET username = ?, email = ?, chip_count = ?, status = ?, time_bank = ?, updated_at = ?
      WHERE id = ?
    `);
    
    await stmt.bind(
      updated.username,
      updated.email,
      updated.chipCount,
      updated.status,
      updated.timeBank,
      now,
      id
    ).run();
    
    return updated;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM players WHERE id = ?');
    await stmt.bind(id).run();
  }

  private mapRowToPlayer(row: any): Player {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      chipCount: row.chip_count,
      status: row.status,
      timeBank: row.time_bank,
      isDealer: row.is_dealer === 1,
      position: row.position ? JSON.parse(row.position) : undefined,
      lastAction: row.last_action ? new Date(row.last_action) : undefined,
    };
  }
}

export class D1GameRepository implements IGameRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<GameState | null> {
    const stmt = this.db.prepare('SELECT * FROM games WHERE game_id = ?');
    const result = await stmt.bind(id).first();
    
    if (!result) return null;
    
    return this.mapRowToGameState(result);
  }

  async create(gameState: GameState): Promise<GameState> {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO games (
        table_id, game_id, phase, pot, side_pots, community_cards,
        current_bet, min_raise, active_player_id, dealer_id,
        small_blind_id, big_blind_id, hand_number, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      gameState.tableId,
      gameState.gameId,
      gameState.phase,
      gameState.pot,
      JSON.stringify(gameState.sidePots),
      JSON.stringify(gameState.communityCards),
      gameState.currentBet,
      gameState.minRaise,
      gameState.activePlayerId,
      gameState.dealerId,
      gameState.smallBlindId,
      gameState.bigBlindId,
      gameState.handNumber,
      now,
      now
    ).run();
    
    return gameState;
  }

  async update(id: string, updates: Partial<GameState>): Promise<GameState> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Game not found');
    }
    
    const updated = { ...existing, ...updates };
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      UPDATE games 
      SET phase = ?, pot = ?, side_pots = ?, community_cards = ?,
          current_bet = ?, min_raise = ?, active_player_id = ?,
          updated_at = ?
      WHERE game_id = ?
    `);
    
    await stmt.bind(
      updated.phase,
      updated.pot,
      JSON.stringify(updated.sidePots),
      JSON.stringify(updated.communityCards),
      updated.currentBet,
      updated.minRaise,
      updated.activePlayerId,
      now,
      id
    ).run();
    
    return updated;
  }

  async findByTableId(tableId: string): Promise<GameState[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM games WHERE table_id = ? ORDER BY created_at DESC'
    );
    const results = await stmt.bind(tableId).all();
    
    return results.results.map(row => this.mapRowToGameState(row));
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM games WHERE game_id = ?');
    await stmt.bind(id).run();
  }

  private mapRowToGameState(row: any): GameState {
    return {
      tableId: row.table_id,
      gameId: row.game_id,
      phase: row.phase,
      pot: row.pot,
      sidePots: JSON.parse(row.side_pots || '[]'),
      communityCards: JSON.parse(row.community_cards || '[]'),
      currentBet: row.current_bet,
      minRaise: row.min_raise,
      activePlayerId: row.active_player_id,
      dealerId: row.dealer_id,
      smallBlindId: row.small_blind_id,
      bigBlindId: row.big_blind_id,
      handNumber: row.hand_number,
      timestamp: new Date(row.updated_at),
    };
  }
}

export class D1TournamentRepository implements ITournamentRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<Tournament | null> {
    const stmt = this.db.prepare('SELECT * FROM tournaments WHERE id = ?');
    const result = await stmt.bind(id).first();
    
    if (!result) return null;
    
    return this.mapRowToTournament(result);
  }

  async create(tournament: Omit<Tournament, 'id'>): Promise<Tournament> {
    const id = RandomUtils.generateUUID();
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO tournaments (
        id, name, buy_in, prize_pool, max_players, registered_players,
        start_time, status, structure, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      id,
      tournament.name,
      tournament.buyIn,
      tournament.prizePool,
      tournament.maxPlayers,
      JSON.stringify(tournament.registeredPlayers),
      tournament.startTime.toISOString(),
      tournament.status,
      JSON.stringify(tournament.structure),
      now,
      now
    ).run();
    
    return { ...tournament, id };
  }

  async update(id: string, updates: Partial<Tournament>): Promise<Tournament> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Tournament not found');
    }
    
    const updated = { ...existing, ...updates };
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      UPDATE tournaments 
      SET name = ?, buy_in = ?, prize_pool = ?, max_players = ?,
          registered_players = ?, start_time = ?, status = ?,
          structure = ?, updated_at = ?
      WHERE id = ?
    `);
    
    await stmt.bind(
      updated.name,
      updated.buyIn,
      updated.prizePool,
      updated.maxPlayers,
      JSON.stringify(updated.registeredPlayers),
      updated.startTime.toISOString(),
      updated.status,
      JSON.stringify(updated.structure),
      now,
      id
    ).run();
    
    return updated;
  }

  async findActive(): Promise<Tournament[]> {
    const stmt = this.db.prepare(
      "SELECT * FROM tournaments WHERE status IN ('registering', 'started') ORDER BY start_time ASC"
    );
    const results = await stmt.all();
    
    return results.results.map(row => this.mapRowToTournament(row));
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM tournaments WHERE id = ?');
    await stmt.bind(id).run();
  }

  private mapRowToTournament(row: any): Tournament {
    return {
      id: row.id,
      name: row.name,
      buyIn: row.buy_in,
      prizePool: row.prize_pool,
      maxPlayers: row.max_players,
      registeredPlayers: JSON.parse(row.registered_players || '[]'),
      startTime: new Date(row.start_time),
      status: row.status,
      structure: JSON.parse(row.structure),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// Hand history storage in R2
export class R2HandHistoryStorage {
  constructor(private bucket: R2Bucket) {}

  async storeHandHistory(gameId: string, handNumber: number, handData: any): Promise<void> {
    const key = `hand-history/${gameId}/${handNumber}.json`;
    const metadata = {
      gameId,
      handNumber: handNumber.toString(),
      timestamp: new Date().toISOString(),
    };
    
    await this.bucket.put(key, JSON.stringify(handData), {
      httpMetadata: {
        contentType: 'application/json',
      },
      customMetadata: metadata,
    });
  }

  async getHandHistory(gameId: string, handNumber: number): Promise<any | null> {
    const key = `hand-history/${gameId}/${handNumber}.json`;
    const object = await this.bucket.get(key);
    
    if (!object) return null;
    
    const data = await object.text();
    return JSON.parse(data);
  }

  async getGameHandHistory(gameId: string): Promise<any[]> {
    const prefix = `hand-history/${gameId}/`;
    const objects = await this.bucket.list({ prefix });
    
    const handHistories: any[] = [];
    for (const object of objects.objects) {
      const data = await this.bucket.get(object.key);
      if (data) {
        const handData = JSON.parse(await data.text());
        handHistories.push(handData);
      }
    }
    
    return handHistories.sort((a, b) => a.handNumber - b.handNumber);
  }

  async deleteHandHistory(gameId: string, handNumber?: number): Promise<void> {
    if (handNumber) {
      const key = `hand-history/${gameId}/${handNumber}.json`;
      await this.bucket.delete(key);
    } else {
      // Delete all hand history for the game
      const prefix = `hand-history/${gameId}/`;
      const objects = await this.bucket.list({ prefix });
      
      for (const object of objects.objects) {
        await this.bucket.delete(object.key);
      }
    }
  }
}

// Session management with KV
export class KVSessionStore {
  constructor(private kv: KVNamespace) {}

  async createSession(userId: string, sessionData: any, ttl: number = 3600): Promise<string> {
    const sessionId = RandomUtils.generateUUID();
    const key = `session:${sessionId}`;
    
    const data = {
      ...sessionData,
      userId,
      createdAt: Date.now(),
    };
    
    await this.kv.put(key, JSON.stringify(data), { expirationTtl: ttl });
    return sessionId;
  }

  async getSession(sessionId: string): Promise<any | null> {
    const key = `session:${sessionId}`;
    const data = await this.kv.get(key);
    
    if (!data) return null;
    
    return JSON.parse(data);
  }

  async updateSession(sessionId: string, updates: any, ttl?: number): Promise<void> {
    const existing = await this.getSession(sessionId);
    if (!existing) {
      throw new Error('Session not found');
    }
    
    const updated = { ...existing, ...updates };
    const key = `session:${sessionId}`;
    
    const options = ttl ? { expirationTtl: ttl } : {};
    await this.kv.put(key, JSON.stringify(updated), options);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.kv.delete(key);
  }

  async getUserSessions(userId: string): Promise<string[]> {
    // Note: KV doesn't support queries, so we'd need to maintain a separate index
    // This is a simplified implementation
    const sessions: string[] = [];
    
    // In a real implementation, you'd maintain a set of session IDs per user
    // For now, this is a placeholder
    return sessions;
  }
}
