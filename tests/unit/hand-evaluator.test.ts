import { Hand, HandEvaluation } from '@primo-poker/core';
import { Card, Suit, Rank, HandRanking } from '@primo-poker/shared';

describe('Hand Evaluator', () => {
  describe('Hand.evaluate', () => {
    it('should identify a royal flush', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.HEARTS, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.QUEEN },
        { suit: Suit.HEARTS, rank: Rank.JACK },
        { suit: Suit.HEARTS, rank: Rank.TEN },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.ROYAL_FLUSH);
      expect(evaluation.highCard).toBe(Rank.ACE);
    });

    it('should identify a straight flush', () => {
      const cards: Card[] = [
        { suit: Suit.SPADES, rank: Rank.NINE },
        { suit: Suit.SPADES, rank: Rank.EIGHT },
        { suit: Suit.SPADES, rank: Rank.SEVEN },
        { suit: Suit.SPADES, rank: Rank.SIX },
        { suit: Suit.SPADES, rank: Rank.FIVE },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.STRAIGHT_FLUSH);
      expect(evaluation.highCard).toBe(Rank.NINE);
    });

    it('should identify four of a kind', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.SPADES, rank: Rank.ACE },
        { suit: Suit.HEARTS, rank: Rank.KING },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.FOUR_OF_A_KIND);
      expect(evaluation.highCard).toBe(Rank.ACE);
      expect(evaluation.kickers).toContain(Rank.KING);
    });

    it('should identify a full house', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.SPADES, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.KING },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.FULL_HOUSE);
      expect(evaluation.highCard).toBe(Rank.ACE);
      expect(evaluation.kickers).toContain(Rank.KING);
    });

    it('should identify a flush', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.HEARTS, rank: Rank.JACK },
        { suit: Suit.HEARTS, rank: Rank.NINE },
        { suit: Suit.HEARTS, rank: Rank.SEVEN },
        { suit: Suit.HEARTS, rank: Rank.FIVE },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.FLUSH);
      expect(evaluation.highCard).toBe(Rank.ACE);
    });

    it('should identify a straight', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.TEN },
        { suit: Suit.DIAMONDS, rank: Rank.NINE },
        { suit: Suit.CLUBS, rank: Rank.EIGHT },
        { suit: Suit.SPADES, rank: Rank.SEVEN },
        { suit: Suit.HEARTS, rank: Rank.SIX },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.STRAIGHT);
      expect(evaluation.highCard).toBe(Rank.TEN);
    });

    it('should identify the wheel straight (A-2-3-4-5)', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.FIVE },
        { suit: Suit.CLUBS, rank: Rank.FOUR },
        { suit: Suit.SPADES, rank: Rank.THREE },
        { suit: Suit.HEARTS, rank: Rank.TWO },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.STRAIGHT);
      expect(evaluation.highCard).toBe(Rank.FIVE); // In wheel, 5 is high
    });

    it('should identify three of a kind', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.SPADES, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.QUEEN },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.THREE_OF_A_KIND);
      expect(evaluation.highCard).toBe(Rank.ACE);
      expect(evaluation.kickers).toEqual([Rank.KING, Rank.QUEEN]);
    });

    it('should identify two pair', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.KING },
        { suit: Suit.SPADES, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.QUEEN },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.TWO_PAIR);
      expect(evaluation.highCard).toBe(Rank.ACE);
      expect(evaluation.kickers).toEqual([Rank.KING, Rank.QUEEN]);
    });

    it('should identify a pair', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.KING },
        { suit: Suit.SPADES, rank: Rank.QUEEN },
        { suit: Suit.HEARTS, rank: Rank.JACK },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.PAIR);
      expect(evaluation.highCard).toBe(Rank.ACE);
      expect(evaluation.kickers).toEqual([Rank.KING, Rank.QUEEN, Rank.JACK]);
    });

    it('should identify high card', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING },
        { suit: Suit.CLUBS, rank: Rank.QUEEN },
        { suit: Suit.SPADES, rank: Rank.JACK },
        { suit: Suit.HEARTS, rank: Rank.NINE },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.HIGH_CARD);
      expect(evaluation.highCard).toBe(Rank.ACE);
      expect(evaluation.kickers).toEqual([Rank.KING, Rank.QUEEN, Rank.JACK, Rank.NINE]);
    });

    it('should work with 7 cards (Texas Hold\'em style)', () => {
      const cards: Card[] = [
        // Hole cards
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.ACE },
        // Community cards
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.SPADES, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.KING },
        { suit: Suit.DIAMONDS, rank: Rank.QUEEN },
        { suit: Suit.CLUBS, rank: Rank.JACK },
      ];

      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.FULL_HOUSE);
      expect(evaluation.highCard).toBe(Rank.ACE);
    });
  });

  describe('Hand.compareHands', () => {
    it('should correctly compare hands of different rankings', () => {
      const royalFlush: HandEvaluation = {
        ranking: HandRanking.ROYAL_FLUSH,
        cards: [],
        highCard: Rank.ACE,
        kickers: [],
        description: 'Royal Flush',
      };

      const straightFlush: HandEvaluation = {
        ranking: HandRanking.STRAIGHT_FLUSH,
        cards: [],
        highCard: Rank.KING,
        kickers: [],
        description: 'Straight Flush',
      };

      expect(Hand.compareHands(royalFlush, straightFlush)).toBeLessThan(0);
      expect(Hand.compareHands(straightFlush, royalFlush)).toBeGreaterThan(0);
    });

    it('should correctly compare hands of same ranking by high card', () => {
      const aceHigh: HandEvaluation = {
        ranking: HandRanking.HIGH_CARD,
        cards: [],
        highCard: Rank.ACE,
        kickers: [Rank.KING],
        description: 'Ace High',
      };

      const kingHigh: HandEvaluation = {
        ranking: HandRanking.HIGH_CARD,
        cards: [],
        highCard: Rank.KING,
        kickers: [Rank.QUEEN],
        description: 'King High',
      };

      expect(Hand.compareHands(aceHigh, kingHigh)).toBeLessThan(0);
      expect(Hand.compareHands(kingHigh, aceHigh)).toBeGreaterThan(0);
    });

    it('should correctly compare hands by kickers', () => {
      const aceKingKicker: HandEvaluation = {
        ranking: HandRanking.PAIR,
        cards: [],
        highCard: Rank.ACE,
        kickers: [Rank.KING, Rank.QUEEN],
        description: 'Pair of Aces',
      };

      const aceQueenKicker: HandEvaluation = {
        ranking: HandRanking.PAIR,
        cards: [],
        highCard: Rank.ACE,
        kickers: [Rank.QUEEN, Rank.JACK],
        description: 'Pair of Aces',
      };

      expect(Hand.compareHands(aceKingKicker, aceQueenKicker)).toBeLessThan(0);
      expect(Hand.compareHands(aceQueenKicker, aceKingKicker)).toBeGreaterThan(0);
    });

    it('should return 0 for identical hands', () => {
      const hand1: HandEvaluation = {
        ranking: HandRanking.PAIR,
        cards: [],
        highCard: Rank.ACE,
        kickers: [Rank.KING, Rank.QUEEN, Rank.JACK],
        description: 'Pair of Aces',
      };

      const hand2: HandEvaluation = {
        ranking: HandRanking.PAIR,
        cards: [],
        highCard: Rank.ACE,
        kickers: [Rank.KING, Rank.QUEEN, Rank.JACK],
        description: 'Pair of Aces',
      };

      expect(Hand.compareHands(hand1, hand2)).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should throw error for invalid number of cards', () => {
      const tooFewCards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING },
        { suit: Suit.CLUBS, rank: Rank.QUEEN },
      ];

      expect(() => new Hand(tooFewCards)).toThrow('Hand must contain 5-7 cards for evaluation');

      const tooManyCards: Card[] = Array(8).fill({ suit: Suit.HEARTS, rank: Rank.ACE });
      expect(() => new Hand(tooManyCards)).toThrow('Hand must contain 5-7 cards for evaluation');
    });
  });
});
