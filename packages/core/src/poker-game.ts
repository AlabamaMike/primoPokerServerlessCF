import {
  Card,
  Player,
  GameState,
  GamePhase,
  PlayerAction,
  PlayerStatus,
  BetResult,
  ShowdownResult,
  TableConfig,
  GameType,
  Rank,
  CardUtils,
  RandomUtils,
  PokerMath,
  GameRuleError,
  InvalidActionError,
  InsufficientFundsError,
  assertNever,
} from '@primo-poker/shared';
import { Hand, HandEvaluation } from './hand-evaluator';

export interface IPokerGame {
  dealCards(): Promise<void>;
  processBet(playerId: string, amount: number): Promise<BetResult>;
  evaluateShowdown(): Promise<ShowdownResult>;
  getGameState(): GameState;
}

export class PokerGame implements IPokerGame {
  private gameState: GameState;
  private players: Map<string, Player> = new Map();
  private deck: Card[] = [];
  private playerHands: Map<string, Card[]> = new Map();
  private currentBets: Map<string, number> = new Map();

  constructor(
    private tableConfig: TableConfig,
    initialPlayers: Player[]
  ) {
    this.gameState = this.initializeGameState(initialPlayers);
    initialPlayers.forEach(player => {
      this.players.set(player.id, player);
      this.currentBets.set(player.id, 0);
    });
  }

  private initializeGameState(players: Player[]): GameState {
    // Use crypto.getRandomValues for dealer selection
    const randomBytes = crypto.getRandomValues(new Uint32Array(1));
    const dealerIndex = (randomBytes[0] ?? 0) % players.length;
    const dealer = players[dealerIndex];
    
    const blindPositions = this.calculateBlindPositions(players, dealerIndex);
    const smallBlindPlayer = players[blindPositions.smallBlind];
    const bigBlindPlayer = players[blindPositions.bigBlind];

    return {
      tableId: this.tableConfig.id,
      gameId: RandomUtils.generateUUID(),
      phase: GamePhase.WAITING,
      pot: 0,
      sidePots: [],
      communityCards: [],
      currentBet: this.tableConfig.bigBlind,
      minRaise: this.tableConfig.bigBlind,
      activePlayerId: this.getNextActivePlayer(bigBlindPlayer?.id || ''),
      dealerId: dealer!.id,
      smallBlindId: smallBlindPlayer!.id,
      bigBlindId: bigBlindPlayer!.id,
      handNumber: 1,
      timestamp: new Date(),
    };
  }

  async dealCards(): Promise<void> {
    if (this.gameState.phase !== GamePhase.WAITING) {
      throw new GameRuleError('Cannot deal cards in current game phase');
    }

    // Create and shuffle deck
    this.deck = this.shuffleDeck(CardUtils.createDeck());
    
    // Deal hole cards based on game type
    const cardsPerPlayer = this.getCardsPerPlayer();
    for (const [playerId] of this.players) {
      const holeCards: Card[] = [];
      for (let i = 0; i < cardsPerPlayer; i++) {
        const card = this.deck.pop();
        if (!card) throw new GameRuleError('Insufficient cards in deck');
        holeCards.push(card);
      }
      this.playerHands.set(playerId, holeCards);
    }

    // Post blinds
    await this.postBlinds();
    
    this.gameState.phase = GamePhase.PRE_FLOP;
    this.gameState.timestamp = new Date();
  }

  async processBet(playerId: string, amount: number): Promise<BetResult> {
    const player = this.players.get(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    if (this.gameState.activePlayerId !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    try {
      const action = this.determineAction(amount, playerId);
      const result = await this.executeAction(playerId, action, amount);
      
      if (result.success) {
        this.advanceToNextPlayer();
        await this.checkPhaseCompletion();
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async evaluateShowdown(): Promise<ShowdownResult> {
    if (this.gameState.phase !== GamePhase.SHOWDOWN) {
      throw new GameRuleError('Cannot evaluate showdown in current phase');
    }

    const activePlayers = Array.from(this.players.values()).filter(
      player => player.status === PlayerStatus.ACTIVE
    );

    const handEvaluations: Array<{
      playerId: string;
      evaluation: HandEvaluation;
      hand: Card[];
    }> = [];

    // Evaluate each player's hand
    for (const player of activePlayers) {
      const holeCards = this.playerHands.get(player.id) || [];
      const allCards = [...holeCards, ...this.gameState.communityCards];
      const evaluation = Hand.evaluate(allCards);
      
      handEvaluations.push({
        playerId: player.id,
        evaluation,
        hand: evaluation.cards,
      });
    }

    // Sort by hand strength (best first)
    handEvaluations.sort((a, b) => 
      Hand.compareHands(a.evaluation, b.evaluation)
    );

    // Determine winners and distribute pot
    const winners = this.determineWinners(handEvaluations);
    await this.distributePot(winners);

    return {
      winners: winners.map(winner => ({
        playerId: winner.playerId,
        hand: winner.hand,
        handRanking: winner.evaluation.ranking,
        winAmount: winner.winAmount,
      })),
    };
  }

  getGameState(): GameState {
    return { ...this.gameState };
  }

  private shuffleDeck(deck: Card[]): Card[] {
    return RandomUtils.shuffleArray(deck);
  }

  private getCardsPerPlayer(): number {
    switch (this.tableConfig.gameType) {
      case GameType.TEXAS_HOLDEM:
        return 2;
      case GameType.OMAHA:
        return 4;
      case GameType.OMAHA_HI_LO:
        return 4;
      case GameType.SEVEN_CARD_STUD:
        return 2;
      case GameType.SEVEN_CARD_STUD_HI_LO:
        return 2; // Initial down cards
      default:
        return 2;
    }
  }

  private calculateBlindPositions(players: Player[], dealerIndex: number): {
    smallBlind: number;
    bigBlind: number;
  } {
    return PokerMath.calculateBlindPositions(players.length, dealerIndex);
  }

  private async postBlinds(): Promise<void> {
    const smallBlindPlayer = this.players.get(this.gameState.smallBlindId);
    const bigBlindPlayer = this.players.get(this.gameState.bigBlindId);

    if (!smallBlindPlayer || !bigBlindPlayer) {
      throw new GameRuleError('Blind players not found');
    }

    // Post small blind
    const smallBlindAmount = Math.min(
      this.tableConfig.smallBlind,
      smallBlindPlayer.chipCount
    );
    smallBlindPlayer.chipCount -= smallBlindAmount;
    this.currentBets.set(smallBlindPlayer.id, smallBlindAmount);
    this.gameState.pot += smallBlindAmount;

    // Post big blind
    const bigBlindAmount = Math.min(
      this.tableConfig.bigBlind,
      bigBlindPlayer.chipCount
    );
    bigBlindPlayer.chipCount -= bigBlindAmount;
    this.currentBets.set(bigBlindPlayer.id, bigBlindAmount);
    this.gameState.pot += bigBlindAmount;

    this.gameState.currentBet = bigBlindAmount;
  }

  private determineAction(amount: number, playerId: string): PlayerAction {
    const currentBet = this.currentBets.get(playerId) || 0;
    const callAmount = this.gameState.currentBet - currentBet;

    if (amount === 0) {
      return callAmount === 0 ? PlayerAction.CHECK : PlayerAction.FOLD;
    }

    if (amount === callAmount) {
      return PlayerAction.CALL;
    }

    if (amount > callAmount) {
      return currentBet === 0 ? PlayerAction.BET : PlayerAction.RAISE;
    }

    return PlayerAction.FOLD;
  }

  private async executeAction(
    playerId: string,
    action: PlayerAction,
    amount: number
  ): Promise<BetResult> {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    switch (action) {
      case PlayerAction.FOLD:
        player.status = PlayerStatus.SITTING_OUT;
        break;

      case PlayerAction.CHECK:
        if (this.gameState.currentBet > (this.currentBets.get(playerId) || 0)) {
          throw new InvalidActionError('Cannot check when there is a bet', this.gameState.phase);
        }
        break;

      case PlayerAction.CALL:
        const callAmount = this.gameState.currentBet - (this.currentBets.get(playerId) || 0);
        if (player.chipCount < callAmount) {
          throw new InsufficientFundsError(callAmount, player.chipCount);
        }
        player.chipCount -= callAmount;
        this.currentBets.set(playerId, this.gameState.currentBet);
        this.gameState.pot += callAmount;
        break;

      case PlayerAction.BET:
      case PlayerAction.RAISE:
        if (player.chipCount < amount) {
          throw new InsufficientFundsError(amount, player.chipCount);
        }
        
        const newBet = (this.currentBets.get(playerId) || 0) + amount;
        if (newBet < this.gameState.currentBet + this.gameState.minRaise) {
          throw new GameRuleError('Raise amount too small');
        }

        player.chipCount -= amount;
        this.currentBets.set(playerId, newBet);
        this.gameState.pot += amount;
        this.gameState.currentBet = newBet;
        this.gameState.minRaise = amount;
        break;

      case PlayerAction.ALL_IN:
        const allInAmount = player.chipCount;
        player.chipCount = 0;
        this.currentBets.set(playerId, (this.currentBets.get(playerId) || 0) + allInAmount);
        this.gameState.pot += allInAmount;
        break;
        
      default:
        // TypeScript will error if any PlayerAction is not handled above
        assertNever(action);
    }

    return {
      success: true,
      newGameState: this.getGameState(),
      playerChips: player.chipCount,
    };
  }

  private advanceToNextPlayer(): void {
    const activePlayers = Array.from(this.players.values()).filter(
      player => player.status === PlayerStatus.ACTIVE
    );

    if (activePlayers.length <= 1) {
      return;
    }

    const currentIndex = activePlayers.findIndex(
      player => player.id === this.gameState.activePlayerId
    );
    
    const nextIndex = (currentIndex + 1) % activePlayers.length;
    this.gameState.activePlayerId = activePlayers[nextIndex]?.id;
  }

  private getNextActivePlayer(currentPlayerId: string): string | undefined {
    const activePlayers = Array.from(this.players.values()).filter(
      player => player.status === PlayerStatus.ACTIVE
    );

    const currentIndex = activePlayers.findIndex(
      player => player.id === currentPlayerId
    );
    
    const nextIndex = (currentIndex + 1) % activePlayers.length;
    return activePlayers[nextIndex]?.id;
  }

  private async checkPhaseCompletion(): Promise<void> {
    const activePlayers = Array.from(this.players.values()).filter(
      player => player.status === PlayerStatus.ACTIVE
    );

    // Check if betting round is complete
    const allPlayersActed = activePlayers.every(player => {
      const playerBet = this.currentBets.get(player.id) || 0;
      return playerBet === this.gameState.currentBet || player.chipCount === 0;
    });

    if (!allPlayersActed) {
      return;
    }

    // Advance to next phase
    switch (this.gameState.phase) {
      case GamePhase.PRE_FLOP:
        await this.dealFlop();
        break;
      case GamePhase.FLOP:
        await this.dealTurn();
        break;
      case GamePhase.TURN:
        await this.dealRiver();
        break;
      case GamePhase.RIVER:
        this.gameState.phase = GamePhase.SHOWDOWN;
        break;
      case GamePhase.WAITING:
      case GamePhase.SHOWDOWN:
      case GamePhase.FINISHED:
        // These phases should not trigger dealing of community cards
        throw new GameRuleError(`Cannot deal community cards in ${this.gameState.phase} phase`);
      default:
        assertNever(this.gameState.phase);
    }

    // Reset betting for new round
    if (this.gameState.phase !== GamePhase.SHOWDOWN) {
      this.gameState.currentBet = 0;
      this.gameState.minRaise = this.tableConfig.bigBlind;
      this.currentBets.clear();
      activePlayers.forEach(player => this.currentBets.set(player.id, 0));
      
      // Set first active player after dealer
      this.gameState.activePlayerId = this.getNextActivePlayer(this.gameState.dealerId);
    }
  }

  private async dealFlop(): Promise<void> {
    // Burn one card
    this.deck.pop();
    
    // Deal three community cards
    for (let i = 0; i < 3; i++) {
      const card = this.deck.pop();
      if (!card) throw new GameRuleError('Insufficient cards for flop');
      this.gameState.communityCards.push(card);
    }
    
    this.gameState.phase = GamePhase.FLOP;
  }

  private async dealTurn(): Promise<void> {
    // Burn one card
    this.deck.pop();
    
    // Deal one community card
    const card = this.deck.pop();
    if (!card) throw new GameRuleError('Insufficient cards for turn');
    this.gameState.communityCards.push(card);
    
    this.gameState.phase = GamePhase.TURN;
  }

  private async dealRiver(): Promise<void> {
    // Burn one card
    this.deck.pop();
    
    // Deal one community card
    const card = this.deck.pop();
    if (!card) throw new GameRuleError('Insufficient cards for river');
    this.gameState.communityCards.push(card);
    
    this.gameState.phase = GamePhase.RIVER;
  }

  private determineWinners(
    handEvaluations: Array<{
      playerId: string;
      evaluation: HandEvaluation;
      hand: Card[];
    }>
  ): Array<{
    playerId: string;
    evaluation: HandEvaluation;
    hand: Card[];
    winAmount: number;
  }> {
    const winners: Array<{
      playerId: string;
      evaluation: HandEvaluation;
      hand: Card[];
      winAmount: number;
    }> = [];

    if (handEvaluations.length === 0) {
      return winners;
    }

    // Find all hands that tie for the best
    const bestHand = handEvaluations[0];
    const tiedHands = handEvaluations.filter(hand => 
      Hand.compareHands(hand.evaluation, bestHand!.evaluation) === 0
    );

    // Split pot among winners
    const winAmount = Math.floor(this.gameState.pot / tiedHands.length);
    
    tiedHands.forEach(hand => {
      winners.push({
        ...hand,
        winAmount,
      });
    });

    return winners;
  }

  private async distributePot(
    winners: Array<{
      playerId: string;
      evaluation: HandEvaluation;
      hand: Card[];
      winAmount: number;
    }>
  ): Promise<void> {
    for (const winner of winners) {
      const player = this.players.get(winner.playerId);
      if (player) {
        player.chipCount += winner.winAmount;
      }
    }

    this.gameState.pot = 0;
    this.gameState.phase = GamePhase.FINISHED;
  }
}
