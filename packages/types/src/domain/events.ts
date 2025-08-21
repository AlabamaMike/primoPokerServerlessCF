import { Player } from './player';
import { PlayerAction, ShowdownResult } from './game';
import { TournamentResult } from './tournament';

/**
 * Domain event types for event sourcing
 */

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

export interface PlayerJoinedTableEvent extends DomainEvent {
  type: 'PlayerJoinedTable';
  data: {
    tableId: string;
    playerId: string;
    seatNumber: number;
    chipCount: number;
  };
}

export interface PlayerLeftTableEvent extends DomainEvent {
  type: 'PlayerLeftTable';
  data: {
    tableId: string;
    playerId: string;
    reason: 'voluntary' | 'timeout' | 'insufficient_funds' | 'kicked';
  };
}

export interface TournamentStartedEvent extends DomainEvent {
  type: 'TournamentStarted';
  data: {
    tournamentId: string;
    registeredPlayers: number;
    prizePool: number;
  };
}

export interface TournamentFinishedEvent extends DomainEvent {
  type: 'TournamentFinished';
  data: TournamentResult;
}

export interface BlindLevelChangedEvent extends DomainEvent {
  type: 'BlindLevelChanged';
  data: {
    tournamentId: string;
    level: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
  };
}

/**
 * Event type union
 */

export type PokerDomainEvent = 
  | GameStartedEvent
  | BetPlacedEvent
  | HandCompletedEvent
  | PlayerJoinedTableEvent
  | PlayerLeftTableEvent
  | TournamentStartedEvent
  | TournamentFinishedEvent
  | BlindLevelChangedEvent;