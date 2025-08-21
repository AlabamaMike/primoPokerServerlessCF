/**
 * Authentication and authorization types
 */

export interface TokenPayload {
  sub: string; // user ID
  email: string;
  username: string;
  roles: string[];
  iat: number;
  exp: number;
  jti?: string; // JWT ID for token revocation
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  roles: string[];
  permissions: string[];
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
  lastActivity: Date;
  userAgent?: string;
  ipAddress?: string;
}

export enum UserRole {
  PLAYER = 'player',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export enum Permission {
  // Player permissions
  PLAY_GAMES = 'play_games',
  CREATE_TABLES = 'create_tables',
  JOIN_TOURNAMENTS = 'join_tournaments',
  CHAT = 'chat',
  
  // Moderator permissions
  MODERATE_CHAT = 'moderate_chat',
  KICK_PLAYERS = 'kick_players',
  CLOSE_TABLES = 'close_tables',
  VIEW_REPORTS = 'view_reports',
  
  // Admin permissions
  MANAGE_USERS = 'manage_users',
  MANAGE_TOURNAMENTS = 'manage_tournaments',
  VIEW_FINANCIALS = 'view_financials',
  CONFIGURE_SYSTEM = 'configure_system',
  
  // Super admin permissions
  ALL = 'all',
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenExpiresIn: string;
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
}

export interface LoginAttempt {
  userId?: string;
  email: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  timestamp: Date;
  reason?: string;
}