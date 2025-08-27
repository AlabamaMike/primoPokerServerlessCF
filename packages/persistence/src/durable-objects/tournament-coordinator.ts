import { DurableObject } from 'cloudflare:workers';
import { Tournament, TournamentState } from '@primo-poker/shared';
import { Env } from '../types/environment';
import { TableBalancer, BalancingStrategy } from '@primo-poker/core';

export interface TournamentConfig {
  name: string;
  maxPlayersPerTable: number;
  startingChips: number;
  blindLevelDuration: number; // minutes
  minPlayers: number;
  maxPlayers: number;
}

export interface TableInfo {
  tableId: string;
  tableStub: DurableObjectStub;
  playerCount: number;
  players: TournamentPlayer[];
  isActive: boolean;
  isFeatureTable?: boolean;
}

export interface TournamentPlayer {
  playerId: string;
  name: string;
  tableId?: string;
  seatNumber?: number;
  chipCount: number;
  position?: number; // finishing position
  isEliminated: boolean;
}

export interface TournamentData {
  tournamentId: string;
  config: TournamentConfig;
  state: TournamentState;
  tables: Map<string, TableInfo>;
  players: Map<string, TournamentPlayer>;
  currentLevel: number;
  startTime?: number;
  nextLevelTime?: number;
  totalChips: number;
  eliminatedTables: string[];
  isOnBreak: boolean;
  breakEndTime?: number;
}

export class TournamentCoordinator extends DurableObject {
  private tournament?: TournamentData;
  private levelTimer?: number;
  private balancer: TableBalancer;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.balancer = new TableBalancer();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.includes('/status')) {
      return this.getStatus(path);
    } else if (path.includes('/leaderboard')) {
      return this.getLeaderboard();
    }

    if (request.method === 'POST') {
      const body = await request.json();
      return this.handleAction(body);
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleAction(body: any): Promise<Response> {
    switch (body.action) {
      case 'CREATE_TOURNAMENT':
        return this.createTournament(body.tournamentId, body.config);
      case 'REGISTER_PLAYER':
        return this.registerPlayer(body.tournamentId, body.player);
      case 'START_TOURNAMENT':
        return this.startTournament(body.tournamentId);
      case 'PLAYER_ELIMINATED':
        return this.handlePlayerElimination(body);
      case 'UPDATE_CHIP_COUNT':
        return this.updateChipCount(body);
      case 'TOURNAMENT_BREAK':
        return this.startBreak(body.tournamentId, body.duration);
      case 'BROADCAST_MESSAGE':
        return this.broadcastMessage(body.tournamentId, body.message);
      case 'TABLE_FAILURE':
        return this.handleTableFailure(body);
      default:
        return new Response('Unknown action', { status: 400 });
    }
  }

  private async createTournament(
    tournamentId: string,
    config: TournamentConfig
  ): Promise<Response> {
    this.tournament = {
      tournamentId,
      config,
      state: TournamentState.REGISTERING,
      tables: new Map(),
      players: new Map(),
      currentLevel: 1,
      totalChips: 0,
      eliminatedTables: [],
      isOnBreak: false,
    };

    await this.ctx.storage.put('tournament', this.tournament);

    return Response.json({
      tournamentId,
      state: TournamentState.REGISTERING,
      tables: [],
    });
  }

  private async registerPlayer(
    tournamentId: string,
    player: { playerId: string; name: string }
  ): Promise<Response> {
    if (!this.tournament) {
      return new Response('Tournament not found', { status: 404 });
    }

    if (this.tournament.players.size >= this.tournament.config.maxPlayers) {
      return new Response('Tournament full', { status: 400 });
    }

    const tournamentPlayer: TournamentPlayer = {
      playerId: player.playerId,
      name: player.name,
      chipCount: this.tournament.config.startingChips,
      isEliminated: false,
    };

    this.tournament.players.set(player.playerId, tournamentPlayer);
    this.tournament.totalChips += this.tournament.config.startingChips;

    // Assign to table
    await this.assignPlayerToTable(tournamentPlayer);

    await this.ctx.storage.put('tournament', this.tournament);

    return Response.json({
      registered: true,
      playerId: player.playerId,
      tableId: tournamentPlayer.tableId,
      seatNumber: tournamentPlayer.seatNumber,
    });
  }

  private async assignPlayerToTable(player: TournamentPlayer): Promise<void> {
    if (!this.tournament) return;

    // Find table with space
    let targetTable: TableInfo | undefined;
    
    for (const [tableId, table] of this.tournament.tables) {
      if (table.playerCount < this.tournament.config.maxPlayersPerTable) {
        targetTable = table;
        break;
      }
    }

    // Create new table if needed
    if (!targetTable) {
      const tableId = `table-${this.tournament.tables.size + 1}`;
      const tableStub = this.env.GAME_TABLE.get(
        this.env.GAME_TABLE.idFromName(tableId)
      );

      targetTable = {
        tableId,
        tableStub,
        playerCount: 0,
        players: [],
        isActive: true,
      };

      this.tournament.tables.set(tableId, targetTable);
    }

    // Assign player to table
    player.tableId = targetTable.tableId;
    player.seatNumber = targetTable.playerCount + 1;
    targetTable.players.push(player);
    targetTable.playerCount++;
  }

  private async startTournament(tournamentId: string): Promise<Response> {
    if (!this.tournament) {
      return new Response('Tournament not found', { status: 404 });
    }

    if (this.tournament.players.size < this.tournament.config.minPlayers) {
      return new Response('Not enough players', { status: 400 });
    }

    this.tournament.state = TournamentState.IN_PROGRESS;
    this.tournament.startTime = Date.now();
    this.startLevelTimer();

    // Start all tables
    const startPromises = Array.from(this.tournament.tables.values()).map(
      table => this.startTable(table)
    );
    await Promise.all(startPromises);

    await this.ctx.storage.put('tournament', this.tournament);

    return Response.json({
      started: true,
      tables: this.tournament.tables.size,
      players: this.tournament.players.size,
    });
  }

  private startLevelTimer(): void {
    if (!this.tournament) return;

    const duration = this.tournament.config.blindLevelDuration * 60 * 1000;
    this.tournament.nextLevelTime = Date.now() + duration;

    this.levelTimer = setTimeout(() => {
      this.advanceLevel();
    }, duration) as unknown as number;
  }

  private async advanceLevel(): Promise<void> {
    if (!this.tournament) return;

    this.tournament.currentLevel++;
    this.startLevelTimer();

    // Notify all tables
    await this.broadcastToTables({
      type: 'LEVEL_CHANGE',
      level: this.tournament.currentLevel,
    });

    await this.ctx.storage.put('tournament', this.tournament);
  }

  private async handlePlayerElimination(body: {
    tournamentId: string;
    tableId: string;
    playerId: string;
    position: number;
  }): Promise<Response> {
    if (!this.tournament) {
      return new Response('Tournament not found', { status: 404 });
    }

    const player = this.tournament.players.get(body.playerId);
    if (!player) {
      return new Response('Player not found', { status: 404 });
    }

    player.isEliminated = true;
    player.position = body.position;
    player.chipCount = 0;

    const table = this.tournament.tables.get(body.tableId);
    if (table) {
      table.playerCount--;
      table.players = table.players.filter(p => p.playerId !== body.playerId);
    }

    // Check if rebalancing needed
    const result = await this.checkAndRebalance();

    await this.ctx.storage.put('tournament', this.tournament);

    return Response.json({
      eliminated: true,
      position: body.position,
      rebalanced: result.rebalanced,
      movedPlayers: result.movedPlayers || [],
      finalTable: result.finalTable,
      consolidatedToTable: result.consolidatedToTable,
    });
  }

  private async checkAndRebalance(): Promise<{
    rebalanced: boolean;
    movedPlayers?: any[];
    finalTable?: boolean;
    consolidatedToTable?: string;
  }> {
    if (!this.tournament) return { rebalanced: false };

    const activeTables = Array.from(this.tournament.tables.values())
      .filter(t => t.isActive && t.playerCount > 0);

    const totalPlayers = activeTables.reduce((sum, t) => sum + t.playerCount, 0);

    // Check for final table
    if (totalPlayers <= 9 && activeTables.length > 1) {
      return await this.consolidateToFinalTable(activeTables);
    }

    // Convert to balancer format
    const tableStates = activeTables.map(t => ({
      tableId: t.tableId,
      playerCount: t.playerCount,
      maxSeats: this.tournament!.config.maxPlayersPerTable,
      players: t.players.map(p => ({
        playerId: p.playerId,
        seatNumber: p.seatNumber!,
        chipCount: p.chipCount,
      })),
    }));

    // Check if consolidation needed
    const consolidation = this.balancer.consolidateTables(tableStates);
    if (consolidation.tablesToClose.length > 0) {
      return await this.executetableConsolidation(consolidation);
    }

    // Regular balancing
    const moves = this.balancer.calculateMoves(tableStates, BalancingStrategy.MINIMIZE_MOVES);
    if (moves.length > 0) {
      await this.executeMoves(moves);
      return { rebalanced: true, movedPlayers: moves };
    }

    return { rebalanced: false };
  }

  private async consolidateToFinalTable(
    activeTables: TableInfo[]
  ): Promise<{
    rebalanced: boolean;
    finalTable: boolean;
    consolidatedToTable: string;
  }> {
    if (!this.tournament) return { rebalanced: false, finalTable: false, consolidatedToTable: '' };

    // Choose the table to keep (prefer feature table)
    const targetTable = activeTables.find(t => t.isFeatureTable) || activeTables[0];
    const tablesToClose = activeTables.filter(t => t.tableId !== targetTable.tableId);

    // Move all players to final table
    for (const table of tablesToClose) {
      for (const player of table.players) {
        await this.movePlayer(player.playerId, table.tableId, targetTable.tableId);
      }
      table.isActive = false;
      this.tournament.eliminatedTables.push(table.tableId);
    }

    this.tournament.state = TournamentState.FINAL_TABLE;
    
    return {
      rebalanced: true,
      finalTable: true,
      consolidatedToTable: targetTable.tableId,
    };
  }

  private async executetableConsolidation(consolidation: any): Promise<{
    rebalanced: boolean;
    movedPlayers: any[];
  }> {
    if (!this.tournament) return { rebalanced: false, movedPlayers: [] };

    // Execute moves
    await this.executeMoves(consolidation.moves);

    // Close tables
    for (const tableId of consolidation.tablesToClose) {
      const table = this.tournament.tables.get(tableId);
      if (table) {
        table.isActive = false;
        this.tournament.eliminatedTables.push(tableId);
      }
    }

    return {
      rebalanced: true,
      movedPlayers: consolidation.moves,
    };
  }

  private async executeMoves(moves: any[]): Promise<void> {
    // Batch moves by independence
    const batches = this.balancer.batchMoves(moves);
    
    for (const batch of batches) {
      await Promise.all(
        batch.map(move =>
          this.movePlayer(move.playerId, move.fromTable, move.toTable, move.recommendedSeat)
        )
      );
    }
  }

  private async movePlayer(
    playerId: string,
    fromTableId: string,
    toTableId: string,
    recommendedSeat?: number
  ): Promise<void> {
    if (!this.tournament) return;

    const player = this.tournament.players.get(playerId);
    if (!player) return;

    const fromTable = this.tournament.tables.get(fromTableId);
    const toTable = this.tournament.tables.get(toTableId);
    
    if (!fromTable || !toTable) return;

    // Remove from old table
    fromTable.players = fromTable.players.filter(p => p.playerId !== playerId);
    fromTable.playerCount--;

    // Add to new table
    player.tableId = toTableId;
    player.seatNumber = recommendedSeat || toTable.playerCount + 1;
    toTable.players.push(player);
    toTable.playerCount++;

    // Notify tables
    await fromTable.tableStub.fetch(new Request('http://internal/remove-player', {
      method: 'POST',
      body: JSON.stringify({ playerId }),
    }));

    await toTable.tableStub.fetch(new Request('http://internal/add-player', {
      method: 'POST',
      body: JSON.stringify({
        playerId,
        seatNumber: player.seatNumber,
        chipCount: player.chipCount,
      }),
    }));
  }

  private async updateChipCount(body: {
    tournamentId: string;
    playerId: string;
    chipCount: number;
    tableId: string;
  }): Promise<Response> {
    if (!this.tournament) {
      return new Response('Tournament not found', { status: 404 });
    }

    const player = this.tournament.players.get(body.playerId);
    if (!player) {
      return new Response('Player not found', { status: 404 });
    }

    player.chipCount = body.chipCount;
    await this.ctx.storage.put('tournament', this.tournament);

    return Response.json({ updated: true });
  }

  private async startBreak(
    tournamentId: string,
    duration: number
  ): Promise<Response> {
    if (!this.tournament) {
      return new Response('Tournament not found', { status: 404 });
    }

    this.tournament.isOnBreak = true;
    this.tournament.breakEndTime = Date.now() + duration * 60 * 1000;

    // Pause all tables
    await this.broadcastToTables({ type: 'TOURNAMENT_BREAK', duration });

    await this.ctx.storage.put('tournament', this.tournament);

    return Response.json({
      onBreak: true,
      resumeTime: this.tournament.breakEndTime,
      tables: Array.from(this.tournament.tables.values()).map(t => ({
        tableId: t.tableId,
        paused: true,
      })),
    });
  }

  private async broadcastMessage(
    tournamentId: string,
    message: any
  ): Promise<Response> {
    if (!this.tournament) {
      return new Response('Tournament not found', { status: 404 });
    }

    const tablesNotified = await this.broadcastToTables(message);

    return Response.json({ tablesNotified });
  }

  private async broadcastToTables(message: any): Promise<number> {
    if (!this.tournament) return 0;

    const activeTables = Array.from(this.tournament.tables.values())
      .filter(t => t.isActive);

    await Promise.all(
      activeTables.map(table =>
        table.tableStub.fetch(new Request('http://internal/broadcast', {
          method: 'POST',
          body: JSON.stringify(message),
        }))
      )
    );

    return activeTables.length;
  }

  private async handleTableFailure(body: {
    tournamentId: string;
    tableId: string;
    reason: string;
  }): Promise<Response> {
    if (!this.tournament) {
      return new Response('Tournament not found', { status: 404 });
    }

    const failedTable = this.tournament.tables.get(body.tableId);
    if (!failedTable) {
      return new Response('Table not found', { status: 404 });
    }

    // Mark table as inactive
    failedTable.isActive = false;

    // Find new tables for players
    const playersToRelocate = failedTable.players.filter(p => !p.isEliminated);
    const newAssignments: any[] = [];

    for (const player of playersToRelocate) {
      // Find table with space
      const newTable = Array.from(this.tournament.tables.values())
        .filter(t => 
          t.isActive && 
          t.tableId !== body.tableId &&
          t.playerCount < this.tournament.config.maxPlayersPerTable
        )[0];

      if (newTable) {
        await this.movePlayer(player.playerId, body.tableId, newTable.tableId);
        newAssignments.push({
          playerId: player.playerId,
          newTableId: newTable.tableId,
        });
      }
    }

    await this.ctx.storage.put('tournament', this.tournament);

    return Response.json({
      recovered: true,
      playersRelocated: playersToRelocate.length,
      newTableAssignments: newAssignments,
    });
  }

  private async startTable(table: TableInfo): Promise<void> {
    await table.tableStub.fetch(new Request('http://internal/start-tournament-table', {
      method: 'POST',
      body: JSON.stringify({
        tournamentId: this.tournament?.tournamentId,
        blindLevel: this.tournament?.currentLevel,
        players: table.players,
      }),
    }));
  }

  private async getStatus(path: string): Promise<Response> {
    if (!this.tournament) {
      return new Response('Tournament not found', { status: 404 });
    }

    const activeTables = Array.from(this.tournament.tables.values())
      .filter(t => t.isActive);

    const status = {
      tournamentId: this.tournament.tournamentId,
      state: this.tournament.state,
      currentLevel: this.tournament.currentLevel,
      nextLevelTime: this.tournament.nextLevelTime,
      totalPlayers: this.tournament.players.size,
      playersRemaining: Array.from(this.tournament.players.values())
        .filter(p => !p.isEliminated).length,
      activeTables: activeTables.length,
      eliminatedTables: this.tournament.eliminatedTables,
      totalChips: this.tournament.totalChips,
      isOnBreak: this.tournament.isOnBreak,
      breakEndTime: this.tournament.breakEndTime,
      tables: activeTables.map(t => ({
        tableId: t.tableId,
        playerCount: t.playerCount,
        isFeatureTable: t.isFeatureTable,
      })),
    };

    return Response.json(status);
  }

  private async getLeaderboard(): Promise<Response> {
    if (!this.tournament) {
      return new Response('Tournament not found', { status: 404 });
    }

    const players = Array.from(this.tournament.players.values())
      .filter(p => !p.isEliminated)
      .sort((a, b) => b.chipCount - a.chipCount);

    return Response.json(players);
  }
}