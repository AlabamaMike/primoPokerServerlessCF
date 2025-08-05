/**
 * Game state validator for poker engine testing
 */

import { TestLogger } from './logger';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface GameStateValidation {
  players: any[];
  pot: number;
  currentBet: number;
  phase: string;
  buttonPosition: number;
  activePlayerIndex?: number;
  communityCards?: string[];
  sidePots?: any[];
}

export class GameValidator {
  private logger: TestLogger;

  constructor(logger: TestLogger) {
    this.logger = logger;
  }

  /**
   * Validate complete game state
   */
  validateGameState(state: GameStateValidation): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Validate players
    this.validatePlayers(state, result);

    // Validate pot
    this.validatePot(state, result);

    // Validate button position
    this.validateButton(state, result);

    // Validate game phase
    this.validatePhase(state, result);

    // Validate betting
    this.validateBetting(state, result);

    // Log validation results
    if (result.errors.length > 0) {
      result.valid = false;
      this.logger.error('Game state validation failed:', new Error(result.errors.join(', ')));
    }

    if (result.warnings.length > 0) {
      this.logger.detailed('Validation warnings:', result.warnings.join(', '));
    }

    return result;
  }

  /**
   * Validate blind posting
   */
  validateBlinds(
    players: any[],
    buttonPosition: number,
    smallBlind: number,
    bigBlind: number
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    const activePlayers = players.filter(p => p.status === 'active' && !p.isSittingOut);
    
    if (activePlayers.length < 2) {
      result.errors.push('Not enough active players for blinds');
      result.valid = false;
      return result;
    }

    // Find blind positions
    const sbPosition = this.getSmallBlindPosition(buttonPosition, activePlayers);
    const bbPosition = this.getBigBlindPosition(buttonPosition, activePlayers);

    const sbPlayer = activePlayers.find(p => (typeof p.position === 'object' ? p.position.seat : p.position) === sbPosition);
    const bbPlayer = activePlayers.find(p => (typeof p.position === 'object' ? p.position.seat : p.position) === bbPosition);

    // Validate small blind
    if (!sbPlayer) {
      result.errors.push(`No player at small blind position ${sbPosition}`);
    } else if (sbPlayer.currentBet < smallBlind && sbPlayer.chipCount > 0) {
      result.errors.push(`Small blind not posted correctly: expected ${smallBlind}, got ${sbPlayer.currentBet}`);
    }

    // Validate big blind
    if (!bbPlayer) {
      result.errors.push(`No player at big blind position ${bbPosition}`);
    } else if (bbPlayer.currentBet < bigBlind && bbPlayer.chipCount > 0) {
      result.errors.push(`Big blind not posted correctly: expected ${bigBlind}, got ${bbPlayer.currentBet}`);
    }

    result.valid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate button movement
   */
  validateButtonMovement(
    previousButton: number,
    currentButton: number,
    activePlayers: any[]
  ): boolean {
    // Sort players by position
    const sortedPlayers = [...activePlayers].sort((a, b) => {
      const aPos = typeof a.position === 'object' ? a.position.seat : a.position;
      const bPos = typeof b.position === 'object' ? b.position.seat : b.position;
      return aPos - bPos;
    });
    
    // Find previous button player index
    const prevIndex = sortedPlayers.findIndex(p => (typeof p.position === 'object' ? p.position.seat : p.position) === previousButton);
    if (prevIndex === -1) {
      this.logger.error(`Previous button position ${previousButton} not found`);
      return false;
    }

    // Expected next button is the next active player
    const expectedIndex = (prevIndex + 1) % sortedPlayers.length;
    const expectedPlayer = sortedPlayers[expectedIndex];
    const expectedButton = typeof expectedPlayer.position === 'object' ? expectedPlayer.position.seat : expectedPlayer.position;

    if (currentButton !== expectedButton) {
      this.logger.error(`Button movement incorrect: expected ${expectedButton}, got ${currentButton}`);
      return false;
    }

    return true;
  }

  /**
   * Validate action order
   */
  validateActionOrder(
    players: any[],
    phase: string,
    buttonPosition: number,
    lastAction?: { playerId: string; action: string }
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    const activePlayers = players.filter(p => 
      p.status === 'active' && !p.isFolded && p.chipCount > 0
    );

    if (activePlayers.length < 2) {
      // Game should be over
      if (phase !== 'finished') {
        result.errors.push('Game should be finished with less than 2 active players');
      }
      return result;
    }

    // Determine expected action order based on phase
    let expectedOrder: number[];
    
    if (phase === 'pre_flop') {
      // Pre-flop: UTG acts first (position after BB)
      const bbPosition = this.getBigBlindPosition(buttonPosition, players);
      expectedOrder = this.getActionOrder(bbPosition, activePlayers);
    } else {
      // Post-flop: SB acts first (or first active player after button)
      expectedOrder = this.getActionOrder(buttonPosition, activePlayers);
    }

    // Validate last action if provided
    if (lastAction) {
      const actingPlayer = players.find(p => p.id === lastAction.playerId);
      if (!actingPlayer) {
        result.errors.push(`Acting player ${lastAction.playerId} not found`);
      } else if (actingPlayer.status !== 'active') {
        result.errors.push(`Inactive player ${lastAction.playerId} took action`);
      }
    }

    result.valid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate pot calculation
   */
  validatePotCalculation(players: any[], mainPot: number, sidePots: any[] = []): boolean {
    let totalBets = 0;
    
    // Sum all player bets
    for (const player of players) {
      totalBets += player.totalBetAmount || 0;
    }

    // Sum all pots
    let totalPots = mainPot;
    for (const sidePot of sidePots) {
      totalPots += sidePot.amount || 0;
    }

    // They should match (allowing small rounding differences)
    const difference = Math.abs(totalBets - totalPots);
    if (difference > 1) {
      this.logger.error(`Pot calculation mismatch: bets=${totalBets}, pots=${totalPots}`);
      return false;
    }

    return true;
  }

  // Private helper methods

  private validatePlayers(state: GameStateValidation, result: ValidationResult) {
    if (!state.players || state.players.length === 0) {
      result.errors.push('No players in game state');
      return;
    }

    const positions = new Set<number>();
    const playerIds = new Set<string>();

    for (const player of state.players) {
      // Check for duplicate positions
      const playerPosition = typeof player.position === 'object' ? player.position.seat : player.position;
      if (positions.has(playerPosition)) {
        result.errors.push(`Duplicate position ${playerPosition}`);
      }
      positions.add(playerPosition);

      // Check for duplicate IDs
      if (playerIds.has(player.id)) {
        result.errors.push(`Duplicate player ID ${player.id}`);
      }
      playerIds.add(player.id);

      // Validate player state
      if (player.chipCount < 0) {
        result.errors.push(`Player ${player.id} has negative chips: ${player.chipCount}`);
      }

      if (player.currentBet < 0) {
        result.errors.push(`Player ${player.id} has negative bet: ${player.currentBet}`);
      }
    }
  }

  private validatePot(state: GameStateValidation, result: ValidationResult) {
    if (state.pot < 0) {
      result.errors.push(`Negative pot: ${state.pot}`);
    }

    // Validate pot against player bets
    const totalBets = state.players.reduce((sum, p) => sum + (p.currentBet || 0), 0);
    if (state.phase !== 'waiting' && totalBets > 0 && state.pot === 0) {
      result.warnings.push('Pot is zero but players have bets');
    }
  }

  private validateButton(state: GameStateValidation, result: ValidationResult) {
    const activePlayerSeats = state.players
      .filter(p => p.status === 'active')
      .map(p => typeof p.position === 'object' ? p.position.seat : p.position);

    if (activePlayerSeats.length > 0 && !activePlayerSeats.includes(state.buttonPosition)) {
      result.errors.push(`Button position ${state.buttonPosition} not held by active player`);
    }
  }

  private validatePhase(state: GameStateValidation, result: ValidationResult) {
    const validPhases = ['waiting', 'pre_flop', 'flop', 'turn', 'river', 'showdown', 'finished'];
    
    if (!validPhases.includes(state.phase)) {
      result.errors.push(`Invalid game phase: ${state.phase}`);
    }

    // Validate community cards match phase
    const expectedCards = {
      'waiting': 0,
      'pre_flop': 0,
      'flop': 3,
      'turn': 4,
      'river': 5,
      'showdown': 5,
      'finished': -1, // Can be any
    };

    const cardCount = state.communityCards?.length || 0;
    const expected = expectedCards[state.phase as keyof typeof expectedCards];
    
    if (expected !== -1 && cardCount !== expected) {
      result.errors.push(`Phase ${state.phase} should have ${expected} community cards, has ${cardCount}`);
    }
  }

  private validateBetting(state: GameStateValidation, result: ValidationResult) {
    const activePlayers = state.players.filter(p => 
      p.status === 'active' && !p.isFolded
    );

    if (activePlayers.length === 0) {
      return;
    }

    // Check if all active players have equal bets (or are all-in)
    const maxBet = Math.max(...activePlayers.map(p => p.currentBet || 0));
    
    for (const player of activePlayers) {
      if (player.chipCount > 0 && player.currentBet < maxBet && !player.hasActed) {
        result.warnings.push(`Player ${player.id} has unequal bet: ${player.currentBet} vs ${maxBet}`);
      }
    }

    // Validate current bet
    if (state.currentBet < maxBet) {
      result.errors.push(`Current bet ${state.currentBet} is less than max player bet ${maxBet}`);
    }
  }

  private getSmallBlindPosition(buttonPosition: number, players: any[]): number {
    const activePlayers = players
      .filter(p => p.status === 'active')
      .sort((a, b) => {
        const aPos = typeof a.position === 'object' ? a.position.seat : a.position;
        const bPos = typeof b.position === 'object' ? b.position.seat : b.position;
        return aPos - bPos;
      });

    if (activePlayers.length === 2) {
      // Heads up: button is small blind
      return buttonPosition;
    }

    // Find next active player after button
    const buttonIndex = activePlayers.findIndex(p => (typeof p.position === 'object' ? p.position.seat : p.position) === buttonPosition);
    const sbIndex = (buttonIndex + 1) % activePlayers.length;
    const sbPlayer = activePlayers[sbIndex];
    return typeof sbPlayer.position === 'object' ? sbPlayer.position.seat : sbPlayer.position;
  }

  private getBigBlindPosition(buttonPosition: number, players: any[]): number {
    const activePlayers = players
      .filter(p => p.status === 'active')
      .sort((a, b) => {
        const aPos = typeof a.position === 'object' ? a.position.seat : a.position;
        const bPos = typeof b.position === 'object' ? b.position.seat : b.position;
        return aPos - bPos;
      });

    if (activePlayers.length === 2) {
      // Heads up: other player is big blind
      const buttonIndex = activePlayers.findIndex(p => (typeof p.position === 'object' ? p.position.seat : p.position) === buttonPosition);
      const bbIndex = (buttonIndex + 1) % activePlayers.length;
      const bbPlayer = activePlayers[bbIndex];
      return typeof bbPlayer.position === 'object' ? bbPlayer.position.seat : bbPlayer.position;
    }

    // Find second active player after button
    const buttonIndex = activePlayers.findIndex(p => (typeof p.position === 'object' ? p.position.seat : p.position) === buttonPosition);
    const bbIndex = (buttonIndex + 2) % activePlayers.length;
    const bbPlayer = activePlayers[bbIndex];
    return typeof bbPlayer.position === 'object' ? bbPlayer.position.seat : bbPlayer.position;
  }

  private getActionOrder(afterPosition: number, activePlayers: any[]): number[] {
    const sorted = [...activePlayers].sort((a, b) => {
      const aPos = typeof a.position === 'object' ? a.position.seat : a.position;
      const bPos = typeof b.position === 'object' ? b.position.seat : b.position;
      return aPos - bPos;
    });
    const startIndex = sorted.findIndex(p => (typeof p.position === 'object' ? p.position.seat : p.position) === afterPosition);
    
    const order: number[] = [];
    for (let i = 1; i <= sorted.length; i++) {
      const index = (startIndex + i) % sorted.length;
      const player = sorted[index];
      order.push(typeof player.position === 'object' ? player.position.seat : player.position);
    }
    
    return order;
  }
}