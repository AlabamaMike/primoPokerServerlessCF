/**
 * Test logger with configurable verbosity and hand history tracking
 */

import { TestConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  MINIMAL = 0,
  NORMAL = 1,
  DETAILED = 2,
  DEBUG = 3,
}

export interface HandHistoryEntry {
  handNumber: number;
  timestamp: number;
  players: Array<{
    id: string;
    username: string;
    position: number;
    chipCount: number;
    holeCards?: string[];
  }>;
  buttonPosition: number;
  actions: Array<{
    player: string;
    action: string;
    amount?: number;
    timestamp: number;
  }>;
  communityCards: string[];
  pots: Array<{
    amount: number;
    eligiblePlayers: string[];
  }>;
  winners: Array<{
    player: string;
    amount: number;
    hand?: string;
  }>;
  raw?: any; // Raw game state for debugging
}

export class TestLogger {
  private config: TestConfig;
  private logLevel: LogLevel;
  private handHistories: HandHistoryEntry[] = [];
  private currentHand: Partial<HandHistoryEntry> | null = null;
  private testName: string;
  private startTime: number;

  constructor(config: TestConfig, testName: string) {
    this.config = config;
    this.testName = testName;
    this.startTime = Date.now();
    
    // Convert string log level to enum
    const levelMap: Record<string, LogLevel> = {
      'minimal': LogLevel.MINIMAL,
      'normal': LogLevel.NORMAL,
      'detailed': LogLevel.DETAILED,
      'debug': LogLevel.DEBUG,
    };
    this.logLevel = levelMap[config.logging.level] || LogLevel.NORMAL;
  }

  // Logging methods with level checking
  minimal(message: string, ...args: any[]) {
    if (this.logLevel >= LogLevel.MINIMAL) {
      console.log(`[${this.getTimestamp()}] ${message}`, ...args);
    }
  }

  log(message: string, ...args: any[]) {
    if (this.logLevel >= LogLevel.NORMAL) {
      console.log(`[${this.getTimestamp()}] ${message}`, ...args);
    }
  }

  detailed(message: string, ...args: any[]) {
    if (this.logLevel >= LogLevel.DETAILED) {
      console.log(`[${this.getTimestamp()}] [DETAIL] ${message}`, ...args);
    }
  }

  debug(message: string, ...args: any[]) {
    if (this.logLevel >= LogLevel.DEBUG) {
      console.log(`[${this.getTimestamp()}] [DEBUG] ${message}`, ...args);
    }
  }

  error(message: string, error?: Error) {
    console.error(`[${this.getTimestamp()}] [ERROR] ${message}`, error || '');
    if (error?.stack && this.logLevel >= LogLevel.DETAILED) {
      console.error(error.stack);
    }
  }

  // WebSocket message logging
  wsMessage(direction: 'send' | 'receive', playerId: string, message: any) {
    if (this.config.logging.logWebSocketMessages) {
      const prefix = direction === 'send' ? '→' : '←';
      this.debug(`${prefix} WS [${playerId}]:`, JSON.stringify(message, null, 2));
    }
  }

  // Hand history tracking
  startHand(handNumber: number, players: any[], buttonPosition: number) {
    this.log(`🃏 Starting hand #${handNumber}, Button at position ${buttonPosition}`);
    
    if (this.config.logging.saveHandHistories) {
      this.currentHand = {
        handNumber,
        timestamp: Date.now(),
        players: players.map(p => ({
          id: p.id,
          username: p.username,
          position: p.position,
          chipCount: p.chipCount,
        })),
        buttonPosition,
        actions: [],
        communityCards: [],
        pots: [],
        winners: [],
      };
    }
  }

  recordAction(playerId: string, action: string, amount?: number) {
    const playerName = this.currentHand?.players?.find(p => p.id === playerId)?.username || playerId;
    
    if (amount !== undefined) {
      this.log(`  ${playerName} ${action} ${amount}`);
    } else {
      this.log(`  ${playerName} ${action}`);
    }

    if (this.currentHand && this.config.logging.saveHandHistories) {
      this.currentHand.actions!.push({
        player: playerId,
        action,
        amount,
        timestamp: Date.now(),
      });
    }
  }

  recordCommunityCards(cards: string[]) {
    this.log(`🎴 Community cards:`, cards.join(' '));
    
    if (this.currentHand && this.config.logging.saveHandHistories) {
      this.currentHand.communityCards = cards;
    }
  }

  recordWinners(winners: Array<{ player: string; amount: number; hand?: string }>) {
    winners.forEach(w => {
      const playerName = this.currentHand?.players?.find(p => p.id === w.player)?.username || w.player;
      this.log(`🏆 ${playerName} wins ${w.amount}${w.hand ? ` with ${w.hand}` : ''}`);
    });

    if (this.currentHand && this.config.logging.saveHandHistories) {
      this.currentHand.winners = winners;
    }
  }

  endHand(finalState?: any) {
    if (this.currentHand && this.config.logging.saveHandHistories) {
      if (finalState && this.logLevel >= LogLevel.DEBUG) {
        this.currentHand.raw = finalState;
      }
      
      this.handHistories.push(this.currentHand as HandHistoryEntry);
      this.currentHand = null;
    }
    
    this.log('✅ Hand complete\n');
  }

  // Save hand histories to file
  async saveHandHistories() {
    if (!this.config.logging.saveHandHistories || this.handHistories.length === 0) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `hand-history-${this.testName}-${timestamp}.json`;
    const filepath = path.join(process.cwd(), 'test-results', 'hand-histories', filename);

    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save hand history
    const data = {
      test: this.testName,
      startTime: new Date(this.startTime).toISOString(),
      endTime: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      config: {
        api: this.config.apiUrl,
        logging: this.config.logging,
      },
      handCount: this.handHistories.length,
      hands: this.handHistories,
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    this.log(`📁 Hand history saved to: ${filepath}`);
  }

  // Test lifecycle logging
  testStart(description: string) {
    this.minimal(`\n${'='.repeat(60)}`);
    this.minimal(`🚀 TEST: ${description}`);
    this.minimal(`${'='.repeat(60)}\n`);
  }

  testComplete(success: boolean) {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    
    if (success) {
      this.minimal(`\n✅ TEST PASSED in ${duration}s`);
    } else {
      this.minimal(`\n❌ TEST FAILED in ${duration}s`);
    }
    
    if (this.handHistories.length > 0) {
      this.minimal(`   Played ${this.handHistories.length} hands`);
    }
  }

  // Helper methods
  private getTimestamp(): string {
    const elapsed = Date.now() - this.startTime;
    const seconds = Math.floor(elapsed / 1000);
    const ms = elapsed % 1000;
    return `${seconds.toString().padStart(3, '0')}.${ms.toString().padStart(3, '0')}`;
  }
}