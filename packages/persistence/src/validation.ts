/**
 * Input validation schemas for Durable Objects
 */

import { z } from 'zod'

// Wallet Manager validation schemas
export const walletInitializeSchema = z.object({
  playerId: z.string().min(1).max(100),
  initialBalance: z.number().positive().optional()
})

export const walletDepositSchema = z.object({
  playerId: z.string().min(1).max(100),
  amount: z.number().positive().max(1000000),
  description: z.string().max(500).optional()
})

export const walletWithdrawSchema = z.object({
  playerId: z.string().min(1).max(100),
  amount: z.number().positive().max(1000000),
  description: z.string().max(500).optional()
})

export const walletTransferSchema = z.object({
  fromPlayerId: z.string().min(1).max(100),
  toPlayerId: z.string().min(1).max(100),
  amount: z.number().positive().max(100000),
  description: z.string().max(500)
})

export const walletCashOutSchema = z.object({
  playerId: z.string().min(1).max(100),
  tableId: z.string().min(1).max(100),
  chipAmount: z.number().positive()
})

// Lobby Coordinator validation schemas
export const lobbyCreateTableSchema = z.object({
  tableId: z.string().min(1).max(100),
  config: z.object({
    name: z.string().min(1).max(100),
    gameType: z.string(),
    stakes: z.object({
      smallBlind: z.number().positive(),
      bigBlind: z.number().positive(),
      minBuyIn: z.number().positive(),
      maxBuyIn: z.number().positive()
    }),
    maxPlayers: z.number().min(2).max(10),
    isPrivate: z.boolean(),
    password: z.string().max(100).optional()
  }),
  creatorId: z.string().min(1).max(100)
})

export const lobbyUpdateTableSchema = z.object({
  tableId: z.string().min(1).max(100),
  players: z.array(z.object({
    playerId: z.string(),
    username: z.string(),
    chipCount: z.number(),
    seatIndex: z.number(),
    isActive: z.boolean()
  })).optional(),
  gameState: z.any().optional(),
  pot: z.number().min(0).optional(),
  phase: z.string().optional()
})

export const lobbyRemoveTableSchema = z.object({
  tableId: z.string().min(1).max(100)
})

// Chat Moderator validation schemas
export const chatSendMessageSchema = z.object({
  channelId: z.string().min(1).max(100),
  userId: z.string().min(1).max(100),
  username: z.string().min(1).max(50),
  content: z.string().min(1).max(1000),
  messageType: z.enum(['text', 'emote', 'system']).optional()
})

export const chatMuteUserSchema = z.object({
  channelId: z.string().min(1).max(100),
  userId: z.string().min(1).max(100),
  mutedBy: z.string().min(1).max(100),
  duration: z.number().positive().max(86400000), // Max 24 hours
  reason: z.string().max(500).optional()
})

export const chatDeleteMessageSchema = z.object({
  messageId: z.string().min(1).max(100),
  channelId: z.string().min(1).max(100),
  deletedBy: z.string().min(1).max(100),
  isAdmin: z.boolean()
})

// Helper function to validate and parse request body
export async function validateRequestBody<T>(
  request: Request, 
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await request.json()
    return schema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ')
      throw new Error(`Validation error: ${errorMessage}`)
    }
    throw error
  }
}