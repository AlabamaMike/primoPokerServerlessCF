import { GameState, PlayerAction } from '../domain/game';
import { Player } from '../domain/player';

/**
 * Base WebSocket message structure
 */

export interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: number;
  id?: string;
  version?: number;
  sequenceId?: number;
  requiresAck?: boolean;
  correlationId?: string;
  stateVersion?: number;
}

/**
 * Client to server messages
 */

export interface PlayerActionMessage extends WebSocketMessage {
  type: 'player_action';
  payload: {
    playerId: string;
    action: PlayerAction;
    amount?: number;
  };
}

export interface ChatMessage extends WebSocketMessage {
  type: 'chat';
  payload: {
    playerId: string;
    username: string;
    message: string;
    isSystem: boolean;
  };
}

export interface JoinTableMessage extends WebSocketMessage {
  type: 'join_table';
  payload: {
    tableId: string;
    playerId: string;
    buyInAmount: number;
    seatPreference?: number;
  };
}

export interface LeaveTableMessage extends WebSocketMessage {
  type: 'leave_table';
  payload: {
    tableId: string;
    playerId: string;
  };
}

export interface HeartbeatMessage extends WebSocketMessage {
  type: 'heartbeat';
  payload: {
    clientTime: number;
  };
}

/**
 * Server to client messages
 */

export interface GameUpdateMessage extends WebSocketMessage {
  type: 'game_update';
  payload: GameState;
}

export interface PlayerJoinedMessage extends WebSocketMessage {
  type: 'player_joined';
  payload: {
    player: Player;
    seatNumber: number;
    chipCount: number;
  };
}

export interface PlayerLeftMessage extends WebSocketMessage {
  type: 'player_left';
  payload: {
    playerId: string;
    reason: string;
  };
}

export interface HandStartedMessage extends WebSocketMessage {
  type: 'hand_started';
  payload: {
    handNumber: number;
    dealerId: string;
    smallBlindId: string;
    bigBlindId: string;
  };
}

export interface HandCompletedMessage extends WebSocketMessage {
  type: 'hand_completed';
  payload: {
    winners: Array<{
      playerId: string;
      amount: number;
      handDescription: string;
    }>;
    showdown?: Array<{
      playerId: string;
      cards: Array<{ suit: string; rank: string }>;
    }>;
  };
}

export interface ErrorMessage extends WebSocketMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ConnectionAckMessage extends WebSocketMessage {
  type: 'connection_ack';
  payload: {
    sessionId: string;
    heartbeatInterval: number;
  };
}

/**
 * Type guards
 */

export function isPlayerActionMessage(msg: WebSocketMessage): msg is PlayerActionMessage {
  return msg.type === 'player_action';
}

export function isGameUpdateMessage(msg: WebSocketMessage): msg is GameUpdateMessage {
  return msg.type === 'game_update';
}

export function isChatMessage(msg: WebSocketMessage): msg is ChatMessage {
  return msg.type === 'chat';
}

export function isErrorMessage(msg: WebSocketMessage): msg is ErrorMessage {
  return msg.type === 'error';
}

/**
 * Message factory
 */

export function createWebSocketMessage<T>(
  type: string,
  payload: T,
  options?: {
    id?: string;
    version?: number;
    sequenceId?: number;
    requiresAck?: boolean;
    correlationId?: string;
  }
): WebSocketMessage {
  return {
    type,
    payload,
    timestamp: Date.now(),
    ...options,
  };
}