import { z } from 'zod';
import { GameType, BettingStructure, GameFormat, GameState } from './game';
import { Player, PublicPlayerInfo } from './player';

/**
 * Table-related types and schemas
 */

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

export type TableConfig = z.infer<typeof TableConfigSchema>;

/**
 * Table interfaces
 */

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
  seatNumber?: number;
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

export interface JoinResult {
  success: boolean;
  error?: string;
  position?: {
    seat: number;
    isButton: boolean;
    isSmallBlind: boolean;
    isBigBlind: boolean;
  };
  tableState?: GameState;
}

/**
 * Lobby types
 */

export interface TableFilters {
  gameType?: 'cash' | 'tournament' | 'sit-n-go';
  minStakes?: number;
  maxStakes?: number;
  minPlayers?: number;
  maxPlayers?: number;
  hasSeatsAvailable?: boolean;
  isPrivate?: boolean;
  searchTerm?: string;
}

export interface TableListing {
  tableId: string;
  name: string;
  gameType: 'cash' | 'tournament' | 'sit-n-go';
  stakes: { smallBlind: number; bigBlind: number };
  currentPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  requiresPassword: boolean;
  avgPot: number;
  handsPerHour: number;
  waitingList: number;
  playerList: PublicPlayerInfo[];
  createdAt: number;
  lastActivity: number;
  status: 'waiting' | 'active' | 'finishing';
}

export interface LobbyTableConfig {
  name: string;
  gameType: 'cash' | 'tournament' | 'sit-n-go';
  maxPlayers: number;
  stakes: { smallBlind: number; bigBlind: number };
  isPrivate: boolean;
  password?: string;
  buyInMin?: number;
  buyInMax?: number;
  timeLimit?: number;
  autoStart?: boolean;
}

export interface LobbyJoinResult {
  success: boolean;
  tableId?: string;
  seatNumber?: number;
  chipCount?: number;
  error?: string;
  waitingListPosition?: number;
}

export interface ReservationResult {
  success: boolean;
  reservationId?: string;
  expiresAt?: number;
  error?: string;
}

export interface TableStats {
  totalHands: number;
  avgPotSize: number;
  handsPerHour: number;
  playerTurnover: number;
  biggestPot: number;
  currentStreaks: {
    playerId: string;
    type: 'winning' | 'losing';
    count: number;
  }[];
}