import { RandomUtils } from '@primo-poker/shared';
// Cloudflare D1 implementations
export class D1PlayerRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findById(id) {
        const stmt = this.db.prepare('SELECT * FROM players WHERE id = ?');
        const result = await stmt.bind(id).first();
        if (!result)
            return null;
        return this.mapRowToPlayer(result);
    }
    async findByUsername(username) {
        const stmt = this.db.prepare('SELECT * FROM players WHERE username = ?');
        const result = await stmt.bind(username).first();
        if (!result)
            return null;
        return this.mapRowToPlayer(result);
    }
    async findByEmail(email) {
        const stmt = this.db.prepare('SELECT * FROM players WHERE email = ?');
        const result = await stmt.bind(email).first();
        if (!result)
            return null;
        return this.mapRowToPlayer(result);
    }
    async create(player) {
        const id = RandomUtils.generateUUID();
        const now = new Date().toISOString();
        const stmt = this.db.prepare(`
      INSERT INTO players (id, username, email, chip_count, status, is_dealer, time_bank, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        await stmt.bind(id, player.username, player.email, player.chipCount, player.status, player.isDealer, player.timeBank, now, now).run();
        return { ...player, id };
    }
    async update(id, updates) {
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
        await stmt.bind(updated.username, updated.email, updated.chipCount, updated.status, updated.timeBank, now, id).run();
        return updated;
    }
    async delete(id) {
        const stmt = this.db.prepare('DELETE FROM players WHERE id = ?');
        await stmt.bind(id).run();
    }
    mapRowToPlayer(row) {
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
export class D1GameRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findById(id) {
        const stmt = this.db.prepare('SELECT * FROM games WHERE game_id = ?');
        const result = await stmt.bind(id).first();
        if (!result)
            return null;
        return this.mapRowToGameState(result);
    }
    async create(gameState) {
        const now = new Date().toISOString();
        const stmt = this.db.prepare(`
      INSERT INTO games (
        table_id, game_id, phase, pot, side_pots, community_cards,
        current_bet, min_raise, active_player_id, dealer_id,
        small_blind_id, big_blind_id, hand_number, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        await stmt.bind(gameState.tableId, gameState.gameId, gameState.phase, gameState.pot, JSON.stringify(gameState.sidePots), JSON.stringify(gameState.communityCards), gameState.currentBet, gameState.minRaise, gameState.activePlayerId, gameState.dealerId, gameState.smallBlindId, gameState.bigBlindId, gameState.handNumber, now, now).run();
        return gameState;
    }
    async update(id, updates) {
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
        await stmt.bind(updated.phase, updated.pot, JSON.stringify(updated.sidePots), JSON.stringify(updated.communityCards), updated.currentBet, updated.minRaise, updated.activePlayerId, now, id).run();
        return updated;
    }
    async findByTableId(tableId) {
        const stmt = this.db.prepare('SELECT * FROM games WHERE table_id = ? ORDER BY created_at DESC');
        const results = await stmt.bind(tableId).all();
        return results.results.map(row => this.mapRowToGameState(row));
    }
    async delete(id) {
        const stmt = this.db.prepare('DELETE FROM games WHERE game_id = ?');
        await stmt.bind(id).run();
    }
    mapRowToGameState(row) {
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
export class D1TournamentRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findById(id) {
        const stmt = this.db.prepare('SELECT * FROM tournaments WHERE id = ?');
        const result = await stmt.bind(id).first();
        if (!result)
            return null;
        return this.mapRowToTournament(result);
    }
    async create(tournament) {
        const id = RandomUtils.generateUUID();
        const now = new Date().toISOString();
        const stmt = this.db.prepare(`
      INSERT INTO tournaments (
        id, name, buy_in, prize_pool, max_players, registered_players,
        start_time, status, structure, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        await stmt.bind(id, tournament.name, tournament.buyIn, tournament.prizePool, tournament.maxPlayers, JSON.stringify(tournament.registeredPlayers), tournament.startTime.toISOString(), tournament.status, JSON.stringify(tournament.structure), now, now).run();
        return { ...tournament, id };
    }
    async update(id, updates) {
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
        await stmt.bind(updated.name, updated.buyIn, updated.prizePool, updated.maxPlayers, JSON.stringify(updated.registeredPlayers), updated.startTime.toISOString(), updated.status, JSON.stringify(updated.structure), now, id).run();
        return updated;
    }
    async findActive() {
        const stmt = this.db.prepare("SELECT * FROM tournaments WHERE status IN ('registering', 'started') ORDER BY start_time ASC");
        const results = await stmt.all();
        return results.results.map(row => this.mapRowToTournament(row));
    }
    async delete(id) {
        const stmt = this.db.prepare('DELETE FROM tournaments WHERE id = ?');
        await stmt.bind(id).run();
    }
    mapRowToTournament(row) {
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
    bucket;
    constructor(bucket) {
        this.bucket = bucket;
    }
    async storeHandHistory(gameId, handNumber, handData) {
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
    async getHandHistory(gameId, handNumber) {
        const key = `hand-history/${gameId}/${handNumber}.json`;
        const object = await this.bucket.get(key);
        if (!object)
            return null;
        const data = await object.text();
        return JSON.parse(data);
    }
    async getGameHandHistory(gameId) {
        const prefix = `hand-history/${gameId}/`;
        const objects = await this.bucket.list({ prefix });
        const handHistories = [];
        for (const object of objects.objects) {
            const data = await this.bucket.get(object.key);
            if (data) {
                const handData = JSON.parse(await data.text());
                handHistories.push(handData);
            }
        }
        return handHistories.sort((a, b) => a.handNumber - b.handNumber);
    }
    async deleteHandHistory(gameId, handNumber) {
        if (handNumber) {
            const key = `hand-history/${gameId}/${handNumber}.json`;
            await this.bucket.delete(key);
        }
        else {
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
    kv;
    constructor(kv) {
        this.kv = kv;
    }
    async createSession(userId, sessionData, ttl = 3600) {
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
    async getSession(sessionId) {
        const key = `session:${sessionId}`;
        const data = await this.kv.get(key);
        if (!data)
            return null;
        return JSON.parse(data);
    }
    async updateSession(sessionId, updates, ttl) {
        const existing = await this.getSession(sessionId);
        if (!existing) {
            throw new Error('Session not found');
        }
        const updated = { ...existing, ...updates };
        const key = `session:${sessionId}`;
        const options = ttl ? { expirationTtl: ttl } : {};
        await this.kv.put(key, JSON.stringify(updated), options);
    }
    async deleteSession(sessionId) {
        const key = `session:${sessionId}`;
        await this.kv.delete(key);
    }
    async getUserSessions(userId) {
        // Note: KV doesn't support queries, so we'd need to maintain a separate index
        // This is a simplified implementation
        const sessions = [];
        // In a real implementation, you'd maintain a set of session IDs per user
        // For now, this is a placeholder
        return sessions;
    }
}
//# sourceMappingURL=repositories.js.map