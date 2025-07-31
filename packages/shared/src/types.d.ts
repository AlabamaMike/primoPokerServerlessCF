import { z } from 'zod';
export declare enum Suit {
    HEARTS = "hearts",
    DIAMONDS = "diamonds",
    CLUBS = "clubs",
    SPADES = "spades"
}
export declare enum Rank {
    TWO = "2",
    THREE = "3",
    FOUR = "4",
    FIVE = "5",
    SIX = "6",
    SEVEN = "7",
    EIGHT = "8",
    NINE = "9",
    TEN = "10",
    JACK = "J",
    QUEEN = "Q",
    KING = "K",
    ACE = "A"
}
export declare enum GameType {
    TEXAS_HOLDEM = "texas_holdem",
    OMAHA = "omaha",
    OMAHA_HI_LO = "omaha_hi_lo",
    SEVEN_CARD_STUD = "7_card_stud",
    SEVEN_CARD_STUD_HI_LO = "7_card_stud_hi_lo"
}
export declare enum BettingStructure {
    LIMIT = "limit",
    NO_LIMIT = "no_limit",
    POT_LIMIT = "pot_limit"
}
export declare enum GameFormat {
    CASH = "cash",
    TOURNAMENT = "tournament",
    SIT_N_GO = "sit_n_go",
    HEADS_UP = "heads_up"
}
export declare enum PlayerAction {
    FOLD = "fold",
    CHECK = "check",
    CALL = "call",
    BET = "bet",
    RAISE = "raise",
    ALL_IN = "all_in"
}
export declare enum GamePhase {
    WAITING = "waiting",
    PRE_FLOP = "pre_flop",
    FLOP = "flop",
    TURN = "turn",
    RIVER = "river",
    SHOWDOWN = "showdown",
    FINISHED = "finished"
}
export declare enum HandRanking {
    HIGH_CARD = 0,
    PAIR = 1,
    TWO_PAIR = 2,
    THREE_OF_A_KIND = 3,
    STRAIGHT = 4,
    FLUSH = 5,
    FULL_HOUSE = 6,
    FOUR_OF_A_KIND = 7,
    STRAIGHT_FLUSH = 8,
    ROYAL_FLUSH = 9
}
export declare enum TournamentState {
    REGISTERING = "registering",
    STARTING = "starting",
    IN_PROGRESS = "in_progress",
    FINAL_TABLE = "final_table",
    FINISHED = "finished",
    CANCELLED = "cancelled"
}
export declare enum PlayerStatus {
    ACTIVE = "active",
    SITTING_OUT = "sitting_out",
    AWAY = "away",
    DISCONNECTED = "disconnected",
    ELIMINATED = "eliminated"
}
export declare const CardSchema: z.ZodObject<{
    suit: z.ZodNativeEnum<typeof Suit>;
    rank: z.ZodNativeEnum<typeof Rank>;
}, "strip", z.ZodTypeAny, {
    suit: Suit;
    rank: Rank;
}, {
    suit: Suit;
    rank: Rank;
}>;
export declare const ChipSchema: z.ZodObject<{
    amount: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    amount: number;
    currency: string;
}, {
    amount: number;
    currency?: string | undefined;
}>;
export declare const BetSchema: z.ZodObject<{
    playerId: z.ZodString;
    action: z.ZodNativeEnum<typeof PlayerAction>;
    amount: z.ZodNumber;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    amount: number;
    playerId: string;
    action: PlayerAction;
    timestamp: Date;
}, {
    amount: number;
    playerId: string;
    action: PlayerAction;
    timestamp: Date;
}>;
export declare const PositionSchema: z.ZodObject<{
    seat: z.ZodNumber;
    isButton: z.ZodDefault<z.ZodBoolean>;
    isSmallBlind: z.ZodDefault<z.ZodBoolean>;
    isBigBlind: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    seat: number;
    isButton: boolean;
    isSmallBlind: boolean;
    isBigBlind: boolean;
}, {
    seat: number;
    isButton?: boolean | undefined;
    isSmallBlind?: boolean | undefined;
    isBigBlind?: boolean | undefined;
}>;
export declare const TableConfigSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    gameType: z.ZodNativeEnum<typeof GameType>;
    bettingStructure: z.ZodNativeEnum<typeof BettingStructure>;
    gameFormat: z.ZodNativeEnum<typeof GameFormat>;
    maxPlayers: z.ZodNumber;
    minBuyIn: z.ZodNumber;
    maxBuyIn: z.ZodNumber;
    smallBlind: z.ZodNumber;
    bigBlind: z.ZodNumber;
    ante: z.ZodDefault<z.ZodNumber>;
    timeBank: z.ZodDefault<z.ZodNumber>;
    isPrivate: z.ZodDefault<z.ZodBoolean>;
    password: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    gameType: GameType;
    bettingStructure: BettingStructure;
    gameFormat: GameFormat;
    maxPlayers: number;
    minBuyIn: number;
    maxBuyIn: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    timeBank: number;
    isPrivate: boolean;
    password?: string | undefined;
}, {
    id: string;
    name: string;
    gameType: GameType;
    bettingStructure: BettingStructure;
    gameFormat: GameFormat;
    maxPlayers: number;
    minBuyIn: number;
    maxBuyIn: number;
    smallBlind: number;
    bigBlind: number;
    ante?: number | undefined;
    timeBank?: number | undefined;
    isPrivate?: boolean | undefined;
    password?: string | undefined;
}>;
export declare const PlayerSchema: z.ZodObject<{
    id: z.ZodString;
    username: z.ZodString;
    email: z.ZodString;
    chipCount: z.ZodNumber;
    position: z.ZodOptional<z.ZodObject<{
        seat: z.ZodNumber;
        isButton: z.ZodDefault<z.ZodBoolean>;
        isSmallBlind: z.ZodDefault<z.ZodBoolean>;
        isBigBlind: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        seat: number;
        isButton: boolean;
        isSmallBlind: boolean;
        isBigBlind: boolean;
    }, {
        seat: number;
        isButton?: boolean | undefined;
        isSmallBlind?: boolean | undefined;
        isBigBlind?: boolean | undefined;
    }>>;
    status: z.ZodNativeEnum<typeof PlayerStatus>;
    isDealer: z.ZodDefault<z.ZodBoolean>;
    timeBank: z.ZodDefault<z.ZodNumber>;
    lastAction: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    status: PlayerStatus;
    id: string;
    timeBank: number;
    username: string;
    email: string;
    chipCount: number;
    isDealer: boolean;
    position?: {
        seat: number;
        isButton: boolean;
        isSmallBlind: boolean;
        isBigBlind: boolean;
    } | undefined;
    lastAction?: Date | undefined;
}, {
    status: PlayerStatus;
    id: string;
    username: string;
    email: string;
    chipCount: number;
    timeBank?: number | undefined;
    position?: {
        seat: number;
        isButton?: boolean | undefined;
        isSmallBlind?: boolean | undefined;
        isBigBlind?: boolean | undefined;
    } | undefined;
    isDealer?: boolean | undefined;
    lastAction?: Date | undefined;
}>;
export declare const GameStateSchema: z.ZodObject<{
    tableId: z.ZodString;
    gameId: z.ZodString;
    phase: z.ZodNativeEnum<typeof GamePhase>;
    pot: z.ZodNumber;
    sidePots: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
    communityCards: z.ZodArray<z.ZodObject<{
        suit: z.ZodNativeEnum<typeof Suit>;
        rank: z.ZodNativeEnum<typeof Rank>;
    }, "strip", z.ZodTypeAny, {
        suit: Suit;
        rank: Rank;
    }, {
        suit: Suit;
        rank: Rank;
    }>, "many">;
    currentBet: z.ZodNumber;
    minRaise: z.ZodNumber;
    activePlayerId: z.ZodOptional<z.ZodString>;
    dealerId: z.ZodString;
    smallBlindId: z.ZodString;
    bigBlindId: z.ZodString;
    handNumber: z.ZodNumber;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    timestamp: Date;
    tableId: string;
    gameId: string;
    phase: GamePhase;
    pot: number;
    sidePots: number[];
    communityCards: {
        suit: Suit;
        rank: Rank;
    }[];
    currentBet: number;
    minRaise: number;
    dealerId: string;
    smallBlindId: string;
    bigBlindId: string;
    handNumber: number;
    activePlayerId?: string | undefined;
}, {
    timestamp: Date;
    tableId: string;
    gameId: string;
    phase: GamePhase;
    pot: number;
    communityCards: {
        suit: Suit;
        rank: Rank;
    }[];
    currentBet: number;
    minRaise: number;
    dealerId: string;
    smallBlindId: string;
    bigBlindId: string;
    handNumber: number;
    sidePots?: number[] | undefined;
    activePlayerId?: string | undefined;
}>;
export type Card = z.infer<typeof CardSchema>;
export type Chip = z.infer<typeof ChipSchema>;
export type Bet = z.infer<typeof BetSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type TableConfig = z.infer<typeof TableConfigSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
export interface BetResult {
    success: boolean;
    error?: string;
    newGameState?: GameState;
    playerChips?: number;
}
export interface JoinResult {
    success: boolean;
    error?: string;
    position?: Position;
    tableState?: GameState;
}
export interface ShowdownResult {
    winners: Array<{
        playerId: string;
        hand: Card[];
        handRanking: HandRanking;
        winAmount: number;
    }>;
    sidePotWinners?: Array<{
        playerId: string;
        potIndex: number;
        winAmount: number;
    }>;
}
export interface DomainEvent {
    id: string;
    type: string;
    aggregateId: string;
    version: number;
    timestamp: Date;
    data: unknown;
}
export interface GameStartedEvent extends DomainEvent {
    type: 'GameStarted';
    data: {
        tableId: string;
        gameId: string;
        players: Player[];
        dealerId: string;
    };
}
export interface BetPlacedEvent extends DomainEvent {
    type: 'BetPlaced';
    data: {
        gameId: string;
        playerId: string;
        action: PlayerAction;
        amount: number;
        newPot: number;
    };
}
export interface HandCompletedEvent extends DomainEvent {
    type: 'HandCompleted';
    data: {
        gameId: string;
        winners: ShowdownResult['winners'];
        finalPot: number;
        handNumber: number;
    };
}
export interface TournamentFinishedEvent extends DomainEvent {
    type: 'TournamentFinished';
    data: {
        tournamentId: string;
        winner: Player;
        finalTable: Player[];
        prizePool: number;
    };
}
export interface Table {
    id: string;
    config: TableConfig;
    players: Map<string, Player>;
    gameState: GameState | null;
    game: any | null;
    createdAt: Date;
    lastActivity: Date;
    isActive: boolean;
}
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    timestamp: string;
}
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface WebSocketMessage {
    type: string;
    payload: unknown;
    timestamp: string;
}
export interface GameUpdateMessage extends WebSocketMessage {
    type: 'game_update';
    payload: GameState;
}
export interface PlayerActionMessage extends WebSocketMessage {
    type: 'player_action';
    payload: {
        playerId: string;
        action: PlayerAction;
        amount?: number;
    };
}
export interface ChatMessage extends WebSocketMessage {
    type: 'chat';
    payload: {
        playerId: string;
        username: string;
        message: string;
        isSystem: boolean;
    };
}
export declare class PokerError extends Error {
    code: string;
    details?: unknown | undefined;
    constructor(code: string, message: string, details?: unknown | undefined);
}
export declare class GameRuleError extends PokerError {
    constructor(message: string, details?: unknown);
}
export declare class InsufficientFundsError extends PokerError {
    constructor(required: number, available: number);
}
export declare class InvalidActionError extends PokerError {
    constructor(action: string, phase: GamePhase);
}
export declare class TableFullError extends PokerError {
    constructor(tableId: string);
}
export declare class PlayerNotFoundError extends PokerError {
    constructor(playerId: string);
}
//# sourceMappingURL=types.d.ts.map