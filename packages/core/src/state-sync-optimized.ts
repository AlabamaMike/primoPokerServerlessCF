import { GameState, Player, Pot } from '@primo-poker/shared';
import { createHash } from 'crypto';

export interface StateDiff {
  path: string[];
  op: 'add' | 'remove' | 'replace';
  value?: any;
  oldValue?: any;
}

export interface StateVersion {
  version: number;
  hash: string;
  timestamp: number;
}

export class StateSyncOptimizer {
  private stateCache = new Map<string, any>();
  private versionHistory = new Map<string, StateVersion>();
  private diffCache = new Map<string, StateDiff[]>();
  private currentVersion = 0;

  private calculateHash(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return createHash('sha256').update(str).digest('hex').substring(0, 8);
  }

  private deepDiff(oldObj: any, newObj: any, path: string[] = []): StateDiff[] {
    const diffs: StateDiff[] = [];

    if (oldObj === newObj) return diffs;

    if (typeof oldObj !== typeof newObj || 
        oldObj === null || newObj === null ||
        typeof oldObj !== 'object') {
      diffs.push({
        path,
        op: 'replace',
        value: newObj,
        oldValue: oldObj,
      });
      return diffs;
    }

    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      const newPath = [...path, key];
      
      if (!(key in newObj)) {
        diffs.push({
          path: newPath,
          op: 'remove',
          oldValue: oldObj[key],
        });
      } else if (!(key in oldObj)) {
        diffs.push({
          path: newPath,
          op: 'add',
          value: newObj[key],
        });
      } else {
        diffs.push(...this.deepDiff(oldObj[key], newObj[key], newPath));
      }
    }

    return diffs;
  }

  private applyDiff(obj: any, diff: StateDiff): any {
    const result = JSON.parse(JSON.stringify(obj));
    let current = result;

    for (let i = 0; i < diff.path.length - 1; i++) {
      if (!current[diff.path[i]]) {
        current[diff.path[i]] = {};
      }
      current = current[diff.path[i]];
    }

    const lastKey = diff.path[diff.path.length - 1];

    switch (diff.op) {
      case 'add':
      case 'replace':
        if (diff.path.length === 0) {
          return diff.value;
        }
        current[lastKey] = diff.value;
        break;
      case 'remove':
        delete current[lastKey];
        break;
    }

    return result;
  }

  updateState(key: string, newState: any): {
    version: StateVersion;
    diffs: StateDiff[];
    fullState?: any;
  } {
    const oldState = this.stateCache.get(key);
    const diffs = oldState ? this.deepDiff(oldState, newState) : [];

    this.currentVersion++;
    const hash = this.calculateHash(newState);
    
    const version: StateVersion = {
      version: this.currentVersion,
      hash,
      timestamp: Date.now(),
    };

    this.stateCache.set(key, JSON.parse(JSON.stringify(newState)));
    this.versionHistory.set(`${key}-${this.currentVersion}`, version);
    
    if (diffs.length > 0) {
      this.diffCache.set(`${key}-${this.currentVersion}`, diffs);
    }

    const shouldSendFullState = !oldState || diffs.length > 50;

    return {
      version,
      diffs: shouldSendFullState ? [] : diffs,
      fullState: shouldSendFullState ? newState : undefined,
    };
  }

  getState(key: string): any {
    return this.stateCache.get(key);
  }

  reconstructState(key: string, fromVersion: number, diffs: StateDiff[]): any {
    let state = this.stateCache.get(key);
    
    if (!state) {
      throw new Error(`No cached state found for key: ${key}`);
    }

    for (const diff of diffs) {
      state = this.applyDiff(state, diff);
    }

    return state;
  }

  getVersionHistory(key: string, limit = 10): StateVersion[] {
    const versions: StateVersion[] = [];
    
    for (let i = this.currentVersion; i > Math.max(0, this.currentVersion - limit); i--) {
      const version = this.versionHistory.get(`${key}-${i}`);
      if (version) {
        versions.push(version);
      }
    }

    return versions;
  }

  clearOldVersions(keepLast = 10): void {
    const cutoff = this.currentVersion - keepLast;
    
    for (const [key, version] of this.versionHistory) {
      if (version.version < cutoff) {
        this.versionHistory.delete(key);
        this.diffCache.delete(key);
      }
    }
  }
}

export class GameStateSyncOptimizer extends StateSyncOptimizer {
  private playerStateCache = new Map<string, any>();
  private potStateCache = new Map<string, any>();

  optimizeGameState(gameState: GameState): {
    version: StateVersion;
    diffs: StateDiff[];
    fullState?: GameState;
    playerDiffs: Map<string, StateDiff[]>;
    potDiffs: StateDiff[];
  } {
    const mainResult = this.updateState('game', {
      id: gameState.id,
      phase: gameState.phase,
      currentTurn: gameState.currentTurn,
      dealerPosition: gameState.dealerPosition,
      smallBlindPosition: gameState.smallBlindPosition,
      bigBlindPosition: gameState.bigBlindPosition,
      communityCards: gameState.communityCards,
      currentBet: gameState.currentBet,
      totalPot: gameState.totalPot,
      lastAction: gameState.lastAction,
      handNumber: gameState.handNumber,
    });

    const playerDiffs = new Map<string, StateDiff[]>();
    
    for (const player of gameState.players) {
      const playerId = player.id;
      const oldPlayerState = this.playerStateCache.get(playerId);
      const playerStateDiffs = oldPlayerState 
        ? this.deepDiff(oldPlayerState, player)
        : [];
      
      if (playerStateDiffs.length > 0 || !oldPlayerState) {
        playerDiffs.set(playerId, playerStateDiffs);
        this.playerStateCache.set(playerId, JSON.parse(JSON.stringify(player)));
      }
    }

    const oldPotState = this.potStateCache.get('pots');
    const potDiffs = oldPotState
      ? this.deepDiff(oldPotState, gameState.pots)
      : [];
    
    if (potDiffs.length > 0 || !oldPotState) {
      this.potStateCache.set('pots', JSON.parse(JSON.stringify(gameState.pots)));
    }

    return {
      ...mainResult,
      playerDiffs,
      potDiffs,
    };
  }

  createMinimalUpdate(
    fullState: GameState,
    changedFields: Set<keyof GameState>
  ): Partial<GameState> {
    const update: Partial<GameState> = {};

    for (const field of changedFields) {
      (update as any)[field] = fullState[field];
    }

    return update;
  }

  mergeStateUpdate(
    currentState: GameState,
    update: Partial<GameState>
  ): GameState {
    return {
      ...currentState,
      ...update,
      players: update.players || currentState.players,
      pots: update.pots || currentState.pots,
    };
  }

  getPlayerSpecificView(
    gameState: GameState,
    playerId: string,
    includeHiddenInfo = false
  ): GameState {
    const playerView = JSON.parse(JSON.stringify(gameState));

    if (!includeHiddenInfo) {
      playerView.players = playerView.players.map((p: Player) => {
        if (p.id !== playerId && p.hand) {
          return {
            ...p,
            hand: p.folded ? null : p.hand.map(() => ({ suit: '?', rank: '?' })),
          };
        }
        return p;
      });
    }

    return playerView;
  }

  calculateStateDelta(
    previousState: GameState,
    currentState: GameState
  ): {
    changed: boolean;
    changedFields: Set<keyof GameState>;
    significantChange: boolean;
  } {
    const changedFields = new Set<keyof GameState>();
    const significantFields: (keyof GameState)[] = [
      'phase', 'currentTurn', 'currentBet', 'totalPot', 'players', 'pots'
    ];

    for (const key in currentState) {
      if (JSON.stringify(previousState[key as keyof GameState]) !== 
          JSON.stringify(currentState[key as keyof GameState])) {
        changedFields.add(key as keyof GameState);
      }
    }

    const significantChange = significantFields.some(field => 
      changedFields.has(field)
    );

    return {
      changed: changedFields.size > 0,
      changedFields,
      significantChange,
    };
  }
}

export class BatchedStateSync {
  private pendingUpdates = new Map<string, any>();
  private batchTimer: NodeJS.Timeout | null = null;
  private batchInterval: number;
  private onFlush: (updates: Map<string, any>) => void;

  constructor(
    batchInterval = 100,
    onFlush: (updates: Map<string, any>) => void
  ) {
    this.batchInterval = batchInterval;
    this.onFlush = onFlush;
  }

  queueUpdate(key: string, update: any): void {
    this.pendingUpdates.set(key, update);

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flush(), this.batchInterval);
    }
  }

  flush(): void {
    if (this.pendingUpdates.size === 0) return;

    const updates = new Map(this.pendingUpdates);
    this.pendingUpdates.clear();

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.onFlush(updates);
  }

  clear(): void {
    this.pendingUpdates.clear();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }
}

interface DiffOp {
  path: string[];
  op: 'add' | 'remove' | 'replace';
  value?: any;
}

function deepDiff(oldObj: any, newObj: any, path: string[] = []): DiffOp[] {
  const diffs: DiffOp[] = [];

  if (oldObj === newObj) return diffs;

  if (typeof oldObj !== typeof newObj || 
      oldObj === null || newObj === null ||
      typeof oldObj !== 'object') {
    diffs.push({
      path,
      op: 'replace',
      value: newObj,
    });
    return diffs;
  }

  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const newPath = [...path, key];
    
    if (!(key in newObj)) {
      diffs.push({
        path: newPath,
        op: 'remove',
      });
    } else if (!(key in oldObj)) {
      diffs.push({
        path: newPath,
        op: 'add',
        value: newObj[key],
      });
    } else {
      diffs.push(...deepDiff(oldObj[key], newObj[key], newPath));
    }
  }

  return diffs;
}