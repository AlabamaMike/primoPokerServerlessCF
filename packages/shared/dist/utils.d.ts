import { Card, Rank } from './types';
export declare class CardUtils {
    static getRankValue(rank: Rank): number;
    static createDeck(): Card[];
    static toString(card: Card): string;
    static stringToCard(cardStr: string): Card;
    static sortCards(cards: Card[]): Card[];
}
export declare class PokerMath {
    static calculatePot(bets: number[]): number;
    static calculateSidePots(playerBets: Array<{
        playerId: string;
        amount: number;
    }>): Array<{
        amount: number;
        eligiblePlayers: string[];
    }>;
    static calculateBlindPositions(playerCount: number, dealerPosition: number): {
        smallBlind: number;
        bigBlind: number;
    };
    static calculateNextPosition(currentPosition: number, playerCount: number): number;
}
export declare class ValidationUtils {
    static isValidBetAmount(amount: number, minBet: number, maxBet: number): boolean;
    static isValidRaise(raiseAmount: number, currentBet: number, minRaise: number): boolean;
    static sanitizeUsername(username: string): string;
    static sanitizeChatMessage(message: string): string;
}
export declare class TimeUtils {
    static now(): Date;
    static addSeconds(date: Date, seconds: number): Date;
    static isExpired(expiryDate: Date): boolean;
    static formatDuration(seconds: number): string;
}
export declare class RandomUtils {
    static generateUUID(): string;
    static generateSecureRandom(length: number): Uint8Array;
    static shuffleArray<T>(array: T[]): T[];
    static generateSeed(): string;
}
export declare class EventUtils {
    static createEventId(): string;
    static serializeEvent(event: unknown): string;
    static deserializeEvent<T>(eventData: string): T;
}
export declare const POKER_CONSTANTS: {
    readonly MAX_PLAYERS_PER_TABLE: 10;
    readonly MIN_PLAYERS_PER_TABLE: 2;
    readonly DEFAULT_TIME_BANK: 30;
    readonly MAX_CHAT_MESSAGE_LENGTH: 200;
    readonly MAX_USERNAME_LENGTH: 20;
    readonly MIN_USERNAME_LENGTH: 3;
    readonly CARDS_PER_DECK: 52;
    readonly TEXAS_HOLDEM_HOLE_CARDS: 2;
    readonly OMAHA_HOLE_CARDS: 4;
    readonly COMMUNITY_CARDS_FLOP: 3;
    readonly COMMUNITY_CARDS_TURN: 1;
    readonly COMMUNITY_CARDS_RIVER: 1;
    readonly MAX_COMMUNITY_CARDS: 5;
};
//# sourceMappingURL=utils.d.ts.map