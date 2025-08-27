/**
 * Table Balancer - Handles player distribution across tournament tables
 */

export enum BalancingStrategy {
  MINIMIZE_MOVES = 'minimize_moves',
  MINIMIZE_DISRUPTION = 'minimize_disruption',
  POSITION_FAIRNESS = 'position_fairness',
}

export interface TableState {
  tableId: string;
  playerCount: number;
  maxSeats: number;
  players: PlayerInfo[];
  isFeatureTable?: boolean;
  buttonPosition?: number;
  avgPotSize?: number;
  currentHandNumber?: number;
}

export interface PlayerInfo {
  playerId: string;
  seatNumber: number;
  chipCount: number;
  isInHand?: boolean;
  handsPlayed?: number;
}

export interface PlayerMove {
  playerId: string;
  fromTable: string;
  toTable: string;
  recommendedSeat?: number;
  positionMetadata?: {
    maintainsBlinds?: boolean;
    handsUntilBlinds?: number;
  };
}

export interface ConsolidationResult {
  tablesToClose: string[];
  moves: PlayerMove[];
}

export interface FinalTableCheckResult {
  isFinalTable: boolean;
  totalPlayers: number;
  consolidationNeeded: boolean;
}

export interface FinalTableSeat {
  playerId: string;
  seatNumber: number;
  chipCount: number;
}

export class TableBalancer {
  private readonly BALANCE_THRESHOLD = 2; // Max difference in player count
  private readonly MIN_PLAYERS_PER_TABLE = 3;
  private readonly FINAL_TABLE_SIZE = 9;

  /**
   * Calculate moves needed to balance tables
   */
  calculateMoves(
    tables: TableState[],
    strategy: BalancingStrategy = BalancingStrategy.MINIMIZE_MOVES
  ): PlayerMove[] {
    // Filter active tables
    const activeTables = tables.filter(t => t.playerCount > 0);
    
    // Check if balancing is needed
    if (!this.isBalancingNeeded(activeTables)) {
      return [];
    }

    switch (strategy) {
      case BalancingStrategy.MINIMIZE_MOVES:
        return this.minimizeMovesStrategy(activeTables);
      case BalancingStrategy.MINIMIZE_DISRUPTION:
        return this.minimizeDisruptionStrategy(activeTables);
      case BalancingStrategy.POSITION_FAIRNESS:
        return this.positionFairnessStrategy(activeTables);
      default:
        return this.minimizeMovesStrategy(activeTables);
    }
  }

  /**
   * Check if table consolidation is possible
   */
  consolidateTables(tables: TableState[]): ConsolidationResult {
    const activeTables = tables.filter(t => t.playerCount > 0);
    const totalPlayers = activeTables.reduce((sum, t) => sum + t.playerCount, 0);
    
    // Calculate minimum tables needed
    const optimalTableCount = Math.max(
      1,
      Math.ceil(totalPlayers / this.getOptimalTableSize(totalPlayers))
    );

    if (activeTables.length <= optimalTableCount) {
      return { tablesToClose: [], moves: [] };
    }

    // Sort tables by priority (feature tables last, then by player count)
    const sortedTables = [...activeTables].sort((a, b) => {
      if (a.isFeatureTable !== b.isFeatureTable) {
        return a.isFeatureTable ? 1 : -1;
      }
      return a.playerCount - b.playerCount;
    });

    // Determine tables to close
    const tablesToClose: string[] = [];
    const tablesToKeep: TableState[] = [];
    
    for (let i = 0; i < sortedTables.length; i++) {
      if (i < activeTables.length - optimalTableCount) {
        tablesToClose.push(sortedTables[i].tableId);
      } else {
        tablesToKeep.push(sortedTables[i]);
      }
    }

    // Calculate moves to redistribute players
    const moves: PlayerMove[] = [];
    const playersToMove: PlayerInfo[] = [];

    // Collect all players from closing tables
    for (const table of sortedTables) {
      if (tablesToClose.includes(table.tableId)) {
        playersToMove.push(...table.players);
      }
    }

    // Distribute players to remaining tables
    let tableIndex = 0;
    for (const player of playersToMove) {
      // Find table with most space
      const targetTable = tablesToKeep.reduce((best, current) => {
        const bestSpace = best.maxSeats - best.playerCount;
        const currentSpace = current.maxSeats - current.playerCount;
        return currentSpace > bestSpace ? current : best;
      });

      moves.push({
        playerId: player.playerId,
        fromTable: tablesToClose.find(id => 
          tables.find(t => t.tableId === id)?.players.some(p => p.playerId === player.playerId)
        )!,
        toTable: targetTable.tableId,
      });

      targetTable.playerCount++;
    }

    return { tablesToClose, moves };
  }

  /**
   * Check if it's time for final table
   */
  checkFinalTable(tables: TableState[], finalTableSize: number = 9): FinalTableCheckResult {
    const activeTables = tables.filter(t => t.playerCount > 0);
    const totalPlayers = activeTables.reduce((sum, t) => sum + t.playerCount, 0);

    return {
      isFinalTable: totalPlayers <= finalTableSize,
      totalPlayers,
      consolidationNeeded: activeTables.length > 1,
    };
  }

  /**
   * Arrange seating for final table
   */
  arrangeFinalTableSeating(players: { playerId: string; chipCount: number }[]): FinalTableSeat[] {
    // Sort by chip count (descending)
    const sortedPlayers = [...players].sort((a, b) => b.chipCount - a.chipCount);
    
    // Assign seats strategically
    const seats: FinalTableSeat[] = [];
    const seatAssignments = this.generateBalancedSeating(sortedPlayers.length);

    for (let i = 0; i < sortedPlayers.length; i++) {
      seats.push({
        playerId: sortedPlayers[i].playerId,
        seatNumber: seatAssignments[i],
        chipCount: sortedPlayers[i].chipCount,
      });
    }

    return seats;
  }

  /**
   * Batch moves for efficient execution
   */
  batchMoves(moves: PlayerMove[]): PlayerMove[][] {
    const batches: PlayerMove[][] = [];
    const usedTables = new Set<string>();

    while (moves.length > 0) {
      const batch: PlayerMove[] = [];
      usedTables.clear();

      for (let i = moves.length - 1; i >= 0; i--) {
        const move = moves[i];
        if (!usedTables.has(move.fromTable) && !usedTables.has(move.toTable)) {
          batch.push(move);
          usedTables.add(move.fromTable);
          usedTables.add(move.toTable);
          moves.splice(i, 1);
        }
      }

      if (batch.length > 0) {
        batches.push(batch);
      } else {
        // Handle remaining conflicting moves
        batches.push([moves.pop()!]);
      }
    }

    return batches;
  }

  /**
   * Check if balancing is needed
   */
  private isBalancingNeeded(tables: TableState[]): boolean {
    if (tables.length < 2) return false;

    const counts = tables.map(t => t.playerCount);
    const max = Math.max(...counts);
    const min = Math.min(...counts);

    return max - min > this.BALANCE_THRESHOLD;
  }

  /**
   * Strategy: Minimize total number of moves
   */
  private minimizeMovesStrategy(tables: TableState[]): PlayerMove[] {
    const moves: PlayerMove[] = [];
    const tableCounts = new Map(tables.map(t => [t.tableId, t.playerCount]));
    
    // Calculate target count
    const totalPlayers = tables.reduce((sum, t) => sum + t.playerCount, 0);
    const targetCount = Math.floor(totalPlayers / tables.length);
    const remainder = totalPlayers % tables.length;

    // Sort tables by player count (descending)
    const sortedTables = [...tables].sort((a, b) => b.playerCount - a.playerCount);

    // Move players from overpopulated to underpopulated tables
    for (let i = 0; i < sortedTables.length; i++) {
      const table = sortedTables[i];
      const target = targetCount + (i < remainder ? 1 : 0);
      const diff = table.playerCount - target;

      if (diff > 0) {
        // Need to move players out
        const playersToMove = table.players.slice(-diff);
        
        for (const player of playersToMove) {
          // Find best target table
          const targetTable = sortedTables.find(t => 
            t.tableId !== table.tableId && 
            (tableCounts.get(t.tableId) || 0) < t.maxSeats &&
            (tableCounts.get(t.tableId) || 0) < targetCount + 1
          );

          if (targetTable) {
            moves.push({
              playerId: player.playerId,
              fromTable: table.tableId,
              toTable: targetTable.tableId,
            });
            
            tableCounts.set(table.tableId, (tableCounts.get(table.tableId) || 0) - 1);
            tableCounts.set(targetTable.tableId, (tableCounts.get(targetTable.tableId) || 0) + 1);
          }
        }
      }
    }

    return moves;
  }

  /**
   * Strategy: Minimize disruption to ongoing games
   */
  private minimizeDisruptionStrategy(tables: TableState[]): PlayerMove[] {
    const moves: PlayerMove[] = [];
    
    // Get players not in hands
    const availablePlayers: { player: PlayerInfo; tableId: string }[] = [];
    
    for (const table of tables) {
      for (const player of table.players) {
        if (!player.isInHand) {
          availablePlayers.push({ player, tableId: table.tableId });
        }
      }
    }

    // Sort by chip count to move shorter stacks first
    availablePlayers.sort((a, b) => a.player.chipCount - b.player.chipCount);

    // Calculate imbalances
    const imbalances = this.calculateImbalances(tables);

    // Move available players to balance
    for (const { player, tableId } of availablePlayers) {
      const fromTable = tables.find(t => t.tableId === tableId);
      const targetTable = this.findBestTargetTable(tables, fromTable!, imbalances);

      if (targetTable && this.shouldMove(fromTable!, targetTable)) {
        moves.push({
          playerId: player.playerId,
          fromTable: tableId,
          toTable: targetTable.tableId,
        });

        // Update counts
        fromTable!.playerCount--;
        targetTable.playerCount++;
        
        // Recalculate imbalances
        this.updateImbalances(imbalances, fromTable!, targetTable);
      }
    }

    return moves;
  }

  /**
   * Strategy: Maintain position fairness
   */
  private positionFairnessStrategy(tables: TableState[]): PlayerMove[] {
    const moves = this.minimizeMovesStrategy(tables);

    // Enhance moves with position metadata
    for (const move of moves) {
      const fromTable = tables.find(t => t.tableId === move.fromTable);
      const toTable = tables.find(t => t.tableId === move.toTable);
      const player = fromTable?.players.find(p => p.playerId === move.playerId);

      if (fromTable && toTable && player && fromTable.buttonPosition !== undefined) {
        // Calculate position relative to button
        const positionFromButton = this.calculatePositionFromButton(
          player.seatNumber,
          fromTable.buttonPosition,
          fromTable.playerCount
        );

        // Find equivalent position at new table
        move.recommendedSeat = this.findEquivalentSeat(
          positionFromButton,
          toTable.buttonPosition || 1,
          toTable.playerCount + 1
        );

        // Add metadata
        move.positionMetadata = {
          maintainsBlinds: this.willMaintainBlinds(
            positionFromButton,
            move.recommendedSeat,
            toTable.playerCount + 1
          ),
        };
      }
    }

    return moves;
  }

  /**
   * Helper: Calculate optimal table size
   */
  private getOptimalTableSize(totalPlayers: number): number {
    if (totalPlayers <= this.FINAL_TABLE_SIZE) return this.FINAL_TABLE_SIZE;
    if (totalPlayers <= 20) return 6;
    if (totalPlayers <= 50) return 7;
    if (totalPlayers <= 100) return 8;
    return 9;
  }

  /**
   * Helper: Generate balanced seating arrangement
   */
  private generateBalancedSeating(playerCount: number): number[] {
    const seats: number[] = [];
    const spacing = Math.floor(9 / playerCount);
    
    // Distribute players evenly around the table
    for (let i = 0; i < playerCount; i++) {
      seats.push((i * spacing) + 1);
    }

    return seats;
  }

  /**
   * Helper: Calculate table imbalances
   */
  private calculateImbalances(tables: TableState[]): Map<string, number> {
    const totalPlayers = tables.reduce((sum, t) => sum + t.playerCount, 0);
    const targetCount = totalPlayers / tables.length;
    
    return new Map(
      tables.map(t => [t.tableId, t.playerCount - targetCount])
    );
  }

  /**
   * Helper: Find best target table
   */
  private findBestTargetTable(
    tables: TableState[],
    fromTable: TableState,
    imbalances: Map<string, number>
  ): TableState | undefined {
    return tables
      .filter(t => 
        t.tableId !== fromTable.tableId &&
        t.playerCount < t.maxSeats &&
        (imbalances.get(t.tableId) || 0) < 0
      )
      .sort((a, b) => 
        (imbalances.get(a.tableId) || 0) - (imbalances.get(b.tableId) || 0)
      )[0];
  }

  /**
   * Helper: Check if move should be made
   */
  private shouldMove(fromTable: TableState, toTable: TableState): boolean {
    return fromTable.playerCount > toTable.playerCount + this.BALANCE_THRESHOLD;
  }

  /**
   * Helper: Update imbalances after move
   */
  private updateImbalances(
    imbalances: Map<string, number>,
    fromTable: TableState,
    toTable: TableState
  ): void {
    imbalances.set(fromTable.tableId, (imbalances.get(fromTable.tableId) || 0) - 1);
    imbalances.set(toTable.tableId, (imbalances.get(toTable.tableId) || 0) + 1);
  }

  /**
   * Helper: Calculate position from button
   */
  private calculatePositionFromButton(
    seatNumber: number,
    buttonPosition: number,
    playerCount: number
  ): number {
    return ((seatNumber - buttonPosition + playerCount) % playerCount) || playerCount;
  }

  /**
   * Helper: Find equivalent seat at new table
   */
  private findEquivalentSeat(
    positionFromButton: number,
    newButtonPosition: number,
    newPlayerCount: number
  ): number {
    return ((positionFromButton + newButtonPosition - 1) % newPlayerCount) + 1;
  }

  /**
   * Helper: Check if player will maintain blind position
   */
  private willMaintainBlinds(
    oldPosition: number,
    newSeat: number,
    newPlayerCount: number
  ): boolean {
    // Players in blinds (positions 1-2) should maintain similar positions
    if (oldPosition <= 2) {
      const newPosition = this.calculatePositionFromButton(newSeat, 1, newPlayerCount);
      return newPosition <= 2;
    }
    return true;
  }
}