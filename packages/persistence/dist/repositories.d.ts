import { Player, GameState } from '@primo-poker/shared';
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
    levelDuration: number;
    startingChips: number;
}
export interface BlindLevel {
    level: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
}
export declare class D1PlayerRepository implements IPlayerRepository {
    private db;
    constructor(db: D1Database);
    findById(id: string): Promise<Player | null>;
    findByUsername(username: string): Promise<Player | null>;
    findByEmail(email: string): Promise<Player | null>;
    create(player: Omit<Player, 'id'>): Promise<Player>;
    update(id: string, updates: Partial<Player>): Promise<Player>;
    delete(id: string): Promise<void>;
    private mapRowToPlayer;
}
export declare class D1GameRepository implements IGameRepository {
    private db;
    constructor(db: D1Database);
    findById(id: string): Promise<GameState | null>;
    create(gameState: GameState): Promise<GameState>;
    update(id: string, updates: Partial<GameState>): Promise<GameState>;
    findByTableId(tableId: string): Promise<GameState[]>;
    delete(id: string): Promise<void>;
    private mapRowToGameState;
}
export declare class D1TournamentRepository implements ITournamentRepository {
    private db;
    constructor(db: D1Database);
    findById(id: string): Promise<Tournament | null>;
    create(tournament: Omit<Tournament, 'id'>): Promise<Tournament>;
    update(id: string, updates: Partial<Tournament>): Promise<Tournament>;
    findActive(): Promise<Tournament[]>;
    delete(id: string): Promise<void>;
    private mapRowToTournament;
}
export declare class R2HandHistoryStorage {
    private bucket;
    constructor(bucket: R2Bucket);
    storeHandHistory(gameId: string, handNumber: number, handData: any): Promise<void>;
    getHandHistory(gameId: string, handNumber: number): Promise<any | null>;
    getGameHandHistory(gameId: string): Promise<any[]>;
    deleteHandHistory(gameId: string, handNumber?: number): Promise<void>;
}
export declare class KVSessionStore {
    private kv;
    constructor(kv: KVNamespace);
    createSession(userId: string, sessionData: any, ttl?: number): Promise<string>;
    getSession(sessionId: string): Promise<any | null>;
    updateSession(sessionId: string, updates: any, ttl?: number): Promise<void>;
    deleteSession(sessionId: string): Promise<void>;
    getUserSessions(userId: string): Promise<string[]>;
}
//# sourceMappingURL=repositories.d.ts.map