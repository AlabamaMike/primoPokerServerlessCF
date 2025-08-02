/**
 * Secure Deck Manager
 * 
 * Replaces the existing DeckManager with cryptographically secure operations.
 * Integrates with SecureRNG Durable Object for all random operations.
 */

import { Card, Suit, Rank } from '@primo-poker/shared';
import { DeckCommitment, DeckReveal } from '@primo-poker/security';

export interface SecureDeck {
  cards: Card[];
  commitment?: DeckCommitment;
  shuffleHistory: ShuffleRecord[];
  isCommitted: boolean;
  isRevealed: boolean;
}

export interface ShuffleRecord {
  timestamp: number;
  originalHash: string;
  shuffledHash: string;
  entropyUsed: number;
  algorithm: string;
}

export interface DealResult {
  cards: Card[];
  remainingCards: number;
  dealRecord: DealRecord;
}

export interface DealRecord {
  timestamp: number;
  cardsDealt: number;
  dealType: string;
  gamePhase: string;
  deckHash: string;
}

export interface SecureDeckOperations {
  createDeck(): Promise<SecureDeck>;
  commitDeck(deck: SecureDeck, gameId: string): Promise<SecureDeck>;
  shuffleDeck(deck: SecureDeck, gameId: string): Promise<SecureDeck>;
  dealCards(deck: SecureDeck, count: number, dealType: string, gamePhase: string): Promise<DealResult>;
  burnCard(deck: SecureDeck, gamePhase: string): Promise<{ card: Card; deck: SecureDeck }>;
  verifyDeckIntegrity(deck: SecureDeck): Promise<boolean>;
  getDeckStatus(deck: SecureDeck): DeckStatus;
}

export interface DeckStatus {
  cardsRemaining: number;
  isCommitted: boolean;
  isRevealed: boolean;
  shuffleCount: number;
  dealCount: number;
  lastOperation: number;
  integrityValid: boolean;
}

export class SecureDeckManager implements SecureDeckOperations {
  private tableId: string;
  private rngEndpoint: string;

  constructor(tableId: string, rngEndpoint: string) {
    this.tableId = tableId;
    this.rngEndpoint = rngEndpoint;
  }

  /**
   * Creates a new standard 52-card deck in standard order
   */
  async createDeck(): Promise<SecureDeck> {
    const cards = this.createStandardDeck();
    
    return {
      cards,
      shuffleHistory: [],
      isCommitted: false,
      isRevealed: false
    };
  }

  /**
   * Commits a deck before shuffling for provable fairness
   */
  async commitDeck(deck: SecureDeck, gameId: string): Promise<SecureDeck> {
    if (deck.isCommitted) {
      throw new Error('Deck already committed');
    }

    const response = await this.callRNG({
      type: 'commit_deck',
      tableId: this.tableId,
      gameId,
      data: { deck: deck.cards, gameId }
    });

    if (!response.success) {
      throw new Error(`Deck commitment failed: ${response.error}`);
    }

    return {
      ...deck,
      commitment: response.data.commitment,
      isCommitted: true
    };
  }

  /**
   * Shuffles a deck using cryptographically secure RNG
   */
  async shuffleDeck(deck: SecureDeck, gameId: string): Promise<SecureDeck> {
    if (deck.cards.length === 0) {
      throw new Error('Cannot shuffle empty deck');
    }

    const response = await this.callRNG({
      type: 'shuffle',
      tableId: this.tableId,
      gameId,
      data: { deck: deck.cards }
    });

    if (!response.success) {
      throw new Error(`Deck shuffle failed: ${response.error}`);
    }

    const shuffleRecord: ShuffleRecord = {
      timestamp: Date.now(),
      originalHash: response.data.proof.originalHash,
      shuffledHash: response.data.proof.shuffledHash,
      entropyUsed: response.data.proof.entropyUsed,
      algorithm: response.data.proof.algorithm
    };

    return {
      ...deck,
      cards: response.data.shuffledDeck,
      shuffleHistory: [...deck.shuffleHistory, shuffleRecord]
    };
  }

  /**
   * Deals specified number of cards from top of deck
   */
  async dealCards(
    deck: SecureDeck, 
    count: number, 
    dealType: string, 
    gamePhase: string
  ): Promise<DealResult> {
    if (count <= 0) {
      throw new Error('Cannot deal zero or negative cards');
    }
    if (count > deck.cards.length) {
      throw new Error(`Cannot deal ${count} cards, only ${deck.cards.length} remaining`);
    }

    const dealtCards = deck.cards.slice(0, count);
    const remainingCards = deck.cards.slice(count);

    // Create hash of remaining deck for audit
    const deckHash = await this.hashCards(remainingCards);

    const dealRecord: DealRecord = {
      timestamp: Date.now(),
      cardsDealt: count,
      dealType,
      gamePhase,
      deckHash
    };

    const updatedDeck: SecureDeck = {
      ...deck,
      cards: remainingCards
    };

    return {
      cards: dealtCards,
      remainingCards: remainingCards.length,
      dealRecord
    };
  }

  /**
   * Burns one card from top of deck (for Texas Hold'em)
   */
  async burnCard(deck: SecureDeck, gamePhase: string): Promise<{ card: Card; deck: SecureDeck }> {
    if (deck.cards.length === 0) {
      throw new Error('Cannot burn card from empty deck');
    }

    const burnedCard = deck.cards[0]!;
    const remainingCards = deck.cards.slice(1);

    const updatedDeck: SecureDeck = {
      ...deck,
      cards: remainingCards
    };

    return {
      card: burnedCard,
      deck: updatedDeck
    };
  }

  /**
   * Verifies deck integrity and shuffle proofs
   */
  async verifyDeckIntegrity(deck: SecureDeck): Promise<boolean> {
    try {
      // Check if all cards are valid
      if (!this.validateAllCards(deck.cards)) {
        return false;
      }

      // If committed, verify commitment
      if (deck.commitment) {
        const response = await this.callRNG({
          type: 'reveal_deck',
          tableId: this.tableId,
          gameId: deck.commitment.gameId,
          data: { deck: deck.cards, gameId: deck.commitment.gameId }
        });

        if (!response.success) {
          return false;
        }

        const reveal = response.data.reveal as DeckReveal;
        return reveal.revealProof.commitmentVerified && 
               reveal.revealProof.shuffleVerified && 
               reveal.revealProof.deckIntegrity;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets current status of deck
   */
  getDeckStatus(deck: SecureDeck): DeckStatus {
    return {
      cardsRemaining: deck.cards.length,
      isCommitted: deck.isCommitted,
      isRevealed: deck.isRevealed,
      shuffleCount: deck.shuffleHistory.length,
      dealCount: 52 - deck.cards.length, // Assumes standard deck
      lastOperation: Math.max(
        ...deck.shuffleHistory.map(s => s.timestamp),
        0
      ),
      integrityValid: this.validateAllCards(deck.cards)
    };
  }

  /**
   * Deals hole cards to multiple players
   */
  async dealHoleCards(
    deck: SecureDeck, 
    playerCount: number, 
    cardsPerPlayer: number = 2
  ): Promise<{ playerHands: Card[][]; deck: SecureDeck }> {
    if (playerCount < 2 || playerCount > 10) {
      throw new Error('Player count must be between 2 and 10');
    }

    const totalCardsNeeded = playerCount * cardsPerPlayer;
    if (deck.cards.length < totalCardsNeeded) {
      throw new Error(`Not enough cards for ${playerCount} players`);
    }

    const playerHands: Card[][] = [];
    let currentDeck = deck;

    // Initialize player hands
    for (let i = 0; i < playerCount; i++) {
      playerHands[i] = [];
    }

    // Deal cards in rounds (like real poker)
    for (let round = 0; round < cardsPerPlayer; round++) {
      for (let player = 0; player < playerCount; player++) {
        const dealResult = await this.dealCards(
          currentDeck, 
          1, 
          'hole_card', 
          `round_${round + 1}`
        );
        
        playerHands[player]!.push(dealResult.cards[0]!);
        currentDeck = { ...currentDeck, cards: currentDeck.cards.slice(1) };
      }
    }

    return { playerHands, deck: currentDeck };
  }

  /**
   * Deals community cards with burn cards
   */
  async dealCommunityCards(
    deck: SecureDeck, 
    phase: 'flop' | 'turn' | 'river'
  ): Promise<{ communityCards: Card[]; deck: SecureDeck }> {
    let currentDeck = deck;
    
    // Burn one card first
    const burnResult = await this.burnCard(currentDeck, `burn_${phase}`);
    currentDeck = burnResult.deck;

    // Deal community cards based on phase
    let cardCount: number;
    switch (phase) {
      case 'flop':
        cardCount = 3;
        break;
      case 'turn':
      case 'river':
        cardCount = 1;
        break;
      default:
        throw new Error(`Invalid phase: ${phase}`);
    }

    const dealResult = await this.dealCards(
      currentDeck, 
      cardCount, 
      'community', 
      phase
    );

    return {
      communityCards: dealResult.cards,
      deck: { ...currentDeck, cards: currentDeck.cards.slice(cardCount) }
    };
  }

  /**
   * Creates export data for external verification
   */
  exportDeckData(deck: SecureDeck): string {
    const exportData = {
      cardsRemaining: deck.cards.length,
      commitment: deck.commitment,
      shuffleHistory: deck.shuffleHistory,
      isCommitted: deck.isCommitted,
      isRevealed: deck.isRevealed,
      timestamp: Date.now()
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Validates deck for tournament play
   */
  async validateForTournament(deck: SecureDeck): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check if properly shuffled
    if (deck.shuffleHistory.length === 0) {
      issues.push('Deck has not been shuffled');
    }

    // Check if committed
    if (!deck.isCommitted) {
      issues.push('Deck has not been committed for provable fairness');
    }

    // Check deck integrity
    const integrityValid = await this.verifyDeckIntegrity(deck);
    if (!integrityValid) {
      issues.push('Deck integrity verification failed');
    }

    // Check for minimum entropy usage
    const totalEntropy = deck.shuffleHistory.reduce((sum, record) => sum + record.entropyUsed, 0);
    if (totalEntropy < 256) { // Minimum entropy requirement
      issues.push('Insufficient entropy used in shuffling');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  // Private helper methods

  private createStandardDeck(): Card[] {
    const deck: Card[] = [];
    const suits = Object.values(Suit);
    const ranks = Object.values(Rank);

    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank });
      }
    }

    return deck;
  }

  private validateAllCards(cards: Card[]): boolean {
    const validSuits = Object.values(Suit);
    const validRanks = Object.values(Rank);

    return cards.every(card => 
      validSuits.includes(card.suit) && validRanks.includes(card.rank)
    );
  }

  private async hashCards(cards: Card[]): Promise<string> {
    const cardString = JSON.stringify(cards);
    const encoder = new TextEncoder();
    const data = encoder.encode(cardString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async callRNG(request: any): Promise<any> {
    const response = await fetch(this.rngEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`RNG service error: ${response.status}`);
    }

    return await response.json();
  }
}

// Utility functions for deck operations

export class DeckUtils {
  /**
   * Calculates the probability of specific card combinations
   */
  static calculateCardProbability(
    targetCards: Card[], 
    remainingDeck: Card[]
  ): number {
    if (targetCards.length === 0 || remainingDeck.length === 0) {
      return 0;
    }

    let matches = 0;
    for (const target of targetCards) {
      matches += remainingDeck.filter(card => 
        card.suit === target.suit && card.rank === target.rank
      ).length;
    }

    return matches / remainingDeck.length;
  }

  /**
   * Verifies that no cards are missing or duplicated
   */
  static verifyCardUniqueness(cards: Card[]): {
    isValid: boolean;
    duplicates: Card[];
    missing: Card[];
  } {
    const cardSet = new Set<string>();
    const duplicates: Card[] = [];
    const standardDeck = DeckUtils.createStandardDeckSet();

    for (const card of cards) {
      const cardKey = `${card.rank}-${card.suit}`;
      if (cardSet.has(cardKey)) {
        duplicates.push(card);
      } else {
        cardSet.add(cardKey);
        standardDeck.delete(cardKey);
      }
    }

    const missing = Array.from(standardDeck).map(cardKey => {
      const [rank, suit] = cardKey.split('-');
      return { rank: rank as Rank, suit: suit as Suit };
    });

    return {
      isValid: duplicates.length === 0 && missing.length === 0,
      duplicates,
      missing
    };
  }

  /**
   * Creates a set of all standard deck cards
   */
  private static createStandardDeckSet(): Set<string> {
    const cardSet = new Set<string>();
    const suits = Object.values(Suit);
    const ranks = Object.values(Rank);

    for (const suit of suits) {
      for (const rank of ranks) {
        cardSet.add(`${rank}-${suit}`);
      }
    }

    return cardSet;
  }

  /**
   * Formats cards for display
   */
  static formatCards(cards: Card[]): string {
    return cards.map(card => `${card.rank}${card.suit[0]?.toUpperCase()}`).join(' ');
  }

  /**
   * Parses card string back to Card objects
   */
  static parseCards(cardString: string): Card[] {
    return cardString.split(' ').map(cardStr => {
      const rank = cardStr.slice(0, -1) as Rank;
      const suitChar = cardStr.slice(-1).toLowerCase();
      
      const suitMap: Record<string, Suit> = {
        'h': Suit.HEARTS,
        'd': Suit.DIAMONDS,
        'c': Suit.CLUBS,
        's': Suit.SPADES
      };

      const suit = suitMap[suitChar];
      if (!suit) {
        throw new Error(`Invalid suit: ${suitChar}`);
      }

      return { rank, suit };
    });
  }
}