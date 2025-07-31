/**
 * Texas Hold'em Hand Evaluator
 * Evaluates poker hands and determines winners with detailed hand information
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface HandResult {
  handType: HandType;
  handRank: number;
  handName: string;
  handDescription: string;
  kickers: Rank[];
  cards: Card[];
  strength: number; // 0-1 for comparison
}

export enum HandType {
  HIGH_CARD = 0,
  PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9
}

export const HAND_NAMES: Record<HandType, string> = {
  [HandType.HIGH_CARD]: 'High Card',
  [HandType.PAIR]: 'Pair',
  [HandType.TWO_PAIR]: 'Two Pair',
  [HandType.THREE_OF_KIND]: 'Three of a Kind',
  [HandType.STRAIGHT]: 'Straight',
  [HandType.FLUSH]: 'Flush',
  [HandType.FULL_HOUSE]: 'Full House',
  [HandType.FOUR_OF_KIND]: 'Four of a Kind',
  [HandType.STRAIGHT_FLUSH]: 'Straight Flush',
  [HandType.ROYAL_FLUSH]: 'Royal Flush'
};

// Rank values for comparison (Ace high)
const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Low Ace values for A-2-3-4-5 straight
const LOW_ACE_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 1
};

/**
 * Evaluates a 7-card hand (2 hole cards + 5 community cards) for best 5-card poker hand
 */
export function evaluateHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length !== 7) {
    throw new Error('Hand evaluation requires exactly 7 cards (2 hole + 5 community)');
  }

  // Find the best 5-card combination from 7 cards
  const combinations = generateCombinations(allCards, 5);
  let bestHand: HandResult | null = null;

  for (const combo of combinations) {
    const handResult = evaluateFiveCardHand(combo);
    if (!bestHand || handResult.strength > bestHand.strength) {
      bestHand = handResult;
    }
  }

  return bestHand!;
}

/**
 * Evaluates a 5-card poker hand
 */
function evaluateFiveCardHand(cards: Card[]): HandResult {
  if (cards.length !== 5) {
    throw new Error('Must evaluate exactly 5 cards');
  }

  // Sort cards by rank (high to low)
  const sortedCards = cards.slice().sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  
  // Check for each hand type (highest to lowest)
  const royalFlush = checkRoyalFlush(sortedCards);
  if (royalFlush) return royalFlush;

  const straightFlush = checkStraightFlush(sortedCards);
  if (straightFlush) return straightFlush;

  const fourOfKind = checkFourOfKind(sortedCards);
  if (fourOfKind) return fourOfKind;

  const fullHouse = checkFullHouse(sortedCards);
  if (fullHouse) return fullHouse;

  const flush = checkFlush(sortedCards);
  if (flush) return flush;

  const straight = checkStraight(sortedCards);
  if (straight) return straight;

  const threeOfKind = checkThreeOfKind(sortedCards);
  if (threeOfKind) return threeOfKind;

  const twoPair = checkTwoPair(sortedCards);
  if (twoPair) return twoPair;

  const pair = checkPair(sortedCards);
  if (pair) return pair;

  return checkHighCard(sortedCards);
}

function checkRoyalFlush(cards: Card[]): HandResult | null {
  const isFlush = checkFlushSuit(cards);
  if (!isFlush) return null;

  const ranks = cards.map(c => c.rank).sort((a, b) => RANK_VALUES[b] - RANK_VALUES[a]);
  const royalRanks = ['A', 'K', 'Q', 'J', 'T'];
  
  if (JSON.stringify(ranks) === JSON.stringify(royalRanks)) {
    return {
      handType: HandType.ROYAL_FLUSH,
      handRank: HandType.ROYAL_FLUSH,
      handName: HAND_NAMES[HandType.ROYAL_FLUSH],
      handDescription: `Royal Flush (${isFlush})`,
      kickers: [],
      cards: cards.slice(),
      strength: 9.0
    };
  }
  return null;
}

function checkStraightFlush(cards: Card[]): HandResult | null {
  const isFlush = checkFlushSuit(cards);
  if (!isFlush) return null;

  const straightInfo = checkStraightRank(cards);
  if (straightInfo === null) return null;

  return {
    handType: HandType.STRAIGHT_FLUSH,
    handRank: HandType.STRAIGHT_FLUSH,
    handName: HAND_NAMES[HandType.STRAIGHT_FLUSH],
    handDescription: `Straight Flush, ${getHighRankName(straightInfo)} high (${isFlush})`,
    kickers: [],
    cards: cards.slice(),
    strength: 8.0 + (straightInfo / 15)
  };
}

function checkFourOfKind(cards: Card[]): HandResult | null {
  const rankCounts = getRankCounts(cards);
  const fourRank = Object.keys(rankCounts).find(rank => rankCounts[rank as Rank] === 4) as Rank | undefined;
  
  if (!fourRank) return null;

  const kicker = Object.keys(rankCounts).find(rank => rank !== fourRank) as Rank;
  
  return {
    handType: HandType.FOUR_OF_KIND,
    handRank: HandType.FOUR_OF_KIND,
    handName: HAND_NAMES[HandType.FOUR_OF_KIND],
    handDescription: `Four ${getRankName(fourRank)}s`,
    kickers: [kicker],
    cards: cards.slice(),
    strength: 7.0 + (RANK_VALUES[fourRank] / 15) + (RANK_VALUES[kicker] / 225)
  };
}

function checkFullHouse(cards: Card[]): HandResult | null {
  const rankCounts = getRankCounts(cards);
  const threeRank = Object.keys(rankCounts).find(rank => rankCounts[rank as Rank] === 3) as Rank | undefined;
  const pairRank = Object.keys(rankCounts).find(rank => rankCounts[rank as Rank] === 2) as Rank | undefined;
  
  if (!threeRank || !pairRank) return null;
  
  return {
    handType: HandType.FULL_HOUSE,
    handRank: HandType.FULL_HOUSE,
    handName: HAND_NAMES[HandType.FULL_HOUSE],
    handDescription: `${getRankName(threeRank)}s full of ${getRankName(pairRank)}s`,
    kickers: [],
    cards: cards.slice(),
    strength: 6.0 + (RANK_VALUES[threeRank] / 15) + (RANK_VALUES[pairRank] / 225)
  };
}

function checkFlush(cards: Card[]): HandResult | null {
  const suit = checkFlushSuit(cards);
  if (!suit) return null;

  const sortedRanks = cards.map(c => c.rank).sort((a, b) => RANK_VALUES[b] - RANK_VALUES[a]);
  
  return {
    handType: HandType.FLUSH,
    handRank: HandType.FLUSH,
    handName: HAND_NAMES[HandType.FLUSH],
    handDescription: `${suit.charAt(0).toUpperCase() + suit.slice(1)} Flush, ${getRankName(sortedRanks[0])} high`,
    kickers: sortedRanks.slice(1),
    cards: cards.slice(),
    strength: 5.0 + (RANK_VALUES[sortedRanks[0]] / 15) + (RANK_VALUES[sortedRanks[1]] / 225)
  };
}

function checkStraight(cards: Card[]): HandResult | null {
  const highRank = checkStraightRank(cards);
  if (highRank === null) return null;

  return {
    handType: HandType.STRAIGHT,
    handRank: HandType.STRAIGHT,
    handName: HAND_NAMES[HandType.STRAIGHT],
    handDescription: `Straight, ${getHighRankName(highRank)} high`,
    kickers: [],
    cards: cards.slice(),
    strength: 4.0 + (highRank / 15)
  };
}

function checkThreeOfKind(cards: Card[]): HandResult | null {
  const rankCounts = getRankCounts(cards);
  const threeRank = Object.keys(rankCounts).find(rank => rankCounts[rank as Rank] === 3) as Rank | undefined;
  
  if (!threeRank) return null;

  const kickers = Object.keys(rankCounts)
    .filter(rank => rank !== threeRank)
    .sort((a, b) => RANK_VALUES[b as Rank] - RANK_VALUES[a as Rank]) as Rank[];
  
  return {
    handType: HandType.THREE_OF_KIND,
    handRank: HandType.THREE_OF_KIND,
    handName: HAND_NAMES[HandType.THREE_OF_KIND],
    handDescription: `Three ${getRankName(threeRank)}s`,
    kickers,
    cards: cards.slice(),
    strength: 3.0 + (RANK_VALUES[threeRank] / 15) + (RANK_VALUES[kickers[0]] / 225)
  };
}

function checkTwoPair(cards: Card[]): HandResult | null {
  const rankCounts = getRankCounts(cards);
  const pairs = Object.keys(rankCounts)
    .filter(rank => rankCounts[rank as Rank] === 2)
    .sort((a, b) => RANK_VALUES[b as Rank] - RANK_VALUES[a as Rank]) as Rank[];
  
  if (pairs.length !== 2) return null;

  const kicker = Object.keys(rankCounts).find(rank => rankCounts[rank as Rank] === 1) as Rank;
  
  return {
    handType: HandType.TWO_PAIR,
    handRank: HandType.TWO_PAIR,
    handName: HAND_NAMES[HandType.TWO_PAIR],
    handDescription: `Two Pair, ${getRankName(pairs[0])}s and ${getRankName(pairs[1])}s`,
    kickers: [kicker],
    cards: cards.slice(),
    strength: 2.0 + (RANK_VALUES[pairs[0]] / 15) + (RANK_VALUES[pairs[1]] / 225) + (RANK_VALUES[kicker] / 3375)
  };
}

function checkPair(cards: Card[]): HandResult | null {
  const rankCounts = getRankCounts(cards);
  const pairRank = Object.keys(rankCounts).find(rank => rankCounts[rank as Rank] === 2) as Rank | undefined;
  
  if (!pairRank) return null;

  const kickers = Object.keys(rankCounts)
    .filter(rank => rank !== pairRank)
    .sort((a, b) => RANK_VALUES[b as Rank] - RANK_VALUES[a as Rank]) as Rank[];
  
  return {
    handType: HandType.PAIR,
    handRank: HandType.PAIR,
    handName: HAND_NAMES[HandType.PAIR],
    handDescription: `Pair of ${getRankName(pairRank)}s`,
    kickers,
    cards: cards.slice(),
    strength: 1.0 + (RANK_VALUES[pairRank] / 15) + (RANK_VALUES[kickers[0]] / 225)
  };
}

function checkHighCard(cards: Card[]): HandResult {
  const sortedRanks = cards.map(c => c.rank).sort((a, b) => RANK_VALUES[b] - RANK_VALUES[a]);
  
  return {
    handType: HandType.HIGH_CARD,
    handRank: HandType.HIGH_CARD,
    handName: HAND_NAMES[HandType.HIGH_CARD],
    handDescription: `High Card, ${getRankName(sortedRanks[0])} high`,
    kickers: sortedRanks.slice(1),
    cards: cards.slice(),
    strength: 0.0 + (RANK_VALUES[sortedRanks[0]] / 15) + (RANK_VALUES[sortedRanks[1]] / 225)
  };
}

// Helper functions
function checkFlushSuit(cards: Card[]): Suit | null {
  const suitCounts: Record<Suit, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
  
  cards.forEach(card => suitCounts[card.suit]++);
  
  for (const suit of Object.keys(suitCounts) as Suit[]) {
    if (suitCounts[suit] === 5) return suit;
  }
  return null;
}

function checkStraightRank(cards: Card[]): number | null {
  // Check regular straight (Ace high)
  const ranks = [...new Set(cards.map(c => RANK_VALUES[c.rank]))].sort((a, b) => b - a);
  if (isConsecutive(ranks)) {
    return ranks[0];
  }

  // Check low straight (A-2-3-4-5)
  const lowRanks = [...new Set(cards.map(c => LOW_ACE_VALUES[c.rank]))].sort((a, b) => b - a);
  if (isConsecutive(lowRanks) && lowRanks.includes(1)) {
    return 5; // 5-high straight
  }

  return null;
}

function isConsecutive(numbers: number[]): boolean {
  if (numbers.length !== 5) return false;
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i-1] - numbers[i] !== 1) return false;
  }
  return true;
}

function getRankCounts(cards: Card[]): Record<Rank, number> {
  const counts: Partial<Record<Rank, number>> = {};
  cards.forEach(card => {
    counts[card.rank] = (counts[card.rank] || 0) + 1;
  });
  return counts as Record<Rank, number>;
}

function getRankName(rank: Rank): string {
  const names: Record<Rank, string> = {
    'A': 'Ace', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five',
    '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine', 'T': 'Ten',
    'J': 'Jack', 'Q': 'Queen', 'K': 'King'
  };
  return names[rank];
}

function getHighRankName(value: number): string {
  const valueToRank: Record<number, Rank> = {
    14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T',
    9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2'
  };
  const rank = valueToRank[value];
  return rank ? getRankName(rank) : 'Unknown';
}

// Generate all 5-card combinations from 7 cards (21 combinations)
function generateCombinations<T>(arr: T[], size: number): T[][] {
  if (size > arr.length) return [];
  if (size === 1) return arr.map(item => [item]);
  
  const combinations: T[][] = [];
  
  for (let i = 0; i <= arr.length - size; i++) {
    const head = arr[i];
    const tailCombinations = generateCombinations(arr.slice(i + 1), size - 1);
    
    for (const tailCombination of tailCombinations) {
      combinations.push([head, ...tailCombination]);
    }
  }
  
  return combinations;
}

/**
 * Compare two hands and determine winner
 * Returns: 1 if hand1 wins, -1 if hand2 wins, 0 if tie
 */
export function compareHands(hand1: HandResult, hand2: HandResult): number {
  if (hand1.strength > hand2.strength) return 1;
  if (hand1.strength < hand2.strength) return -1;
  return 0;
}

/**
 * Convert card string notation to Card object
 * e.g., "As" -> { rank: 'A', suit: 'spades' }
 */
export function parseCard(cardStr: string): Card {
  if (cardStr.length !== 2) throw new Error('Invalid card format');
  
  const rank = cardStr[0] as Rank;
  const suitChar = cardStr[1].toLowerCase();
  
  const suitMap: Record<string, Suit> = {
    'h': 'hearts', 'd': 'diamonds', 'c': 'clubs', 's': 'spades'
  };
  
  const suit = suitMap[suitChar];
  if (!suit) throw new Error('Invalid suit');
  
  return { rank, suit };
}

/**
 * Convert Card object to string notation
 * e.g., { rank: 'A', suit: 'spades' } -> "As"
 */
export function cardToString(card: Card): string {
  const suitMap: Record<Suit, string> = {
    'hearts': 'h', 'diamonds': 'd', 'clubs': 'c', 'spades': 's'
  };
  return `${card.rank}${suitMap[card.suit]}`;
}
