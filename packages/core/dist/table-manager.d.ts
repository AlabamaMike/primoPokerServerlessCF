import { TableConfig, JoinResult, GameState } from '@primo-poker/shared';
import type { Table } from '@primo-poker/shared';
export interface ITableManager {
    createTable(config: TableConfig): Promise<Table>;
    joinTable(tableId: string, playerId: string): Promise<JoinResult>;
    leaveTable(tableId: string, playerId: string): Promise<void>;
    getTable(tableId: string): Promise<Table | null>;
    updateTableState(tableId: string, gameState: GameState): Promise<void>;
}
export declare class TableManager implements ITableManager {
    private tables;
    createTable(config: TableConfig): Promise<Table>;
    joinTable(tableId: string, playerId: string): Promise<JoinResult>;
    leaveTable(tableId: string, playerId: string): Promise<void>;
    getTable(tableId: string): Promise<Table | null>;
    updateTableState(tableId: string, gameState: GameState): Promise<void>;
    private findAvailableSeat;
    private startGame;
    private calculateBlindPositions;
    getActiveTables(): Promise<Table[]>;
    getTablesByPlayer(playerId: string): Promise<Table[]>;
    cleanupInactiveTables(maxInactiveTime?: number): Promise<void>;
    moveDealer(tableId: string): Promise<void>;
}
//# sourceMappingURL=table-manager.d.ts.map