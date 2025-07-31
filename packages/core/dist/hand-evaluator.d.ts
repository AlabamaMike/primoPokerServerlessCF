import { Card, Rank, HandRanking } from '@primo-poker/shared';
export declare class Hand {
    private cards;
    constructor(cards: Card[]);
    static evaluate(cards: Card[]): HandEvaluation;
    private evaluate;
    private checkRoyalFlush;
    private checkStraightFlush;
    private checkFourOfAKind;
    private checkFullHouse;
    private checkFlush;
    private checkStraight;
    private checkThreeOfAKind;
    private checkTwoPair;
    private checkPair;
    private checkHighCard;
    private groupByRank;
    private groupBySuit;
    private findStraightInCards;
    static compareHands(hand1: HandEvaluation, hand2: HandEvaluation): number;
}
export interface HandEvaluation {
    ranking: HandRanking;
    cards: Card[];
    highCard: Rank;
    kickers: Rank[];
    description: string;
}
//# sourceMappingURL=hand-evaluator.d.ts.map