import { Hand, HandEvaluation } from '@primo-poker/core';
import { Card, Suit, Rank, HandRanking } from '@primo-poker/shared';

describe('HandEvaluator Comprehensive Tests', () => {
  
  describe('Basic Hand Rankings', () => {
    it('should correctly evaluate high card', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.KING },
        { suit: Suit.DIAMONDS, rank: Rank.JACK },
        { suit: Suit.SPADES, rank: Rank.NINE },
        { suit: Suit.HEARTS, rank: Rank.SEVEN },
        { suit: Suit.CLUBS, rank: Rank.FIVE },
        { suit: Suit.DIAMONDS, rank: Rank.THREE }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.HIGH_CARD);
      expect(evaluation.cards[0]?.rank).toBe(Rank.ACE);
    });

    it('should correctly evaluate one pair', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING },
        { suit: Suit.SPADES, rank: Rank.QUEEN },
        { suit: Suit.HEARTS, rank: Rank.JACK },
        { suit: Suit.CLUBS, rank: Rank.TEN },
        { suit: Suit.DIAMONDS, rank: Rank.NINE }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.ONE_PAIR);
      expect(evaluation.cards.filter(c => c.rank === Rank.ACE)).toHaveLength(2);
    });

    it('should correctly evaluate two pair', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING },
        { suit: Suit.SPADES, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.QUEEN },
        { suit: Suit.CLUBS, rank: Rank.JACK },
        { suit: Suit.DIAMONDS, rank: Rank.TEN }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.TWO_PAIR);
    });

    it('should correctly evaluate three of a kind', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.ACE },
        { suit: Suit.SPADES, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.QUEEN },
        { suit: Suit.CLUBS, rank: Rank.JACK },
        { suit: Suit.DIAMONDS, rank: Rank.TEN }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.THREE_OF_A_KIND);
    });

    it('should correctly evaluate straight', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.TEN },
        { suit: Suit.CLUBS, rank: Rank.NINE },
        { suit: Suit.DIAMONDS, rank: Rank.EIGHT },
        { suit: Suit.SPADES, rank: Rank.SEVEN },
        { suit: Suit.HEARTS, rank: Rank.SIX },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.STRAIGHT);
    });

    it('should correctly evaluate flush', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.HEARTS, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.QUEEN },
        { suit: Suit.HEARTS, rank: Rank.JACK },
        { suit: Suit.HEARTS, rank: Rank.NINE },
        { suit: Suit.CLUBS, rank: Rank.EIGHT },
        { suit: Suit.DIAMONDS, rank: Rank.SEVEN }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.FLUSH);
    });

    it('should correctly evaluate full house', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.ACE },
        { suit: Suit.SPADES, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.KING },
        { suit: Suit.CLUBS, rank: Rank.QUEEN },
        { suit: Suit.DIAMONDS, rank: Rank.JACK }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.FULL_HOUSE);
    });

    it('should correctly evaluate four of a kind', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.ACE },
        { suit: Suit.SPADES, rank: Rank.ACE },
        { suit: Suit.HEARTS, rank: Rank.KING },
        { suit: Suit.CLUBS, rank: Rank.QUEEN },
        { suit: Suit.DIAMONDS, rank: Rank.JACK }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.FOUR_OF_A_KIND);
    });

    it('should correctly evaluate straight flush', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.TEN },
        { suit: Suit.HEARTS, rank: Rank.NINE },
        { suit: Suit.HEARTS, rank: Rank.EIGHT },
        { suit: Suit.HEARTS, rank: Rank.SEVEN },
        { suit: Suit.HEARTS, rank: Rank.SIX },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.STRAIGHT_FLUSH);
    });

    it('should correctly evaluate royal flush', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.HEARTS, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.QUEEN },
        { suit: Suit.HEARTS, rank: Rank.JACK },
        { suit: Suit.HEARTS, rank: Rank.TEN },
        { suit: Suit.CLUBS, rank: Rank.NINE },
        { suit: Suit.DIAMONDS, rank: Rank.EIGHT }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.ROYAL_FLUSH);
    });
  });

  describe('Special Cases', () => {
    it('should handle ace-low straight (wheel)', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.TWO },
        { suit: Suit.DIAMONDS, rank: Rank.THREE },
        { suit: Suit.SPADES, rank: Rank.FOUR },
        { suit: Suit.HEARTS, rank: Rank.FIVE },
        { suit: Suit.CLUBS, rank: Rank.KING },
        { suit: Suit.DIAMONDS, rank: Rank.QUEEN }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.STRAIGHT);
      expect(evaluation.cards[0]?.rank).toBe(Rank.FIVE); // Five-high straight
    });

    it('should handle ace-low straight flush', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.HEARTS, rank: Rank.TWO },
        { suit: Suit.HEARTS, rank: Rank.THREE },
        { suit: Suit.HEARTS, rank: Rank.FOUR },
        { suit: Suit.HEARTS, rank: Rank.FIVE },
        { suit: Suit.CLUBS, rank: Rank.KING },
        { suit: Suit.DIAMONDS, rank: Rank.QUEEN }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.STRAIGHT_FLUSH);
    });

    it('should select best 5-card hand from 7 cards', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.ACE },
        { suit: Suit.SPADES, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.KING },
        { suit: Suit.CLUBS, rank: Rank.QUEEN },
        { suit: Suit.DIAMONDS, rank: Rank.QUEEN }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.FULL_HOUSE);
      expect(evaluation.cards).toHaveLength(5);
      
      // Should be Aces full of Kings (not Queens)
      const threeOfAKind = evaluation.cards.slice(0, 3);
      const pair = evaluation.cards.slice(3, 5);
      expect(threeOfAKind.every(c => c.rank === Rank.ACE)).toBe(true);
      expect(pair.every(c => c.rank === Rank.KING)).toBe(true);
    });

    it('should handle multiple flush possibilities', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.HEARTS, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.QUEEN },
        { suit: Suit.HEARTS, rank: Rank.JACK },
        { suit: Suit.HEARTS, rank: Rank.TEN },
        { suit: Suit.HEARTS, rank: Rank.NINE },
        { suit: Suit.HEARTS, rank: Rank.EIGHT }
      ];
      
      const evaluation = Hand.evaluate(cards);
      expect(evaluation.ranking).toBe(HandRanking.ROYAL_FLUSH);
      expect(evaluation.cards).toHaveLength(5);
      
      // Should select the royal flush, not just any flush
      const expectedRanks = [Rank.ACE, Rank.KING, Rank.QUEEN, Rank.JACK, Rank.TEN];
      evaluation.cards.forEach((card, index) => {
        expect(card.rank).toBe(expectedRanks[index]);
      });
    });
  });

  describe('Hand Comparison', () => {
    it('should correctly compare hands of different rankings', () => {
      const pairHand: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING },
        { suit: Suit.SPADES, rank: Rank.QUEEN },
        { suit: Suit.HEARTS, rank: Rank.JACK }
      ];
      
      const flushHand: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.TWO },
        { suit: Suit.HEARTS, rank: Rank.THREE },
        { suit: Suit.HEARTS, rank: Rank.FOUR },
        { suit: Suit.HEARTS, rank: Rank.FIVE },
        { suit: Suit.HEARTS, rank: Rank.SEVEN }
      ];
      
      const pairEval = Hand.evaluate(pairHand);
      const flushEval = Hand.evaluate(flushHand);
      
      const comparison = Hand.compareHands(pairEval, flushEval);
      expect(comparison).toBeGreaterThan(0); // Flush beats pair
    });

    it('should correctly compare hands of same ranking by kickers', () => {
      const aceHighPair: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING },
        { suit: Suit.SPADES, rank: Rank.QUEEN },
        { suit: Suit.HEARTS, rank: Rank.JACK }
      ];
      
      const aceHighPairLowerKicker: Card[] = [
        { suit: Suit.DIAMONDS, rank: Rank.ACE },
        { suit: Suit.SPADES, rank: Rank.ACE },
        { suit: Suit.HEARTS, rank: Rank.KING },
        { suit: Suit.CLUBS, rank: Rank.QUEEN },
        { suit: Suit.DIAMONDS, rank: Rank.TEN }
      ];
      
      const eval1 = Hand.evaluate(aceHighPair);
      const eval2 = Hand.evaluate(aceHighPairLowerKicker);
      
      const comparison = Hand.compareHands(eval1, eval2);
      expect(comparison).toBeLessThan(0); // First hand wins (Jack kicker beats Ten)
    });

    it('should handle tied hands correctly', () => {
      const hand1: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.HEARTS, rank: Rank.KING },
        { suit: Suit.HEARTS, rank: Rank.QUEEN },
        { suit: Suit.HEARTS, rank: Rank.JACK },
        { suit: Suit.HEARTS, rank: Rank.TEN }
      ];
      
      const hand2: Card[] = [
        { suit: Suit.SPADES, rank: Rank.ACE },
        { suit: Suit.SPADES, rank: Rank.KING },
        { suit: Suit.SPADES, rank: Rank.QUEEN },
        { suit: Suit.SPADES, rank: Rank.JACK },
        { suit: Suit.SPADES, rank: Rank.TEN }
      ];
      
      const eval1 = Hand.evaluate(hand1);
      const eval2 = Hand.evaluate(hand2);
      
      const comparison = Hand.compareHands(eval1, eval2);
      expect(comparison).toBe(0); // Both royal flushes tie
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty card array', () => {
      const cards: Card[] = [];
      expect(() => Hand.evaluate(cards)).toThrow();
    });

    it('should handle less than 5 cards', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.KING },
        { suit: Suit.DIAMONDS, rank: Rank.QUEEN },
        { suit: Suit.SPADES, rank: Rank.JACK }
      ];
      
      expect(() => Hand.evaluate(cards)).toThrow();
    });

    it('should handle duplicate cards gracefully', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.HEARTS, rank: Rank.ACE }, // Duplicate
        { suit: Suit.CLUBS, rank: Rank.KING },
        { suit: Suit.DIAMONDS, rank: Rank.QUEEN },
        { suit: Suit.SPADES, rank: Rank.JACK },
        { suit: Suit.HEARTS, rank: Rank.TEN }
      ];
      
      // Should either throw or handle gracefully
      const evaluation = Hand.evaluate(cards);
      expect(evaluation).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should evaluate hands quickly', () => {
      const cards: Card[] = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.CLUBS, rank: Rank.KING },
        { suit: Suit.DIAMONDS, rank: Rank.QUEEN },
        { suit: Suit.SPADES, rank: Rank.JACK },
        { suit: Suit.HEARTS, rank: Rank.TEN },
        { suit: Suit.CLUBS, rank: Rank.NINE },
        { suit: Suit.DIAMONDS, rank: Rank.EIGHT }
      ];
      
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        Hand.evaluate(cards);
      }
      const elapsed = Date.now() - start;
      
      // Should evaluate 1000 hands in less than 100ms
      expect(elapsed).toBeLessThan(100);
    });
  });
});