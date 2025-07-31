import { PlayerStatus, TableFullError, PlayerNotFoundError, POKER_CONSTANTS, } from '@primo-poker/shared';
import { PokerGame } from './poker-game';
// Table interface moved to shared package
export class TableManager {
    tables = new Map();
    async createTable(config) {
        const table = {
            id: config.id,
            config,
            players: new Map(),
            gameState: null,
            game: null,
            createdAt: new Date(),
            lastActivity: new Date(),
            isActive: true,
        };
        this.tables.set(config.id, table);
        return table;
    }
    async joinTable(tableId, playerId) {
        const table = this.tables.get(tableId);
        if (!table) {
            return { success: false, error: 'Table not found' };
        }
        // Check if table is full
        if (table.players.size >= table.config.maxPlayers) {
            throw new TableFullError(tableId);
        }
        // Check if player is already at table
        if (table.players.has(playerId)) {
            return { success: false, error: 'Player already at table' };
        }
        // Find available seat
        const position = this.findAvailableSeat(table);
        if (!position) {
            return { success: false, error: 'No available seats' };
        }
        // Create player object (in real implementation, fetch from database)
        const player = {
            id: playerId,
            username: `Player_${playerId.slice(0, 8)}`, // Temporary username
            email: `${playerId}@example.com`, // Temporary email
            chipCount: table.config.minBuyIn, // Default buy-in
            position,
            status: PlayerStatus.ACTIVE,
            isDealer: false,
            timeBank: POKER_CONSTANTS.DEFAULT_TIME_BANK,
        };
        table.players.set(playerId, player);
        table.lastActivity = new Date();
        // Start game if minimum players reached
        if (table.players.size >= POKER_CONSTANTS.MIN_PLAYERS_PER_TABLE && !table.game) {
            await this.startGame(table);
        }
        const result = {
            success: true,
            position,
        };
        if (table.gameState) {
            result.tableState = table.gameState;
        }
        return result;
    }
    async leaveTable(tableId, playerId) {
        const table = this.tables.get(tableId);
        if (!table) {
            throw new Error('Table not found');
        }
        const player = table.players.get(playerId);
        if (!player) {
            throw new PlayerNotFoundError(playerId);
        }
        // Remove player from table
        table.players.delete(playerId);
        table.lastActivity = new Date();
        // End game if not enough players
        if (table.players.size < POKER_CONSTANTS.MIN_PLAYERS_PER_TABLE && table.game) {
            table.game = null;
            table.gameState = null;
        }
        // Remove table if empty
        if (table.players.size === 0) {
            this.tables.delete(tableId);
        }
    }
    async getTable(tableId) {
        return this.tables.get(tableId) || null;
    }
    async updateTableState(tableId, gameState) {
        const table = this.tables.get(tableId);
        if (!table) {
            throw new Error('Table not found');
        }
        table.gameState = gameState;
        table.lastActivity = new Date();
    }
    findAvailableSeat(table) {
        const occupiedSeats = new Set(Array.from(table.players.values())
            .map(player => player.position?.seat)
            .filter(seat => seat !== undefined));
        for (let seat = 0; seat < table.config.maxPlayers; seat++) {
            if (!occupiedSeats.has(seat)) {
                return {
                    seat,
                    isButton: false,
                    isSmallBlind: false,
                    isBigBlind: false,
                };
            }
        }
        return null;
    }
    async startGame(table) {
        const players = Array.from(table.players.values());
        if (players.length < POKER_CONSTANTS.MIN_PLAYERS_PER_TABLE) {
            return;
        }
        // Assign dealer button randomly for first hand
        const dealerIndex = Math.floor(Math.random() * players.length);
        players.forEach((player, index) => {
            if (player.position) {
                player.position.isButton = index === dealerIndex;
                player.position.isSmallBlind = false;
                player.position.isBigBlind = false;
            }
        });
        // Calculate blind positions
        const blindPositions = this.calculateBlindPositions(players.length, dealerIndex);
        if (players[blindPositions.smallBlind]?.position) {
            players[blindPositions.smallBlind].position.isSmallBlind = true;
        }
        if (players[blindPositions.bigBlind]?.position) {
            players[blindPositions.bigBlind].position.isBigBlind = true;
        }
        // Create new game
        table.game = new PokerGame(table.config, players);
        // Deal initial cards
        await table.game.dealCards();
        // Update table state
        table.gameState = table.game.getGameState();
    }
    calculateBlindPositions(playerCount, dealerPosition) {
        if (playerCount === 2) {
            return {
                smallBlind: dealerPosition,
                bigBlind: (dealerPosition + 1) % playerCount,
            };
        }
        return {
            smallBlind: (dealerPosition + 1) % playerCount,
            bigBlind: (dealerPosition + 2) % playerCount,
        };
    }
    // Utility methods for table management
    async getActiveTables() {
        return Array.from(this.tables.values()).filter(table => table.isActive);
    }
    async getTablesByPlayer(playerId) {
        return Array.from(this.tables.values()).filter(table => table.players.has(playerId));
    }
    async cleanupInactiveTables(maxInactiveTime = 3600000) {
        const now = new Date();
        const tablesToRemove = [];
        for (const [tableId, table] of this.tables) {
            const inactiveTime = now.getTime() - table.lastActivity.getTime();
            if (inactiveTime > maxInactiveTime && table.players.size === 0) {
                tablesToRemove.push(tableId);
            }
        }
        tablesToRemove.forEach(tableId => {
            this.tables.delete(tableId);
        });
    }
    async moveDealer(tableId) {
        const table = this.tables.get(tableId);
        if (!table || !table.game) {
            return;
        }
        const players = Array.from(table.players.values()).filter(player => player.status === PlayerStatus.ACTIVE);
        if (players.length < 2) {
            return;
        }
        // Find current dealer
        const currentDealerIndex = players.findIndex(player => player.position?.isButton);
        if (currentDealerIndex === -1) {
            return;
        }
        // Clear current positions
        players.forEach(player => {
            if (player.position) {
                player.position.isButton = false;
                player.position.isSmallBlind = false;
                player.position.isBigBlind = false;
            }
        });
        // Move dealer button
        const newDealerIndex = (currentDealerIndex + 1) % players.length;
        if (players[newDealerIndex]?.position) {
            players[newDealerIndex].position.isButton = true;
        }
        // Set new blind positions
        const blindPositions = this.calculateBlindPositions(players.length, newDealerIndex);
        if (players[blindPositions.smallBlind]?.position) {
            players[blindPositions.smallBlind].position.isSmallBlind = true;
        }
        if (players[blindPositions.bigBlind]?.position) {
            players[blindPositions.bigBlind].position.isBigBlind = true;
        }
    }
}
//# sourceMappingURL=table-manager.js.map