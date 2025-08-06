import { z } from 'zod';

export enum ErrorCode {
  // Authentication Errors
  AUTH_INVALID_TOKEN = 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_INSUFFICIENT_PERMISSIONS',

  // Game Errors
  GAME_NOT_FOUND = 'GAME_NOT_FOUND',
  GAME_ALREADY_STARTED = 'GAME_ALREADY_STARTED',
  GAME_NOT_STARTED = 'GAME_NOT_STARTED',
  GAME_FULL = 'GAME_FULL',
  GAME_INVALID_PHASE = 'GAME_INVALID_PHASE',

  // Player Errors
  PLAYER_NOT_FOUND = 'PLAYER_NOT_FOUND',
  PLAYER_NOT_AT_TABLE = 'PLAYER_NOT_AT_TABLE',
  PLAYER_ALREADY_AT_TABLE = 'PLAYER_ALREADY_AT_TABLE',
  PLAYER_NOT_IN_TURN = 'PLAYER_NOT_IN_TURN',
  PLAYER_INSUFFICIENT_FUNDS = 'PLAYER_INSUFFICIENT_FUNDS',

  // Action Errors
  ACTION_INVALID = 'ACTION_INVALID',
  ACTION_NOT_ALLOWED = 'ACTION_NOT_ALLOWED',
  BET_INVALID_AMOUNT = 'BET_INVALID_AMOUNT',
  BET_BELOW_MINIMUM = 'BET_BELOW_MINIMUM',
  BET_ABOVE_MAXIMUM = 'BET_ABOVE_MAXIMUM',

  // Connection Errors
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_LOST = 'CONNECTION_LOST',

  // Validation Errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // System Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ErrorContext {
  code: ErrorCode;
  message: string;
  details?: any;
  timestamp: number;
  correlationId?: string | undefined;
  stack?: string | undefined;
  userMessage?: string | undefined;
  retryable?: boolean;
  httpStatus?: number;
}

export const ErrorContextSchema = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  details: z.any().optional(),
  timestamp: z.number(),
  correlationId: z.string().optional(),
  stack: z.string().optional(),
  userMessage: z.string().optional(),
  retryable: z.boolean().optional(),
  httpStatus: z.number().optional(),
});

export abstract class BaseError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: any;
  public readonly timestamp: number;
  public readonly correlationId?: string | undefined;
  public readonly userMessage: string;
  public readonly retryable: boolean;
  public readonly httpStatus: number;

  constructor(context: Partial<ErrorContext> & { code: ErrorCode; message: string }) {
    super(context.message);
    this.name = this.constructor.name;
    this.code = context.code;
    this.details = context.details;
    this.timestamp = context.timestamp || Date.now();
    this.correlationId = context.correlationId as string | undefined;
    this.userMessage = (context.userMessage || this.getDefaultUserMessage()) as string;
    this.retryable = context.retryable ?? false;
    this.httpStatus = context.httpStatus ?? 500;

    Error.captureStackTrace(this, this.constructor);
  }

  protected abstract getDefaultUserMessage(): string;

  toJSON(): ErrorContext {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      userMessage: this.userMessage,
      retryable: this.retryable,
      httpStatus: this.httpStatus,
    };
  }
}

export class AuthenticationError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AUTH_UNAUTHORIZED,
    details?: any
  ) {
    super({
      code,
      message,
      details,
      httpStatus: 401,
      retryable: false,
    });
  }

  protected getDefaultUserMessage(): string {
    switch (this.code) {
      case ErrorCode.AUTH_INVALID_TOKEN:
        return 'Your session is invalid. Please log in again.';
      case ErrorCode.AUTH_TOKEN_EXPIRED:
        return 'Your session has expired. Please log in again.';
      case ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS:
        return 'You do not have permission to perform this action.';
      default:
        return 'Authentication failed. Please log in again.';
    }
  }
}

export class GameError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.GAME_NOT_FOUND,
    details?: any
  ) {
    super({
      code,
      message,
      details,
      httpStatus: 400,
      retryable: false,
    });
  }

  protected getDefaultUserMessage(): string {
    switch (this.code) {
      case ErrorCode.GAME_NOT_FOUND:
        return 'The game you are looking for does not exist.';
      case ErrorCode.GAME_ALREADY_STARTED:
        return 'This game has already started.';
      case ErrorCode.GAME_FULL:
        return 'This game is full. Please try another table.';
      case ErrorCode.GAME_INVALID_PHASE:
        return 'This action cannot be performed at this stage of the game.';
      default:
        return 'A game error occurred. Please try again.';
    }
  }
}

export class PlayerError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.PLAYER_NOT_FOUND,
    details?: any
  ) {
    super({
      code,
      message,
      details,
      httpStatus: 400,
      retryable: false,
    });
  }

  protected getDefaultUserMessage(): string {
    switch (this.code) {
      case ErrorCode.PLAYER_NOT_AT_TABLE:
        return 'You must join the table before performing this action.';
      case ErrorCode.PLAYER_ALREADY_AT_TABLE:
        return 'You are already seated at this table.';
      case ErrorCode.PLAYER_NOT_IN_TURN:
        return 'It is not your turn to act.';
      case ErrorCode.PLAYER_INSUFFICIENT_FUNDS:
        return 'You do not have enough chips for this action.';
      default:
        return 'A player error occurred. Please try again.';
    }
  }
}

export class ValidationError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.VALIDATION_FAILED,
    details?: any
  ) {
    super({
      code,
      message,
      details,
      httpStatus: 400,
      retryable: false,
    });
  }

  protected getDefaultUserMessage(): string {
    return 'The provided input is invalid. Please check and try again.';
  }
}

export class ConnectionError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.CONNECTION_FAILED,
    details?: any
  ) {
    super({
      code,
      message,
      details,
      httpStatus: 503,
      retryable: true,
    });
  }

  protected getDefaultUserMessage(): string {
    switch (this.code) {
      case ErrorCode.CONNECTION_TIMEOUT:
        return 'Connection timed out. Please check your internet connection.';
      case ErrorCode.CONNECTION_LOST:
        return 'Connection lost. Attempting to reconnect...';
      default:
        return 'Connection error. Please try again.';
    }
  }
}

export class SystemError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    details?: any
  ) {
    super({
      code,
      message,
      details,
      httpStatus: 500,
      retryable: true,
    });
  }

  protected getDefaultUserMessage(): string {
    return 'An unexpected error occurred. Please try again later.';
  }
}

export interface ErrorRecoveryStrategy {
  shouldRecover(error: BaseError): boolean;
  recover(error: BaseError): Promise<void>;
}

export class ErrorRecoveryManager {
  private strategies = new Map<ErrorCode, ErrorRecoveryStrategy>();

  registerStrategy(code: ErrorCode, strategy: ErrorRecoveryStrategy): void {
    this.strategies.set(code, strategy);
  }

  async handleError(error: BaseError): Promise<boolean> {
    const strategy = this.strategies.get(error.code);
    if (!strategy || !strategy.shouldRecover(error)) {
      return false;
    }

    try {
      await strategy.recover(error);
      return true;
    } catch (recoveryError) {
      console.error('Error recovery failed:', recoveryError);
      return false;
    }
  }
}

export class ErrorLogger {
  private static instance: ErrorLogger;
  private errorLog: ErrorContext[] = [];
  private maxLogSize = 1000;

  static getInstance(): ErrorLogger {
    if (!this.instance) {
      this.instance = new ErrorLogger();
    }
    return this.instance;
  }

  log(error: BaseError | Error, context?: Partial<ErrorContext>): void {
    const errorContext: ErrorContext = error instanceof BaseError
      ? error.toJSON()
      : {
          code: ErrorCode.UNKNOWN_ERROR,
          message: error.message,
          timestamp: Date.now(),
          stack: error.stack,
          ...context,
        };

    this.errorLog.push(errorContext);

    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    this.sendToLoggingService(errorContext);
  }

  private sendToLoggingService(context: ErrorContext): void {
    console.error('[ERROR]', {
      code: context.code,
      message: context.message,
      timestamp: new Date(context.timestamp).toISOString(),
      correlationId: context.correlationId,
      details: context.details,
    });
  }

  getRecentErrors(count = 10): ErrorContext[] {
    return this.errorLog.slice(-count);
  }

  clearLog(): void {
    this.errorLog = [];
  }
}

export function createErrorHandler(options?: {
  logger?: ErrorLogger;
  recoveryManager?: ErrorRecoveryManager;
  onError?: (error: BaseError) => void;
}) {
  const logger = options?.logger || ErrorLogger.getInstance();
  const recoveryManager = options?.recoveryManager || new ErrorRecoveryManager();

  return async function handleError(error: Error | BaseError): Promise<void> {
    const baseError = error instanceof BaseError
      ? error
      : new SystemError(error.message, ErrorCode.UNKNOWN_ERROR, { originalError: error });

    logger.log(baseError);

    const recovered = await recoveryManager.handleError(baseError);
    if (!recovered && options?.onError) {
      options.onError(baseError);
    }
  };
}

export function isRetryableError(error: Error | BaseError): boolean {
  if (error instanceof BaseError) {
    return error.retryable;
  }
  return false;
}

export function getHttpStatusFromError(error: Error | BaseError): number {
  if (error instanceof BaseError) {
    return error.httpStatus;
  }
  return 500;
}

export function getUserMessageFromError(error: Error | BaseError): string {
  if (error instanceof BaseError) {
    return error.userMessage || error.message;
  }
  return 'An unexpected error occurred.';
}