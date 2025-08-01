/**
 * DeckManager Unit Tests - Phase 3B.2
 * 
 * Comprehensive tests for the card dealing system
 */

import { DeckManager } from '@primo-poker/core'
import { Card, Suit, Rank } from '@primo-poker/shared'

describe('DeckManager', () => {
  let deckManager: DeckManager

  beforeEach(() => {
    deckManager = new DeckManager()
  })

  describe('Deck Creation and Initialization', () => {
    it('should create a standard 52-card deck', () => {
      expect(deckManager.cards).toHaveLength(52)
      expect(deckManager.remaining()).toBe(52)
      
      // Check all suits are present
      const suits = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES]
      suits.forEach(suit => {
        const suitCards = deckManager.cards.filter((card: Card) => card.suit === suit)
        expect(suitCards).toHaveLength(13)
      })

      // Check all ranks are present for each suit
      const ranks = [
        Rank.TWO, Rank.THREE, Rank.FOUR, Rank.FIVE, Rank.SIX, Rank.SEVEN,
        Rank.EIGHT, Rank.NINE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE
      ]
      
      suits.forEach(suit => {
        ranks.forEach(rank => {
          const card = deckManager.cards.find((c: Card) => c.suit === suit && c.rank === rank)
          expect(card).toBeDefined()
        })
      })
    })

    it('should create unique cards (no duplicates)', () => {
      const cardStrings = deckManager.cards.map((card: Card) => `${card.rank}${card.suit}`)
      const uniqueCards = new Set(cardStrings)

      expect(uniqueCards.size).toBe(52)
    })

    it('should shuffle deck during initialization', () => {
      const deckManager2 = new DeckManager()
      
      // Extremely unlikely to have same order after shuffling
      const sameOrder = deckManager.cards.every((card: Card, index: number) => 
        card.suit === deckManager2.cards[index]?.suit && card.rank === deckManager2.cards[index]?.rank
      )

      expect(sameOrder).toBe(false)
    })
  })

  describe('Shuffling', () => {
    it('should shuffle deck differently', () => {
      const originalOrder = [...deckManager.cards]
      deckManager.shuffle()

      // Should be different order after shuffling
      const sameOrder = deckManager.cards.every((card: Card, index: number) => 
        card.suit === originalOrder[index]?.suit && card.rank === originalOrder[index]?.rank
      )

      expect(sameOrder).toBe(false)
    })

    it('should preserve all cards during shuffle', () => {
      const originalCards = [...deckManager.cards]
      deckManager.shuffle()

      expect(deckManager.cards).toHaveLength(52)
      
      // Check each original card is still present
      originalCards.forEach((originalCard: Card) => {
        const foundCard = deckManager.cards.find((card: Card) => 
          card.suit === originalCard.suit && card.rank === originalCard.rank
        )
        expect(foundCard).toBeDefined()
      })
    })
  })

  describe('Card Dealing', () => {
    it('should deal correct number of cards', () => {
      const initialCount = deckManager.remaining()
      const dealtCards = deckManager.deal(5)

      expect(dealtCards).toHaveLength(5)
      expect(deckManager.remaining()).toBe(initialCount - 5)
    })

    it('should deal unique cards', () => {
      const cards1 = deckManager.deal(2)
      const cards2 = deckManager.deal(2)
      
      const allCards = [...cards1, ...cards2]
      const cardStrings = allCards.map((card: Card) => `${card.rank}${card.suit}`)
      const uniqueCards = new Set(cardStrings)
      
      expect(uniqueCards.size).toBe(4)
    })

    it('should throw error when dealing more cards than available', () => {
      expect(() => deckManager.deal(53)).toThrow('Cannot deal 53 cards, only 52 remaining')
    })

    it('should handle dealing all cards', () => {
      const allCards = deckManager.deal(52)
      
      expect(allCards).toHaveLength(52)
      expect(deckManager.remaining()).toBe(0)
    })

    it('should deal cards from top of deck', () => {
      const topCard = deckManager.cards[0]
      const dealtCards = deckManager.deal(1)
      
      expect(dealtCards[0]).toEqual(topCard)
    })
  })

  describe('Burn Card', () => {
    it('should burn one card from deck', () => {
      const initialCount = deckManager.remaining()
      const topCard = deckManager.cards[0]
      
      const burnedCard = deckManager.burn()
      
      expect(burnedCard).toEqual(topCard)
      expect(deckManager.remaining()).toBe(initialCount - 1)
    })

    it('should throw error when burning from empty deck', () => {
      // Empty the deck first
      deckManager.deal(52)
      
      expect(() => deckManager.burn()).toThrow('Cannot burn card from empty deck')
    })
  })

  describe('Deck Reset', () => {
    it('should reset deck to 52 cards', () => {
      // Deal some cards
      deckManager.deal(10)
      expect(deckManager.remaining()).toBe(42)
      
      // Reset
      deckManager.reset()
      expect(deckManager.remaining()).toBe(52)
    })

    it('should shuffle after reset', () => {
      const originalOrder = [...deckManager.cards]
      
      // Deal some cards and reset
      deckManager.deal(10)
      deckManager.reset()
      
      // Should be different order after reset (due to shuffle)
      const sameOrder = deckManager.cards.every((card: Card, index: number) => 
        card.suit === originalOrder[index]?.suit && card.rank === originalOrder[index]?.rank
      )

      expect(sameOrder).toBe(false)
    })
  })

  describe('Texas Hold\'em Community Cards', () => {
    it('should deal flop correctly (3 cards + burn)', () => {
      const initialCount = deckManager.remaining()
      const flopCards = deckManager.dealFlop()

      expect(flopCards).toHaveLength(3)
      expect(deckManager.remaining()).toBe(initialCount - 4) // 3 flop + 1 burn
    })

    it('should deal turn correctly (1 card + burn)', () => {
      const initialCount = deckManager.remaining()
      const turnCard = deckManager.dealTurn()

      expect(turnCard).toBeDefined()
      expect(turnCard.suit).toBeDefined()
      expect(turnCard.rank).toBeDefined()
      expect(deckManager.remaining()).toBe(initialCount - 2) // 1 turn + 1 burn
    })

    it('should deal river correctly (1 card + burn)', () => {
      const initialCount = deckManager.remaining()
      const riverCard = deckManager.dealRiver()

      expect(riverCard).toBeDefined()
      expect(riverCard.suit).toBeDefined()
      expect(riverCard.rank).toBeDefined()
      expect(deckManager.remaining()).toBe(initialCount - 2) // 1 river + 1 burn
    })

    it('should throw error for flop with insufficient cards', () => {
      // Leave only 3 cards (need 4 for flop with burn)
      deckManager.deal(49)
      
      expect(() => deckManager.dealFlop()).toThrow()
    })

    it('should throw error for turn with insufficient cards', () => {
      // Leave only 1 card (need 2 for turn with burn)
      deckManager.deal(51)
      
      expect(() => deckManager.dealTurn()).toThrow()
    })

    it('should throw error for river with insufficient cards', () => {
      // Empty deck
      deckManager.deal(52)
      
      expect(() => deckManager.dealRiver()).toThrow()
    })
  })

  describe('Hole Cards Dealing', () => {
    it('should deal hole cards to multiple players', () => {
      const playerCount = 3
      const initialCount = deckManager.remaining()
      
      const playerHands = deckManager.dealHoleCards(playerCount)

      expect(playerHands).toHaveLength(3)
      expect(playerHands[0]).toHaveLength(2) // Each player gets 2 cards
      expect(playerHands[1]).toHaveLength(2)
      expect(playerHands[2]).toHaveLength(2)
      expect(deckManager.remaining()).toBe(initialCount - 6) // 3 players * 2 cards
    })

    it('should deal unique hole cards', () => {
      const playerCount = 2
      const playerHands = deckManager.dealHoleCards(playerCount)
      
      const allCards = [...playerHands[0]!, ...playerHands[1]!]
      const cardStrings = allCards.map((card: Card) => `${card.rank}${card.suit}`)
      const uniqueCards = new Set(cardStrings)
      
      expect(uniqueCards.size).toBe(4)
    })

    it('should handle minimum players', () => {
      const initialCount = deckManager.remaining()
      const playerHands = deckManager.dealHoleCards(2)

      expect(playerHands).toHaveLength(2)
      expect(deckManager.remaining()).toBe(initialCount - 4) // 2 players * 2 cards
    })

    it('should throw error with invalid player count', () => {
      expect(() => deckManager.dealHoleCards(1)).toThrow('Player count must be between 2 and 10')
      expect(() => deckManager.dealHoleCards(11)).toThrow('Player count must be between 2 and 10')
    })

    it('should throw error with insufficient cards for hole cards', () => {
      // Leave only 3 cards (need 4 for 2 players)
      deckManager.deal(49)
      
      expect(() => deckManager.dealHoleCards(2)).toThrow('Not enough cards to deal hole cards')
    })
  })

  describe('Full Texas Hold\'em Game Simulation', () => {
    it('should support complete hand dealing sequence', () => {
      const playerCount = 4
      
      // Deal hole cards (8 cards)
      const playerHands = deckManager.dealHoleCards(playerCount)
      expect(playerHands).toHaveLength(4)
      expect(deckManager.remaining()).toBe(44) // 52 - 8

      // Deal flop (3 cards + 1 burn = 4 cards)
      const flopCards = deckManager.dealFlop()
      expect(flopCards).toHaveLength(3)
      expect(deckManager.remaining()).toBe(40) // 44 - 4

      // Deal turn (1 card + 1 burn = 2 cards)
      const turnCard = deckManager.dealTurn()
      expect(turnCard).toBeDefined()
      expect(deckManager.remaining()).toBe(38) // 40 - 2

      // Deal river (1 card + 1 burn = 2 cards)
      const riverCard = deckManager.dealRiver()
      expect(riverCard).toBeDefined()
      expect(deckManager.remaining()).toBe(36) // 38 - 2

      // Verify all cards are unique
      const allUsedCards = [
        ...playerHands.flat(),
        ...flopCards,
        turnCard,
        riverCard
      ]

      const cardStrings = allUsedCards.map((card: Card) => `${card.rank}${card.suit}`)
      const uniqueCards = new Set(cardStrings)
      expect(uniqueCards.size).toBe(13) // 8 hole + 3 flop + 1 turn + 1 river
    })

    it('should handle maximum players (9 players)', () => {
      const playerCount = 9
      
      const playerHands = deckManager.dealHoleCards(playerCount)
      expect(playerHands).toHaveLength(9)
      expect(deckManager.remaining()).toBe(34) // 52 - 18

      // Should still be able to deal community cards
      const flopCards = deckManager.dealFlop()
      expect(flopCards).toHaveLength(3)
      
      const turnCard = deckManager.dealTurn()
      expect(turnCard).toBeDefined()
      
      const riverCard = deckManager.dealRiver()
      expect(riverCard).toBeDefined()

      // Final deck should have 52 - 18 - 4 - 2 - 2 = 26 cards
      expect(deckManager.remaining()).toBe(26)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle deck state consistency', () => {
      const initialCount = deckManager.remaining()
      
      // Multiple operations
      deckManager.deal(5)
      deckManager.burn()
      const flop = deckManager.dealFlop()
      
      expect(deckManager.remaining()).toBe(initialCount - 5 - 1 - 4)
      expect(flop).toHaveLength(3)
    })

    it('should maintain card object integrity', () => {
      const card = deckManager.deal(1)[0]!
      
      expect(card).toHaveProperty('suit')
      expect(card).toHaveProperty('rank')
      expect(Object.values(Suit)).toContain(card.suit)
      expect(Object.values(Rank)).toContain(card.rank)
    })

    it('should handle rapid successive operations', () => {
      // Simulate rapid dealing
      for (let i = 0; i < 10; i++) {
        deckManager.deal(1)
      }
      
      expect(deckManager.remaining()).toBe(42)
      
      // Should still work normally
      const flop = deckManager.dealFlop()
      expect(flop).toHaveLength(3)
    })
  })
})
