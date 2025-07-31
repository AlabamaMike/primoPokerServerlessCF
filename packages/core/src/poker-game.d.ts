import { Player, GameState, BetResult, ShowdownResult, TableConfig } from '@primo-poker/shared';
export interface IPokerGame {
    dealCards(): Promise<void>;
    processBet(playerId: string, amount: number): Promise<BetResult>;
    evaluateShowdown(): Promise<ShowdownResult>;
    getGameState(): GameState;
}
export declare class PokerGame implements IPokerGame {
    private tableConfig;
    private gameState;
    private players;
    private deck;
    private playerHands;
    private currentBets;
    constructor(tableConfig: TableConfig, initialPlayers: Player[]);
    private initializeGameState;
    dealCards(): Promise<void>;
    processBet(playerId: string, amount: number): Promise<BetResult>;
    evaluateShowdown(): Promise<ShowdownResult>;
    getGameState(): GameState;
    private shuffleDeck;
    private getCardsPerPlayer;
    private calculateBlindPositions;
    private postBlinds;
    private determineAction;
    private executeAction;
    private advanceToNextPlayer;
    private getNextActivePlayer;
    private checkPhaseCompletion;
    private dealFlop;
    private dealTurn;
    private dealRiver;
    private determineWinners;
    private distributePot;
}
//# sourceMappingURL=poker-game.d.ts.map