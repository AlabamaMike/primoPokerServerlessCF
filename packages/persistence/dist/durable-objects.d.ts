export declare class TableDurableObject implements DurableObject {
    private state;
    private table;
    constructor(state: DurableObjectState, env: Env);
    fetch(request: Request): Promise<Response>;
    private handleGet;
    private handlePost;
    private handlePut;
    private handleDelete;
    private createTable;
    private joinTable;
    private leaveTable;
    private processPlayerAction;
    private processChatMessage;
    private updateGameState;
    private deleteTable;
    private loadTable;
    webSocketMessage(ws: WebSocket, message: string): Promise<void>;
    private handleWebSocketJoin;
    private handleWebSocketAction;
    private handleWebSocketChat;
}
export interface Env {
    DB: D1Database;
    HAND_HISTORY_BUCKET: R2Bucket;
    SESSION_STORE: KVNamespace;
    TABLE_OBJECTS: DurableObjectNamespace;
}
export { TableDurableObject as default };
//# sourceMappingURL=durable-objects.d.ts.map