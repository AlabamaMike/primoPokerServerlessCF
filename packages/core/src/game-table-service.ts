import {
  GameState,
  Player,
  PlayerAction,
  GamePhase,
  GameEventType,
  TableConfig,
  Card,
  Pot,
} from '@primo-poker/shared';
import { PokerGame } from './poker-game';
import { OptimizedBettingEngine, BettingContext } from './betting-engine-optimized';
import { GameStateSyncOptimizer } from './state-sync-optimized';
import { DeckManager } from './deck-manager';
import { HandEvaluator, HandRank } from './hand-evaluator';
import {
  GameError,
  PlayerError,
  ErrorCode,
  createErrorHandler,
} from '@primo-poker/shared/src/error-handling';

export interface GameTableServiceConfig {
  tableConfig: TableConfig;
  onStateChange?: (state: GameState, event: GameEventType) => void;
  onError?: (error: Error) => void;
}

export interface GameEvent {
  type: GameEventType;
  playerId?: string;
  data?: any;
  timestamp: number;
}

export class GameTableService {
  private game: PokerGame;
  private bettingEngine: OptimizedBettingEngine;
  private syncOptimizer: GameStateSyncOptimizer;
  private deckManager: DeckManager;
  private handEvaluator: HandEvaluator;
  private tableConfig: TableConfig;
  private eventHistory: GameEvent[] = [];
  private stateChangeCallback?: (state: GameState, event: GameEventType) => void;
  private errorHandler: ReturnType<typeof createErrorHandler>;

  constructor(config: GameTableServiceConfig) {
    this.tableConfig = config.tableConfig;
    this.game = new PokerGame({
      smallBlind: config.tableConfig.smallBlind,
      bigBlind: config.tableConfig.bigBlind,
      maxPlayers: config.tableConfig.maxSeats,
    });
    
    this.bettingEngine = new OptimizedBettingEngine();
    this.syncOptimizer = new GameStateSyncOptimizer();
    this.deckManager = new DeckManager();
    this.handEvaluator = new HandEvaluator();
    this.stateChangeCallback = config.onStateChange;
    this.errorHandler = createErrorHandler({
      onError: config.onError,
    });
  }

  async addPlayer(playerId: string, seatNumber: number, buyIn: number): Promise<void> {
    try {
      if (buyIn < this.tableConfig.minBuyIn || buyIn > this.tableConfig.maxBuyIn) {
        throw new GameError(
          `Buy-in must be between ${this.tableConfig.minBuyIn} and ${this.tableConfig.maxBuyIn}`,
          ErrorCode.VALIDATION_FAILED
        );
      }

      this.game.addPlayer({
        id: playerId,
        name: playerId,
        chips: buyIn,
        position: seatNumber,
      });

      this.recordEvent({
        type: GameEventType.PLAYER_JOINED,
        playerId,
        data: { seatNumber, buyIn },
      });

      this.notifyStateChange(GameEventType.PLAYER_JOINED);
    } catch (error) {
      await this.errorHandler(error as Error);
      throw error;
    }
  }

  async removePlayer(playerId: string): Promise<void> {
    try {
      const player = this.game.getPlayer(playerId);
      if (!player) {
        throw new PlayerError(`Player ${playerId} not found`, ErrorCode.PLAYER_NOT_FOUND);
      }

      if (this.game.getGameState().phase !== GamePhase.WAITING && !player.folded) {
        player.folded = true;
      }

      this.game.removePlayer(playerId);

      this.recordEvent({
        type: GameEventType.PLAYER_LEFT,
        playerId,
      });

      this.notifyStateChange(GameEventType.PLAYER_LEFT);

      if (this.shouldEndGame()) {
        await this.endGame();
      }
    } catch (error) {
      await this.errorHandler(error as Error);
      throw error;
    }
  }

  async startGame(): Promise<void> {
    try {
      const state = this.game.getGameState();
      
      if (state.phase !== GamePhase.WAITING) {
        throw new GameError(
          'Game has already started',
          ErrorCode.GAME_ALREADY_STARTED
        );
      }

      if (state.players.length < 2) {
        throw new GameError(
          'Need at least 2 players to start',
          ErrorCode.VALIDATION_FAILED
        );
      }

      this.game.startNewHand();
      
      this.recordEvent({
        type: GameEventType.GAME_STARTED,
        data: { handNumber: state.handNumber },
      });

      this.notifyStateChange(GameEventType.GAME_STARTED);

      await this.dealCards();
      await this.postBlinds();
    } catch (error) {
      await this.errorHandler(error as Error);
      throw error;
    }
  }

  async handlePlayerAction(playerId: string, action: PlayerAction): Promise<void> {
    try {
      const state = this.game.getGameState();
      const player = this.game.getPlayer(playerId);

      if (!player) {
        throw new PlayerError(
          `Player ${playerId} not at table`,
          ErrorCode.PLAYER_NOT_AT_TABLE
        );
      }

      if (state.currentTurn !== player.position) {
        throw new PlayerError(
          'Not your turn',
          ErrorCode.PLAYER_NOT_IN_TURN
        );
      }

      const context: BettingContext = {
        players: state.players,
        currentBet: state.currentBet,
        totalPot: state.totalPot,
        phase: state.phase,
        smallBlind: this.tableConfig.smallBlind,
        bigBlind: this.tableConfig.bigBlind,
        currentPlayerIndex: state.currentTurn,
      };

      const result = this.bettingEngine.executeAction(action, player, context);

      this.game.updatePlayer(result.updatedPlayer);
      this.game.updateCurrentBet(result.updatedCurrentBet);
      this.game.addToPot(result.potContribution);

      this.recordEvent({
        type: GameEventType.ACTION_PERFORMED,
        playerId,
        data: { action, contribution: result.potContribution },
      });

      this.notifyStateChange(GameEventType.ACTION_PERFORMED);

      if (this.shouldMoveToNextPhase()) {
        await this.moveToNextPhase();
      } else {
        this.moveToNextPlayer();
      }
    } catch (error) {
      await this.errorHandler(error as Error);
      throw error;
    }
  }

  getGameState(): GameState {
    return this.game.getGameState();
  }

  getPlayerView(playerId: string): GameState {
    const state = this.game.getGameState();
    return this.syncOptimizer.getPlayerSpecificView(state, playerId);
  }

  getAvailableActions(playerId: string): PlayerAction[] {
    const state = this.game.getGameState();
    const player = this.game.getPlayer(playerId);

    if (!player || state.currentTurn !== player.position) {
      return [];
    }

    const context: BettingContext = {
      players: state.players,
      currentBet: state.currentBet,
      totalPot: state.totalPot,
      phase: state.phase,
      smallBlind: this.tableConfig.smallBlind,
      bigBlind: this.tableConfig.bigBlind,
      currentPlayerIndex: state.currentTurn,
    };

    const actionTypes = this.bettingEngine.getAvailableActions(player, context);
    
    return actionTypes.map(type => ({
      playerId,
      type,
      amount: undefined,
    }));
  }

  getTableConfig(): TableConfig {
    return { ...this.tableConfig };
  }

  getEventHistory(limit = 100): GameEvent[] {
    return this.eventHistory.slice(-limit);
  }

  private async dealCards(): Promise<void> {
    const state = this.game.getGameState();
    const deck = this.deckManager.createShuffledDeck();

    state.players.forEach((player, index) => {
      if (!player.folded) {
        const hand: Card[] = [
          deck[index * 2],
          deck[index * 2 + 1],
        ];
        this.game.updatePlayer({
          ...player,
          hand,
        });
      }
    });

    this.recordEvent({
      type: GameEventType.CARDS_DEALT,
      data: { phase: GamePhase.PRE_FLOP },
    });

    this.notifyStateChange(GameEventType.CARDS_DEALT);
  }

  private async postBlinds(): Promise<void> {
    const state = this.game.getGameState();
    const smallBlindPlayer = state.players[state.smallBlindPosition];
    const bigBlindPlayer = state.players[state.bigBlindPosition];

    if (smallBlindPlayer) {
      const sbAmount = Math.min(smallBlindPlayer.chips, this.tableConfig.smallBlind);
      this.game.updatePlayer({
        ...smallBlindPlayer,
        chips: smallBlindPlayer.chips - sbAmount,
        currentBet: sbAmount,
        totalBet: sbAmount,
      });
      this.game.addToPot(sbAmount);
    }

    if (bigBlindPlayer) {
      const bbAmount = Math.min(bigBlindPlayer.chips, this.tableConfig.bigBlind);
      this.game.updatePlayer({
        ...bigBlindPlayer,
        chips: bigBlindPlayer.chips - bbAmount,
        currentBet: bbAmount,
        totalBet: bbAmount,
      });
      this.game.addToPot(bbAmount);
      this.game.updateCurrentBet(bbAmount);
    }

    this.recordEvent({
      type: GameEventType.BLINDS_POSTED,
      data: { 
        smallBlind: this.tableConfig.smallBlind,
        bigBlind: this.tableConfig.bigBlind,
      },
    });

    this.notifyStateChange(GameEventType.BLINDS_POSTED);
  }

  private async moveToNextPhase(): Promise<void> {
    const state = this.game.getGameState();
    const nextPhase = this.getNextPhase(state.phase);

    if (nextPhase === GamePhase.SHOWDOWN) {
      await this.handleShowdown();
      return;
    }

    this.game.moveToPhase(nextPhase);
    this.resetBettingRound();

    if (nextPhase !== GamePhase.PRE_FLOP) {
      await this.dealCommunityCards(nextPhase);
    }

    this.recordEvent({
      type: GameEventType.NEW_BETTING_ROUND,
      data: { phase: nextPhase },
    });

    this.notifyStateChange(GameEventType.NEW_BETTING_ROUND);
  }

  private async dealCommunityCards(phase: GamePhase): Promise<void> {
    const state = this.game.getGameState();
    const deck = this.deckManager.getLastDeck();
    
    if (!deck) {
      throw new GameError('No deck available', ErrorCode.INTERNAL_ERROR);
    }

    const startIndex = state.players.length * 2;
    let newCards: Card[] = [];

    switch (phase) {
      case GamePhase.FLOP:
        newCards = deck.slice(startIndex + 1, startIndex + 4);
        break;
      case GamePhase.TURN:
        newCards = [deck[startIndex + 5]];
        break;
      case GamePhase.RIVER:
        newCards = [deck[startIndex + 7]];
        break;
    }

    this.game.addCommunityCards(newCards);

    this.recordEvent({
      type: GameEventType.COMMUNITY_CARDS_DEALT,
      data: { cards: newCards, phase },
    });

    this.notifyStateChange(GameEventType.COMMUNITY_CARDS_DEALT);
  }

  private async handleShowdown(): Promise<void> {
    const state = this.game.getGameState();
    const activePlayers = state.players.filter(p => !p.folded);

    if (activePlayers.length === 0) {
      await this.endGame();
      return;
    }

    const playerHands = activePlayers.map(player => ({
      player,
      hand: player.hand!,
      rank: this.handEvaluator.evaluateHand([
        ...player.hand!,
        ...state.communityCards,
      ]),
    }));

    playerHands.sort((a, b) => b.rank.rank - a.rank.rank);

    const winners = this.determineWinners(playerHands, state.pots);

    this.distributeWinnings(winners);

    this.recordEvent({
      type: GameEventType.HAND_COMPLETED,
      data: { winners },
    });

    this.notifyStateChange(GameEventType.HAND_COMPLETED);

    await this.prepareNextHand();
  }

  private determineWinners(
    playerHands: Array<{ player: Player; hand: Card[]; rank: HandRank }>,
    pots: Pot[]
  ): Map<string, number> {
    const winnings = new Map<string, number>();

    for (const pot of pots) {
      const eligibleHands = playerHands.filter(
        ph => pot.eligiblePlayerIds.includes(ph.player.id)
      );

      if (eligibleHands.length === 0) continue;

      const bestRank = Math.max(...eligibleHands.map(ph => ph.rank.rank));
      const winners = eligibleHands.filter(ph => ph.rank.rank === bestRank);

      const winAmount = Math.floor(pot.amount / winners.length);
      
      winners.forEach(winner => {
        const current = winnings.get(winner.player.id) || 0;
        winnings.set(winner.player.id, current + winAmount);
      });
    }

    return winnings;
  }

  private distributeWinnings(winners: Map<string, number>): void {
    winners.forEach((amount, playerId) => {
      const player = this.game.getPlayer(playerId);
      if (player) {
        this.game.updatePlayer({
          ...player,
          chips: player.chips + amount,
        });
      }
    });
  }

  private async prepareNextHand(): Promise<void> {
    const state = this.game.getGameState();
    
    if (state.players.filter(p => p.chips > 0).length < 2) {
      await this.endGame();
      return;
    }

    setTimeout(() => {
      this.game.startNewHand();
      this.notifyStateChange(GameEventType.NEW_HAND_STARTING);
      this.startGame();
    }, 5000);
  }

  private async endGame(): Promise<void> {
    this.game.endGame();
    
    this.recordEvent({
      type: GameEventType.GAME_ENDED,
      data: { reason: 'Not enough players' },
    });

    this.notifyStateChange(GameEventType.GAME_ENDED);
  }

  private shouldMoveToNextPhase(): boolean {
    const state = this.game.getGameState();
    const activePlayers = state.players.filter(p => !p.folded);
    
    if (activePlayers.length <= 1) {
      return true;
    }

    const playersToAct = activePlayers.filter(
      p => !p.isAllIn && p.currentBet < state.currentBet
    );

    return playersToAct.length === 0 && this.allPlayersActed();
  }

  private allPlayersActed(): boolean {
    const state = this.game.getGameState();
    return state.players
      .filter(p => !p.folded && !p.isAllIn)
      .every(p => p.lastAction !== undefined);
  }

  private shouldEndGame(): boolean {
    const state = this.game.getGameState();
    const activePlayers = state.players.filter(p => p.chips > 0);
    return activePlayers.length < 2;
  }

  private getNextPhase(currentPhase: GamePhase): GamePhase {
    const phaseOrder = [
      GamePhase.PRE_FLOP,
      GamePhase.FLOP,
      GamePhase.TURN,
      GamePhase.RIVER,
      GamePhase.SHOWDOWN,
    ];

    const currentIndex = phaseOrder.indexOf(currentPhase);
    return phaseOrder[currentIndex + 1] || GamePhase.SHOWDOWN;
  }

  private moveToNextPlayer(): void {
    const state = this.game.getGameState();
    const activePlayers = state.players.filter(p => !p.folded && !p.isAllIn);
    
    if (activePlayers.length === 0) return;

    let nextPosition = (state.currentTurn + 1) % state.players.length;
    
    while (state.players[nextPosition].folded || state.players[nextPosition].isAllIn) {
      nextPosition = (nextPosition + 1) % state.players.length;
    }

    this.game.setCurrentTurn(nextPosition);
  }

  private resetBettingRound(): void {
    const state = this.game.getGameState();
    
    state.players.forEach(player => {
      if (!player.folded) {
        this.game.updatePlayer({
          ...player,
          currentBet: 0,
          lastAction: undefined,
        });
      }
    });

    this.game.updateCurrentBet(0);
    
    const firstToAct = this.getFirstToAct();
    this.game.setCurrentTurn(firstToAct);
  }

  private getFirstToAct(): number {
    const state = this.game.getGameState();
    const startPosition = state.phase === GamePhase.PRE_FLOP
      ? (state.bigBlindPosition + 1) % state.players.length
      : (state.dealerPosition + 1) % state.players.length;

    let position = startPosition;
    
    while (state.players[position].folded || state.players[position].isAllIn) {
      position = (position + 1) % state.players.length;
      if (position === startPosition) break;
    }

    return position;
  }

  private recordEvent(event: Omit<GameEvent, 'timestamp'>): void {
    this.eventHistory.push({
      ...event,
      timestamp: Date.now(),
    });

    if (this.eventHistory.length > 1000) {
      this.eventHistory = this.eventHistory.slice(-500);
    }
  }

  private notifyStateChange(eventType: GameEventType): void {
    if (this.stateChangeCallback) {
      const state = this.game.getGameState();
      const optimizedUpdate = this.syncOptimizer.optimizeGameState(state);
      this.stateChangeCallback(state, eventType);
    }
  }
}