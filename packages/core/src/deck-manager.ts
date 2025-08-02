/**
 * Deck Manager - Phase 3B.2.2
 * 
 * Manages deck creation, shuffling, and card dealing for poker games
 */

import { Card, Suit, Rank } from '@primo-poker/shared'

export interface GameDeck {
  cards: Card[]
  shuffle(): void
  deal(count: number): Card[]
  burn(): Card
  reset(): void
  remaining(): number
  dealFlop(): Card[]
  dealTurn(): Card
  dealRiver(): Card
}

export class DeckManager implements GameDeck {
  public cards: Card[]
  private originalDeck: Card[]

  constructor() {
    this.originalDeck = this.createStandardDeck()
    this.cards = [...this.originalDeck]
    this.shuffle()
  }

  /**
   * Creates a standard 52-card deck
   */
  private createStandardDeck(): Card[] {
    const deck: Card[] = []
    const suits = Object.values(Suit)
    const ranks = Object.values(Rank)

    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank })
      }
    }

    return deck
  }

  /**
   * Shuffles the deck using Fisher-Yates algorithm
   * @deprecated Use SecureDeckManager for cryptographically secure shuffling
   */
  shuffle(): void {
    console.warn('DeckManager.shuffle() is deprecated. Use SecureDeckManager for cryptographically secure shuffling.');
    // Temporary implementation using crypto.getRandomValues for backwards compatibility
    for (let i = this.cards.length - 1; i > 0; i--) {
      // Use crypto.getRandomValues instead of Math.random()
      const randomBytes = crypto.getRandomValues(new Uint32Array(1));
      const j = Math.floor(((randomBytes[0] ?? 0) / 0xFFFFFFFF) * (i + 1));
      const temp = this.cards[i]!
      this.cards[i] = this.cards[j]!
      this.cards[j] = temp
    }
  }

  /**
   * Deals the specified number of cards from the top of the deck
   */
  deal(count: number): Card[] {
    if (count > this.cards.length) {
      throw new Error(`Cannot deal ${count} cards, only ${this.cards.length} remaining`)
    }

    return this.cards.splice(0, count)
  }

  /**
   * Burns one card from the top of the deck (for Texas Hold'em)
   */
  burn(): Card {
    if (this.cards.length === 0) {
      throw new Error('Cannot burn card from empty deck')
    }

    const card = this.cards.shift()
    if (!card) {
      throw new Error('Failed to burn card')
    }
    return card
  }

  /**
   * Resets deck to original 52 cards and shuffles
   */
  reset(): void {
    this.cards = [...this.originalDeck]
    this.shuffle()
  }

  /**
   * Returns number of cards remaining in deck
   */
  remaining(): number {
    return this.cards.length
  }

  /**
   * Deals community cards for Texas Hold'em
   */
  dealFlop(): Card[] {
    this.burn() // Burn card before flop
    return this.deal(3)
  }

  /**
   * Deals turn card for Texas Hold'em
   */
  dealTurn(): Card {
    this.burn() // Burn card before turn
    const cards = this.deal(1)
    if (cards.length === 0) {
      throw new Error('Failed to deal turn card')
    }
    return cards[0]!
  }

  /**
   * Deals river card for Texas Hold'em
   */
  dealRiver(): Card {
    this.burn() // Burn card before river
    const cards = this.deal(1)
    if (cards.length === 0) {
      throw new Error('Failed to deal river card')
    }
    return cards[0]!
  }

  /**
   * Deals hole cards to players
   */
  dealHoleCards(playerCount: number): Card[][] {
    if (playerCount < 2 || playerCount > 10) {
      throw new Error('Player count must be between 2 and 10')
    }

    if (this.cards.length < playerCount * 2) {
      throw new Error('Not enough cards to deal hole cards')
    }

    const holeCards: Card[][] = []
    
    // Initialize arrays for each player
    for (let player = 0; player < playerCount; player++) {
      holeCards[player] = []
    }
    
    // Deal one card to each player, then second card to each player
    for (let round = 0; round < 2; round++) {
      for (let player = 0; player < playerCount; player++) {
        const cards = this.deal(1)
        if (cards.length === 0) {
          throw new Error(`Failed to deal card to player ${player}`)
        }
        holeCards[player]!.push(cards[0]!)
      }
    }

    return holeCards
  }

  /**
   * Gets a copy of the current deck state (for debugging)
   */
  getDeckState(): Card[] {
    return [...this.cards]
  }

  /**
   * Validates if a card exists in the standard deck
   */
  static isValidCard(card: Card): boolean {
    const suits = Object.values(Suit)
    const ranks = Object.values(Rank)
    
    return suits.includes(card.suit) && ranks.includes(card.rank)
  }

  /**
   * Converts card to string representation
   */
  static cardToString(card: Card): string {
    return `${card.rank}${card.suit.charAt(0).toUpperCase()}`
  }

  /**
   * Converts string to card (inverse of cardToString)
   */
  static stringToCard(cardString: string): Card {
    if (cardString.length < 2) {
      throw new Error('Invalid card string format')
    }

    const rankStr = cardString.slice(0, -1)
    const suitChar = cardString.slice(-1).toLowerCase()

    const rank = Object.values(Rank).find(r => r === rankStr)
    if (!rank) {
      throw new Error(`Invalid rank: ${rankStr}`)
    }

    const suitMap: { [key: string]: Suit } = {
      'h': Suit.HEARTS,
      'd': Suit.DIAMONDS,
      'c': Suit.CLUBS,
      's': Suit.SPADES
    }

    const suit = suitMap[suitChar]
    if (!suit) {
      throw new Error(`Invalid suit: ${suitChar}`)
    }

    return { suit, rank }
  }
}
