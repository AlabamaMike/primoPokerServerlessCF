import { 
  Player, 
  PlayerAction, 
  PlayerActionType, 
  GamePhase,
  Pot
} from '@primo-poker/shared';
import { 
  ValidationError, 
  PlayerError, 
  GameError,
  ErrorCode 
} from '@primo-poker/shared/src/error-handling';

export interface ValidationResult {
  valid: boolean;
  error?: Error;
  minBet?: number;
  maxBet?: number;
  callAmount?: number;
}

export interface BettingContext {
  players: Player[];
  currentBet: number;
  totalPot: number;
  phase: GamePhase;
  smallBlind: number;
  bigBlind: number;
  currentPlayerIndex: number;
}

export interface ActionValidator {
  validate(
    action: PlayerAction,
    player: Player,
    context: BettingContext
  ): ValidationResult;
}

export class FoldValidator implements ActionValidator {
  validate(action: PlayerAction, player: Player): ValidationResult {
    if (player.folded) {
      return {
        valid: false,
        error: new PlayerError('Player has already folded', ErrorCode.ACTION_NOT_ALLOWED),
      };
    }
    return { valid: true };
  }
}

export class CheckValidator implements ActionValidator {
  validate(
    action: PlayerAction,
    player: Player,
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
    action: PlayerAction,
    player: Player,
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
    action: PlayerAction,
    player: Player,
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
    action: PlayerAction,
    player: Player,
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
      const firstKey = this.raiseCache.keys().next().value;
      this.raiseCache.delete(firstKey);
    }

    return result;
  }

  private performValidation(
    action: PlayerAction,
    player: Player,
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
    action: PlayerAction,
    player: Player,
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
  private validators: Map<PlayerActionType, ActionValidator>;
  private potCalculator: PotCalculator;
  private validationCache = new Map<string, ValidationResult>();

  constructor() {
    this.validators = new Map([
      [PlayerActionType.FOLD, new FoldValidator()],
      [PlayerActionType.CHECK, new CheckValidator()],
      [PlayerActionType.CALL, new CallValidator()],
      [PlayerActionType.BET, new BetValidator()],
      [PlayerActionType.RAISE, new RaiseValidator()],
      [PlayerActionType.ALL_IN, new AllInValidator()],
    ]);
    
    this.potCalculator = new PotCalculator();
  }

  validateAction(
    action: PlayerAction,
    player: Player,
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

    if (player.folded) {
      return {
        valid: false,
        error: new PlayerError(
          'Player has already folded',
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
      const firstKey = this.validationCache.keys().next().value;
      this.validationCache.delete(firstKey);
    }

    return result;
  }

  private getCacheKey(
    action: PlayerAction,
    playerId: string,
    context: BettingContext
  ): string {
    return `${action.type}-${action.amount || 0}-${playerId}-${context.currentBet}-${context.phase}`;
  }

  executeAction(
    action: PlayerAction,
    player: Player,
    context: BettingContext
  ): {
    updatedPlayer: Player;
    updatedCurrentBet: number;
    potContribution: number;
  } {
    const validation = this.validateAction(action, player, context);
    if (!validation.valid) {
      throw validation.error!;
    }

    let updatedPlayer = { ...player };
    let updatedCurrentBet = context.currentBet;
    let potContribution = 0;

    switch (action.type) {
      case PlayerActionType.FOLD:
        updatedPlayer.folded = true;
        break;

      case PlayerActionType.CHECK:
        break;

      case PlayerActionType.CALL:
        const callAmount = validation.callAmount!;
        updatedPlayer.chips -= callAmount;
        updatedPlayer.currentBet += callAmount;
        potContribution = callAmount;
        break;

      case PlayerActionType.BET:
        updatedPlayer.chips -= action.amount!;
        updatedPlayer.currentBet = action.amount!;
        updatedCurrentBet = action.amount!;
        potContribution = action.amount!;
        break;

      case PlayerActionType.RAISE:
        const raiseCallAmount = context.currentBet - updatedPlayer.currentBet;
        const raiseTotalAmount = action.amount! - updatedPlayer.currentBet;
        updatedPlayer.chips -= raiseTotalAmount;
        updatedPlayer.currentBet = action.amount!;
        updatedCurrentBet = action.amount!;
        potContribution = raiseTotalAmount;
        break;

      case PlayerActionType.ALL_IN:
        potContribution = updatedPlayer.chips;
        updatedPlayer.currentBet += updatedPlayer.chips;
        updatedPlayer.chips = 0;
        updatedPlayer.isAllIn = true;
        if (updatedPlayer.currentBet > updatedCurrentBet) {
          updatedCurrentBet = updatedPlayer.currentBet;
        }
        break;
    }

    updatedPlayer.lastAction = action.type;

    return {
      updatedPlayer,
      updatedCurrentBet,
      potContribution,
    };
  }

  calculatePots(players: Player[], mainPotAmount: number): Pot[] {
    return this.potCalculator.calculatePots(players, mainPotAmount);
  }

  getAvailableActions(
    player: Player,
    context: BettingContext
  ): PlayerActionType[] {
    if (player.folded) {
      return [];
    }

    const actions: PlayerActionType[] = [PlayerActionType.FOLD];
    const callAmount = context.currentBet - player.currentBet;

    if (callAmount === 0) {
      actions.push(PlayerActionType.CHECK);
      if (player.chips > 0) {
        actions.push(PlayerActionType.BET);
      }
    } else {
      if (player.chips >= callAmount) {
        actions.push(PlayerActionType.CALL);
      }
      if (player.chips > callAmount) {
        actions.push(PlayerActionType.RAISE);
      }
    }

    if (player.chips > 0) {
      actions.push(PlayerActionType.ALL_IN);
    }

    return actions;
  }

  clearCache(): void {
    this.validationCache.clear();
    const raiseValidator = this.validators.get(PlayerActionType.RAISE) as RaiseValidator;
    if (raiseValidator) {
      raiseValidator.clearCache();
    }
  }
}

export class PotCalculator {
  private potCache = new Map<string, Pot[]>();

  private getCacheKey(players: Player[]): string {
    return players
      .map(p => `${p.id}:${p.totalBet}:${p.folded}`)
      .sort()
      .join('|');
  }

  calculatePots(players: Player[], mainPotAmount: number): Pot[] {
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

  private performCalculation(players: Player[], mainPotAmount: number): Pot[] {
    const activePlayers = players.filter(p => !p.folded || p.totalBet > 0);
    
    if (activePlayers.length === 0) {
      return [{ amount: mainPotAmount, eligiblePlayerIds: [] }];
    }

    const sortedPlayers = [...activePlayers].sort((a, b) => a.totalBet - b.totalBet);
    const pots: Pot[] = [];
    let previousBet = 0;

    for (let i = 0; i < sortedPlayers.length; i++) {
      const currentPlayer = sortedPlayers[i];
      const betLevel = currentPlayer.totalBet;
      
      if (betLevel > previousBet) {
        const eligiblePlayers = sortedPlayers
          .slice(i)
          .filter(p => !p.folded)
          .map(p => p.id);
        
        if (eligiblePlayers.length > 0) {
          const potAmount = (betLevel - previousBet) * (sortedPlayers.length - i);
          pots.push({
            amount: potAmount,
            eligiblePlayerIds: eligiblePlayers,
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
        p => JSON.stringify(p.eligiblePlayerIds.sort()) === 
             JSON.stringify(pot.eligiblePlayerIds.sort())
      );
      
      if (existing) {
        existing.amount += pot.amount;
      } else {
        consolidated.push({
          amount: pot.amount,
          eligiblePlayerIds: [...pot.eligiblePlayerIds],
        });
      }
    }

    return consolidated;
  }

  clearCache(): void {
    this.potCache.clear();
  }
}