import { GamePhase } from './game';

/**
 * Custom error classes for the poker domain
 */

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

export class InvalidBetError extends PokerError {
  constructor(message: string, details?: { minBet?: number; maxBet?: number; playerChips?: number }) {
    super('INVALID_BET', message, details);
    this.name = 'InvalidBetError';
  }
}

export class GameNotActiveError extends PokerError {
  constructor(gameId: string) {
    super('GAME_NOT_ACTIVE', `Game ${gameId} is not active`, { gameId });
    this.name = 'GameNotActiveError';
  }
}

export class NotPlayerTurnError extends PokerError {
  constructor(playerId: string, activePlayerId: string) {
    super(
      'NOT_PLAYER_TURN',
      `It's not player ${playerId}'s turn. Active player: ${activePlayerId}`,
      { playerId, activePlayerId }
    );
    this.name = 'NotPlayerTurnError';
  }
}

export class TournamentError extends PokerError {
  constructor(message: string, details?: unknown) {
    super('TOURNAMENT_ERROR', message, details);
    this.name = 'TournamentError';
  }
}

export class RegistrationClosedError extends TournamentError {
  constructor(tournamentId: string) {
    super(`Registration is closed for tournament ${tournamentId}`, { tournamentId });
    this.name = 'RegistrationClosedError';
  }
}

export class TournamentFullError extends TournamentError {
  constructor(tournamentId: string, maxPlayers: number) {
    super(`Tournament ${tournamentId} is full (max: ${maxPlayers})`, { tournamentId, maxPlayers });
    this.name = 'TournamentFullError';
  }
}

export class DuplicateRegistrationError extends TournamentError {
  constructor(tournamentId: string, playerId: string) {
    super(`Player ${playerId} is already registered for tournament ${tournamentId}`, { tournamentId, playerId });
    this.name = 'DuplicateRegistrationError';
  }
}