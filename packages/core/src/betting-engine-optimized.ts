import { 
  GamePlayer, 
  PlayerAction, 
  GamePhase
} from '@primo-poker/shared';
import { 
  ValidationError, 
  PlayerError, 
  GameError,
  ErrorCode 
} from '@primo-poker/shared';
import { SidePot } from './betting-engine';

export interface ValidationResult {
  valid: boolean;
  error?: Error;
  minBet?: number;
  maxBet?: number;
  callAmount?: number;
}

// Using SidePot from betting-engine.ts
export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface PlayerActionData {
  type: PlayerAction;
  amount?: number;
}

export interface BettingContext {
  players: GamePlayer[];
  currentBet: number;
  totalPot: number;
  phase: GamePhase;
  smallBlind: number;
  bigBlind: number;
  currentPlayerIndex: number;
}

export interface ActionValidator {
  validate(
    action: PlayerActionData,
    player: GamePlayer,
    context: BettingContext
  ): ValidationResult;
}

export class FoldValidator implements ActionValidator {
  validate(action: PlayerActionData, player: GamePlayer, context: BettingContext): ValidationResult {
    if (player.isFolded) {
      return {
        valid: false,
        error: new PlayerError('GamePlayer has already folded', ErrorCode.ACTION_NOT_ALLOWED),
      };
    }
    return { valid: true };
  }
}

export class CheckValidator implements ActionValidator {
  validate(
    action: PlayerActionData,
    player: GamePlayer,
    context: BettingContext
  ): ValidationResult {
    const callAmount = Math.max(0, context.currentBet - player.currentBet);
    
    if (callAmount > 0) {
      return {
        valid: false,
        error: new ValidationError(
          `Cannot check when call amount is ${callAmount}`,
          ErrorCode.ACTION_NOT_ALLOWED
        ),
        callAmount,
      };
    }
    
    return { valid: true };
  }
}

export class CallValidator implements ActionValidator {
  validate(
    action: PlayerActionData,
    player: GamePlayer,
    context: BettingContext
  ): ValidationResult {
    const callAmount = Math.max(0, context.currentBet - player.currentBet);
    
    if (callAmount === 0) {
      return {
        valid: false,
        error: new ValidationError(
          'Nothing to call',
          ErrorCode.ACTION_NOT_ALLOWED
        ),
      };
    }
    
    if (callAmount > player.chips) {
      return {
        valid: false,
        error: new PlayerError(
          `Insufficient chips. Need ${callAmount}, have ${player.chips}`,
          ErrorCode.PLAYER_INSUFFICIENT_FUNDS
        ),
        callAmount,
      };
    }
    
    return { valid: true, callAmount };
  }
}

export class BetValidator implements ActionValidator {
  validate(
    action: PlayerActionData,
    player: GamePlayer,
    context: BettingContext
  ): ValidationResult {
    if (!action.amount || action.amount <= 0) {
      return {
        valid: false,
        error: new ValidationError(
          'Bet amount must be positive',
          ErrorCode.BET_INVALID_AMOUNT
        ),
      };
    }

    if (context.currentBet > 0) {
      return {
        valid: false,
        error: new ValidationError(
          'Cannot bet when there is already a bet. Use raise instead',
          ErrorCode.ACTION_NOT_ALLOWED
        ),
      };
    }

    const minBet = context.bigBlind;
    const maxBet = player.chips;

    if (action.amount < minBet) {
      return {
        valid: false,
        error: new ValidationError(
          `Bet must be at least ${minBet}`,
          ErrorCode.BET_BELOW_MINIMUM
        ),
        minBet,
        maxBet,
      };
    }

    if (action.amount > maxBet) {
      return {
        valid: false,
        error: new PlayerError(
          `Insufficient chips. Maximum bet is ${maxBet}`,
          ErrorCode.PLAYER_INSUFFICIENT_FUNDS
        ),
        minBet,
        maxBet,
      };
    }

    return { valid: true, minBet, maxBet };
  }
}

export class RaiseValidator implements ActionValidator {
  private raiseCache = new Map<string, ValidationResult>();

  private getCacheKey(
    playerId: string,
    amount: number,
    currentBet: number,
    playerChips: number
  ): string {
    return `${playerId}-${amount}-${currentBet}-${playerChips}`;
  }

  validate(
    action: PlayerActionData,
    player: GamePlayer,
    context: BettingContext
  ): ValidationResult {
    const cacheKey = this.getCacheKey(
      player.id,
      action.amount || 0,
      context.currentBet,
      player.chips
    );

    const cached = this.raiseCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = this.performValidation(action, player, context);
    this.raiseCache.set(cacheKey, result);

    if (this.raiseCache.size > 1000) {
      // Remove 10% of the cache when it's full
      const keysToRemove = Math.floor(this.raiseCache.size * 0.1);
      const keys = Array.from(this.raiseCache.keys());
      for (let i = 0; i < keysToRemove; i++) {
        this.raiseCache.delete(keys[i]);
      }
    }

    return result;
  }

  private performValidation(
    action: PlayerActionData,
    player: GamePlayer,
    context: BettingContext
  ): ValidationResult {
    if (!action.amount || action.amount <= 0) {
      return {
        valid: false,
        error: new ValidationError(
          'Raise amount must be positive',
          ErrorCode.BET_INVALID_AMOUNT
        ),
      };
    }

    if (context.currentBet === 0) {
      return {
        valid: false,
        error: new ValidationError(
          'Cannot raise when there is no bet. Use bet instead',
          ErrorCode.ACTION_NOT_ALLOWED
        ),
      };
    }

    const callAmount = context.currentBet - player.currentBet;
    const totalRequired = action.amount;
    const raiseAmount = totalRequired - context.currentBet;
    const minRaise = context.bigBlind;
    const minTotal = context.currentBet + minRaise;
    const maxTotal = player.chips + player.currentBet;

    if (raiseAmount < minRaise) {
      return {
        valid: false,
        error: new ValidationError(
          `Minimum raise is ${minRaise}. Total must be at least ${minTotal}`,
          ErrorCode.BET_BELOW_MINIMUM
        ),
        minBet: minTotal,
        maxBet: maxTotal,
      };
    }

    if (totalRequired > maxTotal) {
      return {
        valid: false,
        error: new PlayerError(
          `Insufficient chips. Maximum total is ${maxTotal}`,
          ErrorCode.PLAYER_INSUFFICIENT_FUNDS
        ),
        minBet: minTotal,
        maxBet: maxTotal,
      };
    }

    return { valid: true, minBet: minTotal, maxBet: maxTotal };
  }

  clearCache(): void {
    this.raiseCache.clear();
  }
}

export class AllInValidator implements ActionValidator {
  validate(
    action: PlayerActionData,
    player: GamePlayer,
    context: BettingContext
  ): ValidationResult {
    if (player.chips <= 0) {
      return {
        valid: false,
        error: new PlayerError(
          'No chips to go all-in',
          ErrorCode.PLAYER_INSUFFICIENT_FUNDS
        ),
      };
    }

    return { valid: true };
  }
}

export class OptimizedBettingEngine {
  private validators: Map<PlayerAction, ActionValidator>;
  private potCalculator: PotCalculator;
  private validationCache = new Map<string, ValidationResult>();

  constructor() {
    this.validators = new Map([
      [PlayerAction.FOLD, new FoldValidator()],
      [PlayerAction.CHECK, new CheckValidator()],
      [PlayerAction.CALL, new CallValidator()],
      [PlayerAction.BET, new BetValidator()],
      [PlayerAction.RAISE, new RaiseValidator()],
      [PlayerAction.ALL_IN, new AllInValidator()],
    ]);
    
    this.potCalculator = new PotCalculator();
  }

  validateAction(
    action: PlayerActionData,
    player: GamePlayer,
    context: BettingContext
  ): ValidationResult {
    const validator = this.validators.get(action.type);
    
    if (!validator) {
      return {
        valid: false,
        error: new ValidationError(
          `Unknown action type: ${action.type}`,
          ErrorCode.ACTION_INVALID
        ),
      };
    }

    if (player.isFolded) {
      return {
        valid: false,
        error: new PlayerError(
          'GamePlayer has already folded',
          ErrorCode.ACTION_NOT_ALLOWED
        ),
      };
    }

    const cacheKey = this.getCacheKey(action, player.id, context);
    const cached = this.validationCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = validator.validate(action, player, context);
    this.validationCache.set(cacheKey, result);

    if (this.validationCache.size > 5000) {
      // Remove 10% of the cache when it's full
      const keysToRemove = Math.floor(this.validationCache.size * 0.1);
      const keys = Array.from(this.validationCache.keys());
      for (let i = 0; i < keysToRemove; i++) {
        this.validationCache.delete(keys[i]);
      }
    }

    return result;
  }

  private getCacheKey(
    action: PlayerActionData,
    playerId: string,
    context: BettingContext
  ): string {
    return `${action.type}-${action.amount || 0}-${playerId}-${context.currentBet}-${context.phase}`;
  }

  executeAction(
    action: PlayerActionData,
    player: GamePlayer,
    context: BettingContext
  ): {
    updatedGamePlayer: GamePlayer;
    updatedCurrentBet: number;
    potContribution: number;
  } {
    const validation = this.validateAction(action, player, context);
    if (!validation.valid) {
      throw validation.error!;
    }

    const updatedGamePlayer = { ...player };
    let updatedCurrentBet = context.currentBet;
    let potContribution = 0;

    switch (action.type) {
      case PlayerAction.FOLD:
        updatedGamePlayer.isFolded = true;
        break;

      case PlayerAction.CHECK:
        break;

      case PlayerAction.CALL:
        const callAmount = validation.callAmount!;
        updatedGamePlayer.chips -= callAmount;
        updatedGamePlayer.currentBet += callAmount;
        potContribution = callAmount;
        break;

      case PlayerAction.BET:
        updatedGamePlayer.chips -= action.amount!;
        updatedGamePlayer.currentBet = action.amount!;
        updatedCurrentBet = action.amount!;
        potContribution = action.amount!;
        break;

      case PlayerAction.RAISE:
        const raiseCallAmount = context.currentBet - updatedGamePlayer.currentBet;
        const raiseTotalAmount = action.amount! - updatedGamePlayer.currentBet;
        updatedGamePlayer.chips -= raiseTotalAmount;
        updatedGamePlayer.currentBet = action.amount!;
        updatedCurrentBet = action.amount!;
        potContribution = raiseTotalAmount;
        break;

      case PlayerAction.ALL_IN:
        potContribution = updatedGamePlayer.chips;
        updatedGamePlayer.currentBet += updatedGamePlayer.chips;
        updatedGamePlayer.chips = 0;
        updatedGamePlayer.isAllIn = true;
        if (updatedGamePlayer.currentBet > updatedCurrentBet) {
          updatedCurrentBet = updatedGamePlayer.currentBet;
        }
        break;
    }

    updatedGamePlayer.lastAction = action.type;

    return {
      updatedGamePlayer,
      updatedCurrentBet,
      potContribution,
    };
  }

  calculatePots(players: GamePlayer[], mainPotAmount: number): Pot[] {
    return this.potCalculator.calculatePots(players, mainPotAmount);
  }

  getAvailableActions(
    player: GamePlayer,
    context: BettingContext
  ): PlayerAction[] {
    if (player.isFolded) {
      return [];
    }

    const actions: PlayerAction[] = [PlayerAction.FOLD];
    const callAmount = context.currentBet - player.currentBet;

    if (callAmount === 0) {
      actions.push(PlayerAction.CHECK);
      if (player.chips > 0) {
        actions.push(PlayerAction.BET);
      }
    } else {
      if (player.chips >= callAmount) {
        actions.push(PlayerAction.CALL);
      }
      if (player.chips > callAmount) {
        actions.push(PlayerAction.RAISE);
      }
    }

    if (player.chips > 0) {
      actions.push(PlayerAction.ALL_IN);
    }

    return actions;
  }

  clearCache(): void {
    this.validationCache.clear();
    const raiseValidator = this.validators.get(PlayerAction.RAISE) as RaiseValidator;
    if (raiseValidator) {
      raiseValidator.clearCache();
    }
  }
}

export class PotCalculator {
  private potCache = new Map<string, Pot[]>();

  private getCacheKey(players: GamePlayer[]): string {
    return players
      .map(p => `${p.id}:${p.currentBet}:${p.isFolded}`)
      .sort()
      .join('|');
  }

  calculatePots(players: GamePlayer[], mainPotAmount: number): Pot[] {
    const cacheKey = this.getCacheKey(players);
    const cached = this.potCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pots = this.performCalculation(players, mainPotAmount);
    this.potCache.set(cacheKey, pots);

    if (this.potCache.size > 100) {
      const firstKey = this.potCache.keys().next().value;
      this.potCache.delete(firstKey);
    }

    return pots;
  }

  private performCalculation(players: GamePlayer[], mainPotAmount: number): Pot[] {
    const activeGamePlayers = players.filter(p => !p.isFolded || p.currentBet > 0);
    
    if (activeGamePlayers.length === 0) {
      return [{ amount: mainPotAmount, eligiblePlayerIds: [] }];
    }

    const sortedGamePlayers = [...activeGamePlayers].sort((a, b) => a.currentBet - b.currentBet);
    const pots: Pot[] = [];
    let previousBet = 0;

    for (let i = 0; i < sortedGamePlayers.length; i++) {
      const currentGamePlayer = sortedGamePlayers[i];
      const betLevel = currentGamePlayer.totalBet;
      
      if (betLevel > previousBet) {
        const eligibleGamePlayers = sortedGamePlayers
          .slice(i)
          .filter(p => !p.isFolded)
          .map(p => p.id);
        
        if (eligibleGamePlayers.length > 0) {
          const potAmount = (betLevel - previousBet) * (sortedGamePlayers.length - i);
          pots.push({
            amount: potAmount,
            eligibleGamePlayerIds: eligibleGamePlayers,
          });
        }
        
        previousBet = betLevel;
      }
    }

    return this.consolidatePots(pots);
  }

  private consolidatePots(pots: Pot[]): Pot[] {
    const consolidated: Pot[] = [];
    
    for (const pot of pots) {
      const existing = consolidated.find(
        p => JSON.stringify(p.eligibleGamePlayerIds.sort()) === 
             JSON.stringify(pot.eligibleGamePlayerIds.sort())
      );
      
      if (existing) {
        existing.amount += pot.amount;
      } else {
        consolidated.push({
          amount: pot.amount,
          eligibleGamePlayerIds: [...pot.eligibleGamePlayerIds],
        });
      }
    }

    return consolidated;
  }

  clearCache(): void {
    this.potCache.clear();
  }
}