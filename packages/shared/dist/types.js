import { z } from 'zod';
// Basic poker types
export var Suit;
(function (Suit) {
    Suit["HEARTS"] = "hearts";
    Suit["DIAMONDS"] = "diamonds";
    Suit["CLUBS"] = "clubs";
    Suit["SPADES"] = "spades";
})(Suit || (Suit = {}));
export var Rank;
(function (Rank) {
    Rank["TWO"] = "2";
    Rank["THREE"] = "3";
    Rank["FOUR"] = "4";
    Rank["FIVE"] = "5";
    Rank["SIX"] = "6";
    Rank["SEVEN"] = "7";
    Rank["EIGHT"] = "8";
    Rank["NINE"] = "9";
    Rank["TEN"] = "10";
    Rank["JACK"] = "J";
    Rank["QUEEN"] = "Q";
    Rank["KING"] = "K";
    Rank["ACE"] = "A";
})(Rank || (Rank = {}));
export var GameType;
(function (GameType) {
    GameType["TEXAS_HOLDEM"] = "texas_holdem";
    GameType["OMAHA"] = "omaha";
    GameType["OMAHA_HI_LO"] = "omaha_hi_lo";
    GameType["SEVEN_CARD_STUD"] = "7_card_stud";
    GameType["SEVEN_CARD_STUD_HI_LO"] = "7_card_stud_hi_lo";
})(GameType || (GameType = {}));
export var BettingStructure;
(function (BettingStructure) {
    BettingStructure["LIMIT"] = "limit";
    BettingStructure["NO_LIMIT"] = "no_limit";
    BettingStructure["POT_LIMIT"] = "pot_limit";
})(BettingStructure || (BettingStructure = {}));
export var GameFormat;
(function (GameFormat) {
    GameFormat["CASH"] = "cash";
    GameFormat["TOURNAMENT"] = "tournament";
    GameFormat["SIT_N_GO"] = "sit_n_go";
    GameFormat["HEADS_UP"] = "heads_up";
})(GameFormat || (GameFormat = {}));
export var PlayerAction;
(function (PlayerAction) {
    PlayerAction["FOLD"] = "fold";
    PlayerAction["CHECK"] = "check";
    PlayerAction["CALL"] = "call";
    PlayerAction["BET"] = "bet";
    PlayerAction["RAISE"] = "raise";
    PlayerAction["ALL_IN"] = "all_in";
})(PlayerAction || (PlayerAction = {}));
export var GamePhase;
(function (GamePhase) {
    GamePhase["WAITING"] = "waiting";
    GamePhase["PRE_FLOP"] = "pre_flop";
    GamePhase["FLOP"] = "flop";
    GamePhase["TURN"] = "turn";
    GamePhase["RIVER"] = "river";
    GamePhase["SHOWDOWN"] = "showdown";
    GamePhase["FINISHED"] = "finished";
})(GamePhase || (GamePhase = {}));
export var HandRanking;
(function (HandRanking) {
    HandRanking[HandRanking["HIGH_CARD"] = 0] = "HIGH_CARD";
    HandRanking[HandRanking["PAIR"] = 1] = "PAIR";
    HandRanking[HandRanking["TWO_PAIR"] = 2] = "TWO_PAIR";
    HandRanking[HandRanking["THREE_OF_A_KIND"] = 3] = "THREE_OF_A_KIND";
    HandRanking[HandRanking["STRAIGHT"] = 4] = "STRAIGHT";
    HandRanking[HandRanking["FLUSH"] = 5] = "FLUSH";
    HandRanking[HandRanking["FULL_HOUSE"] = 6] = "FULL_HOUSE";
    HandRanking[HandRanking["FOUR_OF_A_KIND"] = 7] = "FOUR_OF_A_KIND";
    HandRanking[HandRanking["STRAIGHT_FLUSH"] = 8] = "STRAIGHT_FLUSH";
    HandRanking[HandRanking["ROYAL_FLUSH"] = 9] = "ROYAL_FLUSH";
})(HandRanking || (HandRanking = {}));
export var TournamentState;
(function (TournamentState) {
    TournamentState["REGISTERING"] = "registering";
    TournamentState["STARTING"] = "starting";
    TournamentState["IN_PROGRESS"] = "in_progress";
    TournamentState["FINAL_TABLE"] = "final_table";
    TournamentState["FINISHED"] = "finished";
    TournamentState["CANCELLED"] = "cancelled";
})(TournamentState || (TournamentState = {}));
export var PlayerStatus;
(function (PlayerStatus) {
    PlayerStatus["ACTIVE"] = "active";
    PlayerStatus["SITTING_OUT"] = "sitting_out";
    PlayerStatus["AWAY"] = "away";
    PlayerStatus["DISCONNECTED"] = "disconnected";
    PlayerStatus["ELIMINATED"] = "eliminated";
    PlayerStatus["FOLDED"] = "folded";
    PlayerStatus["ALL_IN"] = "all_in";
    PlayerStatus["WAITING"] = "waiting";
    PlayerStatus["PLAYING"] = "playing";
})(PlayerStatus || (PlayerStatus = {}));
// Zod schemas for runtime validation
export const CardSchema = z.object({
    suit: z.nativeEnum(Suit),
    rank: z.nativeEnum(Rank),
});
export const ChipSchema = z.object({
    amount: z.number().positive(),
    currency: z.string().default('USD'),
});
export const BetSchema = z.object({
    playerId: z.string().uuid(),
    action: z.nativeEnum(PlayerAction),
    amount: z.number().nonnegative(),
    timestamp: z.date(),
});
export const PositionSchema = z.object({
    seat: z.number().int().min(0).max(9),
    isButton: z.boolean().default(false),
    isSmallBlind: z.boolean().default(false),
    isBigBlind: z.boolean().default(false),
});
export const TableConfigSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(50),
    gameType: z.nativeEnum(GameType),
    bettingStructure: z.nativeEnum(BettingStructure),
    gameFormat: z.nativeEnum(GameFormat),
    maxPlayers: z.number().int().min(2).max(10),
    minBuyIn: z.number().positive(),
    maxBuyIn: z.number().positive(),
    smallBlind: z.number().positive(),
    bigBlind: z.number().positive(),
    ante: z.number().nonnegative().default(0),
    timeBank: z.number().int().positive().default(30),
    isPrivate: z.boolean().default(false),
    password: z.string().optional(),
});
export const PlayerSchema = z.object({
    id: z.string().uuid(),
    username: z.string().min(3).max(20),
    email: z.string().email(),
    chipCount: z.number().nonnegative(),
    position: PositionSchema.optional(),
    status: z.nativeEnum(PlayerStatus),
    isDealer: z.boolean().default(false),
    timeBank: z.number().int().nonnegative().default(30),
    lastAction: z.date().optional(),
});
export const GameStateSchema = z.object({
    tableId: z.string().uuid(),
    gameId: z.string().uuid(),
    phase: z.nativeEnum(GamePhase),
    pot: z.number().nonnegative(),
    sidePots: z.array(z.number().nonnegative()).default([]),
    communityCards: z.array(CardSchema).max(5),
    currentBet: z.number().nonnegative(),
    minRaise: z.number().positive(),
    activePlayerId: z.string().uuid().optional(),
    dealerId: z.string().uuid(),
    smallBlindId: z.string().uuid(),
    bigBlindId: z.string().uuid(),
    handNumber: z.number().int().positive(),
    timestamp: z.date(),
});
// Error types
export class PokerError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'PokerError';
    }
}
export class GameRuleError extends PokerError {
    constructor(message, details) {
        super('GAME_RULE_ERROR', message, details);
        this.name = 'GameRuleError';
    }
}
export class InsufficientFundsError extends PokerError {
    constructor(required, available) {
        super('INSUFFICIENT_FUNDS', `Insufficient funds: required ${required}, available ${available}`, { required, available });
        this.name = 'InsufficientFundsError';
    }
}
export class InvalidActionError extends PokerError {
    constructor(action, phase) {
        super('INVALID_ACTION', `Invalid action ${action} in phase ${phase}`, { action, phase });
        this.name = 'InvalidActionError';
    }
}
export class TableFullError extends PokerError {
    constructor(tableId) {
        super('TABLE_FULL', `Table ${tableId} is full`, { tableId });
        this.name = 'TableFullError';
    }
}
export class PlayerNotFoundError extends PokerError {
    constructor(playerId) {
        super('PLAYER_NOT_FOUND', `Player ${playerId} not found`, { playerId });
        this.name = 'PlayerNotFoundError';
    }
}
//# sourceMappingURL=types.js.map