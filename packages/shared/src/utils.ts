// Utility functions for poker operations
import { Card, Rank, Suit, HandRanking } from './types';

export class CardUtils {
  static getRankValue(rank: Rank): number {
    const rankValues: Record<Rank, number> = {
      [Rank.TWO]: 2,
      [Rank.THREE]: 3,
      [Rank.FOUR]: 4,
      [Rank.FIVE]: 5,
      [Rank.SIX]: 6,
      [Rank.SEVEN]: 7,
      [Rank.EIGHT]: 8,
      [Rank.NINE]: 9,
      [Rank.TEN]: 10,
      [Rank.JACK]: 11,
      [Rank.QUEEN]: 12,
      [Rank.KING]: 13,
      [Rank.ACE]: 14,
    };
    return rankValues[rank];
  }

  static createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of Object.values(Suit)) {
      for (const rank of Object.values(Rank)) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  }

  static toString(card: Card): string {
    return `${card.rank}${card.suit[0]?.toUpperCase() ?? ''}`;
  }

  static stringToCard(cardStr: string): Card {
    const rank = cardStr.slice(0, -1) as Rank;
    const suitChar = cardStr.slice(-1).toLowerCase();
    const suitMap: Record<string, Suit> = {
      h: Suit.HEARTS,
      d: Suit.DIAMONDS,
      c: Suit.CLUBS,
      s: Suit.SPADES,
    };
    const suit = suitMap[suitChar];
    if (!suit) {
      throw new Error(`Invalid suit character: ${suitChar}`);
    }
    return { suit, rank };
  }

  static sortCards(cards: Card[]): Card[] {
    return [...cards].sort((a, b) => {
      const aValue = this.getRankValue(a.rank);
      const bValue = this.getRankValue(b.rank);
      return bValue - aValue; // Sort in descending order
    });
  }
}

export class PokerMath {
  static calculatePot(bets: number[]): number {
    return bets.reduce((sum, bet) => sum + bet, 0);
  }

  static calculateSidePots(playerBets: Array<{ playerId: string; amount: number }>): Array<{
    amount: number;
    eligiblePlayers: string[];
  }> {
    const sidePots: Array<{ amount: number; eligiblePlayers: string[] }> = [];
    const sortedBets = [...playerBets].sort((a, b) => a.amount - b.amount);
    
    let previousAmount = 0;
    for (let i = 0; i < sortedBets.length; i++) {
      const bet = sortedBets[i];
      if (!bet) continue;
      
      const currentAmount = bet.amount;
      const potContribution = currentAmount - previousAmount;
      
      if (potContribution > 0) {
        const eligiblePlayers = sortedBets.slice(i).map(bet => bet.playerId);
        const potAmount = potContribution * eligiblePlayers.length;
        sidePots.push({ amount: potAmount, eligiblePlayers });
        previousAmount = currentAmount;
      }
    }
    
    return sidePots;
  }

  static calculateBlindPositions(playerCount: number, dealerPosition: number): {
    smallBlind: number;
    bigBlind: number;
  } {
    if (playerCount === 2) {
      return {
        smallBlind: dealerPosition,
        bigBlind: (dealerPosition + 1) % playerCount,
      };
    }
    
    return {
      smallBlind: (dealerPosition + 1) % playerCount,
      bigBlind: (dealerPosition + 2) % playerCount,
    };
  }

  static calculateNextPosition(currentPosition: number, playerCount: number): number {
    return (currentPosition + 1) % playerCount;
  }
}

export class ValidationUtils {
  static isValidBetAmount(amount: number, minBet: number, maxBet: number): boolean {
    return amount >= minBet && amount <= maxBet && Number.isInteger(amount);
  }

  static isValidRaise(raiseAmount: number, currentBet: number, minRaise: number): boolean {
    return raiseAmount >= currentBet + minRaise;
  }

  static sanitizeUsername(username: string): string {
    return username.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 20);
  }

  static sanitizeChatMessage(message: string): string {
    // Basic profanity filter and sanitization
    const profanity = ['badword1', 'badword2']; // Add actual profanity list
    let sanitized = message.trim().substring(0, 200);
    
    profanity.forEach(word => {
      const regex = new RegExp(word, 'gi');
      sanitized = sanitized.replace(regex, '*'.repeat(word.length));
    });
    
    return sanitized;
  }
}

export class TimeUtils {
  static now(): Date {
    return new Date();
  }

  static addSeconds(date: Date, seconds: number): Date {
    return new Date(date.getTime() + seconds * 1000);
  }

  static isExpired(expiryDate: Date): boolean {
    return new Date() > expiryDate;
  }

  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  }
}

export class RandomUtils {
  static generateUUID(): string {
    return crypto.randomUUID();
  }

  static generateSecureRandom(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  static shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const randomBytes = crypto.getRandomValues(new Uint8Array(1));
      const randomByte = randomBytes[0];
      if (randomByte === undefined) continue;
      
      const j = Math.floor((randomByte / 256) * (i + 1));
      const itemI = shuffled[i];
      const itemJ = shuffled[j];
      if (itemI !== undefined && itemJ !== undefined) {
        shuffled[i] = itemJ;
        shuffled[j] = itemI;
      }
    }
    return shuffled;
  }

  static generateSeed(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

export class EventUtils {
  static createEventId(): string {
    return RandomUtils.generateUUID();
  }

  static serializeEvent(event: unknown): string {
    return JSON.stringify(event, null, 2);
  }

  static deserializeEvent<T>(eventData: string): T {
    return JSON.parse(eventData) as T;
  }
}

// Constants
export const POKER_CONSTANTS = {
  MAX_PLAYERS_PER_TABLE: 10,
  MIN_PLAYERS_PER_TABLE: 2,
  DEFAULT_TIME_BANK: 30,
  MAX_CHAT_MESSAGE_LENGTH: 200,
  MAX_USERNAME_LENGTH: 20,
  MIN_USERNAME_LENGTH: 3,
  CARDS_PER_DECK: 52,
  TEXAS_HOLDEM_HOLE_CARDS: 2,
  OMAHA_HOLE_CARDS: 4,
  COMMUNITY_CARDS_FLOP: 3,
  COMMUNITY_CARDS_TURN: 1,
  COMMUNITY_CARDS_RIVER: 1,
  MAX_COMMUNITY_CARDS: 5,
} as const;
