import { Router } from 'itty-router';
export declare class PokerAPIRoutes {
    private router;
    private tableManager;
    private authManager;
    constructor();
    private setupRoutes;
    getRouter(): ReturnType<typeof Router>;
    private authenticateRequest;
    private handleLogin;
    private handleRefreshToken;
    private handleLogout;
    private handleGetProfile;
    private handleUpdateProfile;
    private handleGetTables;
    private handleCreateTable;
    private handleGetTable;
    private handleJoinTable;
    private handleLeaveTable;
    private handlePlayerAction;
    private handleGetGame;
    private handleGetGameHistory;
    private handleGetTournaments;
    private handleCreateTournament;
    private handleRegisterTournament;
    private handleHealthCheck;
    private handleNotFound;
    private successResponse;
    private errorResponse;
}
//# sourceMappingURL=routes.d.ts.map