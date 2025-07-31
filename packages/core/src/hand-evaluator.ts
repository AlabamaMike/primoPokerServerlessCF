import {
  Card,
  Rank,
  Suit,
  HandRanking,
  CardUtils,
} from '@primo-poker/shared';

export class Hand {
  constructor(private cards: Card[]) {
    if (cards.length < 5 || cards.length > 7) {
      throw new Error('Hand must contain 5-7 cards for evaluation');
    }
  }

  static evaluate(cards: Card[]): HandEvaluation {
    const hand = new Hand(cards);
    return hand.evaluate();
  }

  private evaluate(): HandEvaluation {
    const sortedCards = CardUtils.sortCards(this.cards);
    
    // Check for each hand type in descending order of strength
    const royalFlush = this.checkRoyalFlush(sortedCards);
    if (royalFlush) return royalFlush;

    const straightFlush = this.checkStraightFlush(sortedCards);
    if (straightFlush) return straightFlush;

    const fourOfAKind = this.checkFourOfAKind(sortedCards);
    if (fourOfAKind) return fourOfAKind;

    const fullHouse = this.checkFullHouse(sortedCards);
    if (fullHouse) return fullHouse;

    const flush = this.checkFlush(sortedCards);
    if (flush) return flush;

    const straight = this.checkStraight(sortedCards);
    if (straight) return straight;

    const threeOfAKind = this.checkThreeOfAKind(sortedCards);
    if (threeOfAKind) return threeOfAKind;

    const twoPair = this.checkTwoPair(sortedCards);
    if (twoPair) return twoPair;

    const pair = this.checkPair(sortedCards);
    if (pair) return pair;

    return this.checkHighCard(sortedCards);
  }

  private checkRoyalFlush(cards: Card[]): HandEvaluation | null {
    const straightFlush = this.checkStraightFlush(cards);
    if (straightFlush && straightFlush.highCard === Rank.ACE) {
      return {
        ranking: HandRanking.ROYAL_FLUSH,
        cards: straightFlush.cards,
        highCard: Rank.ACE,
        kickers: [],
        description: 'Royal Flush',
      };
    }
    return null;
  }

  private checkStraightFlush(cards: Card[]): HandEvaluation | null {
    const flush = this.checkFlush(cards);
    const straight = this.checkStraight(cards);
    
    if (flush && straight) {
      // Find 5 consecutive cards of the same suit
      const suitGroups = this.groupBySuit(cards);
      for (const suit of Object.keys(suitGroups)) {
        const suitCards = suitGroups[suit as Suit];
        if (suitCards && suitCards.length >= 5) {
          const straightInSuit = this.findStraightInCards(suitCards);
          if (straightInSuit) {
            return {
              ranking: HandRanking.STRAIGHT_FLUSH,
              cards: straightInSuit,
              highCard: straightInSuit[0].rank,
              kickers: [],
              description: `Straight Flush, ${straightInSuit[0].rank} high`,
            };
          }
        }
      }
    }
    return null;
  }

  private checkFourOfAKind(cards: Card[]): HandEvaluation | null {
    const rankGroups = this.groupByRank(cards);
    const fourOfAKindRank = Object.keys(rankGroups).find(
      rank => rankGroups[rank as Rank]?.length === 4
    ) as Rank | undefined;

    if (fourOfAKindRank) {
      const quadCards = rankGroups[fourOfAKindRank]!;
      const kicker = cards.find(card => card.rank !== fourOfAKindRank);
      
      return {
        ranking: HandRanking.FOUR_OF_A_KIND,
        cards: [...quadCards, ...(kicker ? [kicker] : [])].slice(0, 5),
        highCard: fourOfAKindRank,
        kickers: kicker ? [kicker.rank] : [],
        description: `Four of a Kind, ${fourOfAKindRank}s`,
      };
    }
    return null;
  }

  private checkFullHouse(cards: Card[]): HandEvaluation | null {
    const rankGroups = this.groupByRank(cards);
    const threeOfAKindRank = Object.keys(rankGroups).find(
      rank => rankGroups[rank as Rank]?.length === 3
    ) as Rank | undefined;
    
    const pairRank = Object.keys(rankGroups).find(
      rank => rank !== threeOfAKindRank && rankGroups[rank as Rank]?.length >= 2
    ) as Rank | undefined;

    if (threeOfAKindRank && pairRank) {
      const tripCards = rankGroups[threeOfAKindRank]!.slice(0, 3);
      const pairCards = rankGroups[pairRank]!.slice(0, 2);
      
      return {
        ranking: HandRanking.FULL_HOUSE,
        cards: [...tripCards, ...pairCards],
        highCard: threeOfAKindRank,
        kickers: [pairRank],
        description: `Full House, ${threeOfAKindRank}s over ${pairRank}s`,
      };
    }
    return null;
  }

  private checkFlush(cards: Card[]): HandEvaluation | null {
    const suitGroups = this.groupBySuit(cards);
    
    for (const suit of Object.keys(suitGroups)) {
      const suitCards = suitGroups[suit as Suit];
      if (suitCards && suitCards.length >= 5) {
        const flushCards = CardUtils.sortCards(suitCards).slice(0, 5);
        return {
          ranking: HandRanking.FLUSH,
          cards: flushCards,
          highCard: flushCards[0].rank,
          kickers: flushCards.slice(1).map(card => card.rank),
          description: `Flush, ${flushCards[0].rank} high`,
        };
      }
    }
    return null;
  }

  private checkStraight(cards: Card[]): HandEvaluation | null {
    const straightCards = this.findStraightInCards(cards);
    if (straightCards) {
      return {
        ranking: HandRanking.STRAIGHT,
        cards: straightCards,
        highCard: straightCards[0].rank,
        kickers: [],
        description: `Straight, ${straightCards[0].rank} high`,
      };
    }
    return null;
  }

  private checkThreeOfAKind(cards: Card[]): HandEvaluation | null {
    const rankGroups = this.groupByRank(cards);
    const threeOfAKindRank = Object.keys(rankGroups).find(
      rank => rankGroups[rank as Rank]?.length === 3
    ) as Rank | undefined;

    if (threeOfAKindRank) {
      const tripCards = rankGroups[threeOfAKindRank]!;
      const kickers = cards
        .filter(card => card.rank !== threeOfAKindRank)
        .sort((a, b) => CardUtils.getRankValue(b.rank) - CardUtils.getRankValue(a.rank))
        .slice(0, 2);
      
      return {
        ranking: HandRanking.THREE_OF_A_KIND,
        cards: [...tripCards, ...kickers],
        highCard: threeOfAKindRank,
        kickers: kickers.map(card => card.rank),
        description: `Three of a Kind, ${threeOfAKindRank}s`,
      };
    }
    return null;
  }

  private checkTwoPair(cards: Card[]): HandEvaluation | null {
    const rankGroups = this.groupByRank(cards);
    const pairs = Object.keys(rankGroups)
      .filter(rank => rankGroups[rank as Rank]?.length === 2)
      .map(rank => rank as Rank)
      .sort((a, b) => CardUtils.getRankValue(b) - CardUtils.getRankValue(a));

    if (pairs.length >= 2) {
      const highPair = rankGroups[pairs[0]]!;
      const lowPair = rankGroups[pairs[1]]!;
      const kicker = cards.find(card => 
        card.rank !== pairs[0] && card.rank !== pairs[1]
      );
      
      return {
        ranking: HandRanking.TWO_PAIR,
        cards: [...highPair, ...lowPair, ...(kicker ? [kicker] : [])].slice(0, 5),
        highCard: pairs[0],
        kickers: [pairs[1], ...(kicker ? [kicker.rank] : [])],
        description: `Two Pair, ${pairs[0]}s and ${pairs[1]}s`,
      };
    }
    return null;
  }

  private checkPair(cards: Card[]): HandEvaluation | null {
    const rankGroups = this.groupByRank(cards);
    const pairRank = Object.keys(rankGroups).find(
      rank => rankGroups[rank as Rank]?.length === 2
    ) as Rank | undefined;

    if (pairRank) {
      const pairCards = rankGroups[pairRank]!;
      const kickers = cards
        .filter(card => card.rank !== pairRank)
        .sort((a, b) => CardUtils.getRankValue(b.rank) - CardUtils.getRankValue(a.rank))
        .slice(0, 3);
      
      return {
        ranking: HandRanking.PAIR,
        cards: [...pairCards, ...kickers],
        highCard: pairRank,
        kickers: kickers.map(card => card.rank),
        description: `Pair of ${pairRank}s`,
      };
    }
    return null;
  }

  private checkHighCard(cards: Card[]): HandEvaluation {
    const sortedCards = CardUtils.sortCards(cards).slice(0, 5);
    return {
      ranking: HandRanking.HIGH_CARD,
      cards: sortedCards,
      highCard: sortedCards[0].rank,
      kickers: sortedCards.slice(1).map(card => card.rank),
      description: `High Card, ${sortedCards[0].rank}`,
    };
  }

  private groupByRank(cards: Card[]): Record<Rank, Card[]> {
    const groups: Partial<Record<Rank, Card[]>> = {};
    for (const card of cards) {
      if (!groups[card.rank]) {
        groups[card.rank] = [];
      }
      groups[card.rank]!.push(card);
    }
    return groups as Record<Rank, Card[]>;
  }

  private groupBySuit(cards: Card[]): Record<Suit, Card[]> {
    const groups: Partial<Record<Suit, Card[]>> = {};
    for (const card of cards) {
      if (!groups[card.suit]) {
        groups[card.suit] = [];
      }
      groups[card.suit]!.push(card);
    }
    return groups as Record<Suit, Card[]>;
  }

  private findStraightInCards(cards: Card[]): Card[] | null {
    const uniqueRanks = [...new Set(cards.map(card => card.rank))];
    const rankValues = uniqueRanks
      .map(rank => ({ rank, value: CardUtils.getRankValue(rank) }))
      .sort((a, b) => b.value - a.value);

    // Check for regular straight
    for (let i = 0; i <= rankValues.length - 5; i++) {
      const consecutiveRanks = rankValues.slice(i, i + 5);
      const isConsecutive = consecutiveRanks.every(
        (rank, index, arr) => 
          index === 0 || arr[index - 1].value === rank.value + 1
      );
      
      if (isConsecutive) {
        const straightCards = consecutiveRanks.map(({ rank }) => 
          cards.find(card => card.rank === rank)!
        );
        return straightCards;
      }
    }

    // Check for A-2-3-4-5 straight (wheel)
    const wheelRanks = [Rank.ACE, Rank.FIVE, Rank.FOUR, Rank.THREE, Rank.TWO];
    const hasWheelRanks = wheelRanks.every(rank => 
      uniqueRanks.includes(rank)
    );
    
    if (hasWheelRanks) {
      const wheelCards = wheelRanks.map(rank => 
        cards.find(card => card.rank === rank)!
      );
      return wheelCards;
    }

    return null;
  }

  static compareHands(hand1: HandEvaluation, hand2: HandEvaluation): number {
    // Compare hand rankings first
    if (hand1.ranking !== hand2.ranking) {
      return hand2.ranking - hand1.ranking;
    }

    // Compare high cards
    const hand1HighValue = CardUtils.getRankValue(hand1.highCard);
    const hand2HighValue = CardUtils.getRankValue(hand2.highCard);
    
    if (hand1HighValue !== hand2HighValue) {
      return hand2HighValue - hand1HighValue;
    }

    // Compare kickers
    for (let i = 0; i < Math.max(hand1.kickers.length, hand2.kickers.length); i++) {
      const kicker1 = hand1.kickers[i];
      const kicker2 = hand2.kickers[i];
      
      if (!kicker1 && !kicker2) continue;
      if (!kicker1) return 1;
      if (!kicker2) return -1;
      
      const kicker1Value = CardUtils.getRankValue(kicker1);
      const kicker2Value = CardUtils.getRankValue(kicker2);
      
      if (kicker1Value !== kicker2Value) {
        return kicker2Value - kicker1Value;
      }
    }

    return 0; // Hands are equal
  }
}

export interface HandEvaluation {
  ranking: HandRanking;
  cards: Card[];
  highCard: Rank;
  kickers: Rank[];
  description: string;
}
