import { z } from 'zod';

// Basic poker types
export enum Suit {
  HEARTS = 'hearts',
  DIAMONDS = 'diamonds',
  CLUBS = 'clubs',
  SPADES = 'spades',
}

export enum Rank {
  TWO = '2',
  THREE = '3',
  FOUR = '4',
  FIVE = '5',
  SIX = '6',
  SEVEN = '7',
  EIGHT = '8',
  NINE = '9',
  TEN = '10',
  JACK = 'J',
  QUEEN = 'Q',
  KING = 'K',
  ACE = 'A',
}

export enum GameType {
  TEXAS_HOLDEM = 'texas_holdem',
  OMAHA = 'omaha',
  OMAHA_HI_LO = 'omaha_hi_lo',
  SEVEN_CARD_STUD = '7_card_stud',
  SEVEN_CARD_STUD_HI_LO = '7_card_stud_hi_lo',
}

export enum BettingStructure {
  LIMIT = 'limit',
  NO_LIMIT = 'no_limit',
  POT_LIMIT = 'pot_limit',
}

export enum GameFormat {
  CASH = 'cash',
  TOURNAMENT = 'tournament',
  SIT_N_GO = 'sit_n_go',
  HEADS_UP = 'heads_up',
}

export enum PlayerAction {
  FOLD = 'fold',
  CHECK = 'check',
  CALL = 'call',
  BET = 'bet',
  RAISE = 'raise',
  ALL_IN = 'all_in',
}

export enum GamePhase {
  WAITING = 'waiting',
  PRE_FLOP = 'pre_flop',
  FLOP = 'flop',
  TURN = 'turn',
  RIVER = 'river',
  SHOWDOWN = 'showdown',
  FINISHED = 'finished',
}

export enum HandRanking {
  HIGH_CARD = 0,
  PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9,
}

export enum TournamentState {
  REGISTERING = 'registering',
  STARTING = 'starting',
  IN_PROGRESS = 'in_progress',
  FINAL_TABLE = 'final_table',
  FINISHED = 'finished',
  CANCELLED = 'cancelled',
}

export enum PlayerStatus {
  ACTIVE = 'active',
  SITTING_OUT = 'sitting_out',
  AWAY = 'away',
  DISCONNECTED = 'disconnected',
  ELIMINATED = 'eliminated',
  FOLDED = 'folded',
  ALL_IN = 'all_in',
  WAITING = 'waiting',
  PLAYING = 'playing',
}

// Zod schemas for runtime validation
export const CardSchema = z.object({
  suit: z.nativeEnum(Suit),
  rank: z.nativeEnum(Rank),
});

export const ChipSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('USD'),
});

export const BetSchema = z.object({
  playerId: z.string().uuid(),
  action: z.nativeEnum(PlayerAction),
  amount: z.number().nonnegative(),
  timestamp: z.date(),
});

export const PositionSchema = z.object({
  seat: z.number().int().min(0).max(9),
  isButton: z.boolean().default(false),
  isSmallBlind: z.boolean().default(false),
  isBigBlind: z.boolean().default(false),
});

export const TableConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  gameType: z.nativeEnum(GameType),
  bettingStructure: z.nativeEnum(BettingStructure),
  gameFormat: z.nativeEnum(GameFormat),
  maxPlayers: z.number().int().min(2).max(10),
  minBuyIn: z.number().positive(),
  maxBuyIn: z.number().positive(),
  smallBlind: z.number().positive(),
  bigBlind: z.number().positive(),
  ante: z.number().nonnegative().default(0),
  timeBank: z.number().int().positive().default(30),
  isPrivate: z.boolean().default(false),
  password: z.string().optional(),
});

export const PlayerSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(20),
  email: z.string().email(),
  chipCount: z.number().nonnegative(),
  position: PositionSchema.optional(),
  status: z.nativeEnum(PlayerStatus),
  isDealer: z.boolean().default(false),
  timeBank: z.number().int().nonnegative().default(30),
  lastAction: z.date().optional(),
});

// Extended player interface for runtime game state
export interface GamePlayer extends z.infer<typeof PlayerSchema> {
  chips: number // Runtime chip count (can differ from chipCount)
  currentBet: number // Current bet in this round
  hasActed: boolean // Has acted in current betting round
  isFolded: boolean // Has folded this hand
  isAllIn: boolean // Is all-in this hand
  cards?: Card[] // Hole cards (server-side only)
}

export const GameStateSchema = z.object({
  tableId: z.string().uuid(),
  gameId: z.string().uuid(),
  phase: z.nativeEnum(GamePhase),
  pot: z.number().nonnegative(),
  sidePots: z.array(z.number().nonnegative()).default([]),
  communityCards: z.array(CardSchema).max(5),
  currentBet: z.number().nonnegative(),
  minRaise: z.number().positive(),
  activePlayerId: z.string().uuid().optional(),
  dealerId: z.string().uuid(),
  smallBlindId: z.string().uuid(),
  bigBlindId: z.string().uuid(),
  handNumber: z.number().int().positive(),
  timestamp: z.date(),
});

// Type exports
export type Card = z.infer<typeof CardSchema>;
export type Chip = z.infer<typeof ChipSchema>;
export type Bet = z.infer<typeof BetSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type TableConfig = z.infer<typeof TableConfigSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type GameState = z.infer<typeof GameStateSchema>;

// Result types
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

// Event types
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

// Wallet and Buy-in Management
export interface PlayerWallet {
  playerId: string;
  balance: number;
  currency: string;
  frozen: number; // Amount locked in active games
  lastUpdated: Date;
}

export interface BuyInOptions {
  tableId: string;
  minBuyIn: number;
  maxBuyIn: number;
  recommendedBuyIn: number;
  currency: string;
  smallBlind: number;
  bigBlind: number;
}

export interface BuyInRequest {
  tableId: string;
  playerId: string;
  amount: number;
  seatNumber?: number; // Optional preferred seat
}

export interface BuyInResponse {
  success: boolean;
  error?: string;
  seatNumber?: number;
  chipCount?: number;
  walletBalance?: number;
}

export interface SeatSelection {
  seatNumber: number;
  isOccupied: boolean;
  playerId?: string;
  playerName?: string;
  chipCount?: number;
  isActive?: boolean;
}

export interface TableSeats {
  tableId: string;
  maxSeats: number;
  seats: SeatSelection[];
  availableSeats: number[];
}

// Table interface
export interface Table {
  id: string;
  config: TableConfig;
  players: Map<string, Player>;
  gameState: GameState | null;
  game: any | null; // PokerGame interface
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
  buyInOptions: BuyInOptions;
}

// Lobby management interfaces for Phase 3B.3
export interface TableFilters {
  gameType?: 'cash' | 'tournament' | 'sit-n-go'
  minStakes?: number
  maxStakes?: number
  minPlayers?: number
  maxPlayers?: number
  hasSeatsAvailable?: boolean
  isPrivate?: boolean
  searchTerm?: string
}

export interface TableListing {
  tableId: string
  name: string
  gameType: 'cash' | 'tournament' | 'sit-n-go'
  stakes: { smallBlind: number, bigBlind: number }
  currentPlayers: number
  maxPlayers: number
  isPrivate: boolean
  requiresPassword: boolean
  avgPot: number
  handsPerHour: number
  waitingList: number
  playerList: PublicPlayerInfo[]
  createdAt: number
  lastActivity: number
  status: 'waiting' | 'active' | 'finishing'
}

export interface PublicPlayerInfo {
  playerId: string
  username: string
  chipCount: number
  isActive: boolean
  avatarUrl?: string
  countryCode?: string
}

export interface LobbyTableConfig {
  name: string
  gameType: 'cash' | 'tournament' | 'sit-n-go'
  maxPlayers: number
  stakes: { smallBlind: number, bigBlind: number }
  isPrivate: boolean
  password?: string
  buyInMin?: number
  buyInMax?: number
  timeLimit?: number
  autoStart?: boolean
}

export interface LobbyJoinResult {
  success: boolean
  tableId?: string
  seatNumber?: number
  chipCount?: number
  error?: string
  waitingListPosition?: number
}

export interface ReservationResult {
  success: boolean
  reservationId?: string
  expiresAt?: number
  error?: string
}

export interface TableStats {
  totalHands: number
  avgPotSize: number
  handsPerHour: number
  playerTurnover: number
  biggestPot: number
  currentStreaks: {
    playerId: string
    type: 'winning' | 'losing'
    count: number
  }[]
}

// API Response types
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

// WebSocket message types
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

// Error types
export class PokerError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'PokerError';
  }
}

export class GameRuleError extends PokerError {
  constructor(message: string, details?: unknown) {
    super('GAME_RULE_ERROR', message, details);
    this.name = 'GameRuleError';
  }
}

export class InsufficientFundsError extends PokerError {
  constructor(required: number, available: number) {
    super(
      'INSUFFICIENT_FUNDS',
      `Insufficient funds: required ${required}, available ${available}`,
      { required, available }
    );
    this.name = 'InsufficientFundsError';
  }
}

export class InvalidActionError extends PokerError {
  constructor(action: string, phase: GamePhase) {
    super(
      'INVALID_ACTION',
      `Invalid action ${action} in phase ${phase}`,
      { action, phase }
    );
    this.name = 'InvalidActionError';
  }
}

export class TableFullError extends PokerError {
  constructor(tableId: string) {
    super('TABLE_FULL', `Table ${tableId} is full`, { tableId });
    this.name = 'TableFullError';
  }
}

export class PlayerNotFoundError extends PokerError {
  constructor(playerId: string) {
    super('PLAYER_NOT_FOUND', `Player ${playerId} not found`, { playerId });
    this.name = 'PlayerNotFoundError';
  }
}

// Wallet and Buy-in types
export interface PlayerWallet {
  playerId: string;
  balance: number;
  currency: string;
  frozen: number;
  lastUpdated: Date;
}


export interface SeatSelection {
  seatNumber: number;
  isOccupied: boolean;
  playerId?: string;
  playerName?: string;
  chipCount?: number;
  isActive?: boolean;
}

export interface TableSeats {
  tableId: string;
  maxSeats: number;
  seats: SeatSelection[];
  availableSeats: number[];
}
