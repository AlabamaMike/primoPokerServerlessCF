/**
 * API client for poker server interactions
 */

import { TestConfig } from '../config';
import { TestLogger } from './logger';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PlayerInfo {
  id: string;
  username: string;
  email: string;
  chipCount: number;
}

export interface TableInfo {
  tableId: string;
  name: string;
  gameType: string;
  stakes: {
    smallBlind: number;
    bigBlind: number;
  };
  playerCount: number;
  maxPlayers: number;
  isActive: boolean;
}

export class ApiClient {
  private config: TestConfig;
  private logger: TestLogger;

  constructor(config: TestConfig, logger: TestLogger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Register a new user
   */
  async register(email: string, username: string, password: string): Promise<AuthTokens> {
    this.logger.debug(`Registering user: ${username}`);
    
    const response = await fetch(`${this.config.apiUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, username, password }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Registration failed: ${error}`);
    }

    const data = await response.json();
    return data.data.tokens;
  }

  /**
   * Login existing user
   */
  async login(username: string, password: string): Promise<AuthTokens> {
    this.logger.debug(`Logging in user: ${username}`);
    
    const response = await fetch(`${this.config.apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Login failed: ${error}`);
    }

    const data = await response.json();
    return data.data.tokens;
  }

  /**
   * Get player profile
   */
  async getProfile(accessToken: string): Promise<PlayerInfo> {
    const response = await fetch(`${this.config.apiUrl}/api/players/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get profile: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Create a new table
   */
  async createTable(accessToken: string, config: any): Promise<TableInfo> {
    this.logger.log(`Creating table: ${config.name}`);
    
    const response = await fetch(`${this.config.apiUrl}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create table: ${error}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Get table information
   */
  async getTable(tableId: string): Promise<any> {
    const response = await fetch(`${this.config.apiUrl}/api/tables/${tableId}`);

    if (!response.ok) {
      throw new Error(`Failed to get table: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Join a table
   */
  async joinTable(accessToken: string, tableId: string, buyIn: number): Promise<any> {
    this.logger.debug(`Joining table ${tableId} with buy-in ${buyIn}`);
    
    const response = await fetch(`${this.config.apiUrl}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ buyIn }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to join table: ${error}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Leave a table
   */
  async leaveTable(accessToken: string, tableId: string): Promise<void> {
    const response = await fetch(`${this.config.apiUrl}/api/tables/${tableId}/leave`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to leave table: ${response.statusText}`);
    }
  }

  /**
   * Get available seat information
   */
  async getTableSeats(tableId: string): Promise<any> {
    const response = await fetch(`${this.config.apiUrl}/api/tables/${tableId}/seats`);

    if (!response.ok) {
      throw new Error(`Failed to get table seats: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/health`);
      return response.ok;
    } catch (error) {
      this.logger.error('Health check failed:', error as Error);
      return false;
    }
  }
}