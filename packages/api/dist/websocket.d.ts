import { GameState } from '@primo-poker/shared';
export interface WebSocketConnection {
    ws: WebSocket;
    playerId: string;
    tableId: string;
    username: string;
    isAuthenticated: boolean;
    lastActivity: Date;
}
export declare class WebSocketManager {
    private connections;
    private tableConnections;
    private authManager;
    constructor(jwtSecret: string);
    handleConnection(ws: WebSocket, request: Request): Promise<void>;
    private handleMessage;
    private handlePlayerAction;
    private handleChatMessage;
    private handleJoinTable;
    private handleLeaveTable;
    private handleDisconnection;
    private sendMessage;
    private sendError;
    private broadcastToTable;
    private setupPingPong;
    broadcastGameUpdate(tableId: string, gameState: GameState): void;
    broadcastSystemMessage(tableId: string, message: string): void;
    getTableConnections(tableId: string): number;
    getActiveConnections(): number;
    closeTableConnections(tableId: string): void;
    cleanup(): void;
}
//# sourceMappingURL=websocket.d.ts.map