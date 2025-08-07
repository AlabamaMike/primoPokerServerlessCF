/**
 * Chat Repository
 * 
 * Handles persistence of chat messages to D1 database
 */

import { D1Database } from '@cloudflare/workers-types'
import { RandomUtils } from '@primo-poker/shared'

export interface ChatMessageRecord {
  id: string
  player_id: string
  table_id?: string
  tournament_id?: string
  message: string
  message_type: 'chat' | 'system' | 'command'
  is_moderated: boolean
  moderation_reason?: string
  created_at: number
  updated_at: number
}

export interface ChatMessageInput {
  id: string
  playerId: string
  tableId?: string
  tournamentId?: string
  message: string
  messageType: 'chat' | 'system' | 'command'
  isModerated?: boolean
  moderationReason?: string
}

export interface ChatHistoryParams {
  tableId?: string
  tournamentId?: string
  playerId?: string
  limit?: number
  offset?: number
  startTime?: number
  endTime?: number
  includeModerated?: boolean
}

export interface ChatStats {
  totalMessages: number
  moderatedMessages: number
  uniquePlayers: number
}

export class ChatPersistenceRepository {
  constructor(private db: D1Database) {}

  /**
   * Save a chat message to the database
   */
  async saveMessage(message: ChatMessageInput): Promise<void> {
    const now = Date.now()
    
    try {
      await this.db.prepare(`
        INSERT INTO chat_messages (
          id, player_id, table_id, tournament_id, message, 
          message_type, is_moderated, moderation_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        message.id,
        message.playerId,
        message.tableId || null,
        message.tournamentId || null,
        message.message,
        message.messageType,
        message.isModerated || false,
        message.moderationReason || null,
        now,
        now
      ).run()
    } catch (error) {
      console.error('Failed to save chat message:', error)
      throw new Error('Failed to save chat message')
    }
  }

  /**
   * Save multiple messages in a batch
   */
  async saveMessagesBatch(messages: ChatMessageInput[]): Promise<void> {
    const now = Date.now()
    
    try {
      const statements = messages.map(message => 
        this.db.prepare(`
          INSERT INTO chat_messages (
            id, player_id, table_id, tournament_id, message, 
            message_type, is_moderated, moderation_reason, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          message.id,
          message.playerId,
          message.tableId || null,
          message.tournamentId || null,
          message.message,
          message.messageType,
          message.isModerated || false,
          message.moderationReason || null,
          now,
          now
        )
      )

      await this.db.batch(statements)
    } catch (error) {
      console.error('Failed to save chat messages batch:', error)
      throw new Error('Failed to save chat messages batch')
    }
  }

  /**
   * Get chat message history with filtering and pagination
   */
  async getMessageHistory(params: ChatHistoryParams): Promise<ChatMessageRecord[]> {
    let query = 'SELECT * FROM chat_messages WHERE 1=1'
    const bindings: any[] = []
    
    if (params.tableId) {
      query += ' AND table_id = ?'
      bindings.push(params.tableId)
    }
    
    if (params.tournamentId) {
      query += ' AND tournament_id = ?'
      bindings.push(params.tournamentId)
    }
    
    if (params.playerId) {
      query += ' AND player_id = ?'
      bindings.push(params.playerId)
    }
    
    if (params.startTime) {
      query += ' AND created_at >= ?'
      bindings.push(params.startTime)
    }
    
    if (params.endTime) {
      query += ' AND created_at <= ?'
      bindings.push(params.endTime)
    }
    
    if (!params.includeModerated) {
      query += ' AND is_moderated = 0'
    }
    
    query += ' ORDER BY created_at DESC'
    
    if (params.limit) {
      query += ' LIMIT ?'
      bindings.push(params.limit)
      
      if (params.offset) {
        query += ' OFFSET ?'
        bindings.push(params.offset)
      }
    }
    
    try {
      const result = await this.db.prepare(query).bind(...bindings).all()
      return result.results as ChatMessageRecord[]
    } catch (error) {
      console.error('Failed to get message history:', error)
      throw new Error('Failed to get message history')
    }
  }

  /**
   * Get a single message by ID
   */
  async getMessage(messageId: string): Promise<ChatMessageRecord | null> {
    try {
      const result = await this.db.prepare(
        'SELECT * FROM chat_messages WHERE id = ?'
      ).bind(messageId).first()
      
      return result as ChatMessageRecord | null
    } catch (error) {
      console.error('Failed to get message:', error)
      throw new Error('Failed to get message')
    }
  }

  /**
   * Mark a message as moderated
   */
  async markMessageAsModerated(messageId: string, reason: string): Promise<void> {
    try {
      await this.db.prepare(`
        UPDATE chat_messages 
        SET is_moderated = 1, moderation_reason = ?, updated_at = ?
        WHERE id = ?
      `).bind(reason, Date.now(), messageId).run()
    } catch (error) {
      console.error('Failed to mark message as moderated:', error)
      throw new Error('Failed to mark message as moderated')
    }
  }

  /**
   * Delete old messages (for cleanup)
   */
  async deleteOldMessages(olderThanTimestamp: number): Promise<number> {
    try {
      const result = await this.db.prepare(`
        DELETE FROM chat_messages WHERE created_at < ?
      `).bind(olderThanTimestamp).run()
      
      return result.meta.changes || 0
    } catch (error) {
      console.error('Failed to delete old messages:', error)
      throw new Error('Failed to delete old messages')
    }
  }

  /**
   * Get message statistics
   */
  async getMessageStats(tableId?: string): Promise<ChatStats> {
    let whereClause = ''
    const bindings: any[] = []
    
    if (tableId) {
      whereClause = ' WHERE table_id = ?'
      bindings.push(tableId)
    }
    
    try {
      const [totalResult, moderatedResult, uniquePlayersResult] = await Promise.all([
        this.db.prepare(
          `SELECT COUNT(*) as count FROM chat_messages${whereClause}`
        ).bind(...bindings).first(),
        
        this.db.prepare(
          `SELECT COUNT(*) as count FROM chat_messages${whereClause}${tableId ? ' AND' : ' WHERE'} is_moderated = 1`
        ).bind(...bindings).first(),
        
        this.db.prepare(
          `SELECT COUNT(DISTINCT player_id) as count FROM chat_messages${whereClause}`
        ).bind(...bindings).first()
      ])
      
      return {
        totalMessages: (totalResult as any)?.count || 0,
        moderatedMessages: (moderatedResult as any)?.count || 0,
        uniquePlayers: (uniquePlayersResult as any)?.count || 0
      }
    } catch (error) {
      console.error('Failed to get message stats:', error)
      throw new Error('Failed to get message stats')
    }
  }

  /**
   * Get recent messages for a player (for rate limiting checks)
   */
  async getRecentPlayerMessages(
    playerId: string, 
    channelId: string, 
    withinMinutes: number = 1
  ): Promise<number> {
    const timestamp = Date.now() - (withinMinutes * 60 * 1000)
    
    try {
      const result = await this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM chat_messages 
        WHERE player_id = ? 
          AND (table_id = ? OR tournament_id = ?)
          AND created_at >= ?
      `).bind(playerId, channelId, channelId, timestamp).first()
      
      return (result as any)?.count || 0
    } catch (error) {
      console.error('Failed to get recent player messages:', error)
      return 0
    }
  }

  /**
   * Search messages by content
   */
  async searchMessages(
    searchTerm: string,
    params: Omit<ChatHistoryParams, 'limit' | 'offset'> & { limit?: number }
  ): Promise<ChatMessageRecord[]> {
    let query = 'SELECT * FROM chat_messages WHERE message LIKE ?'
    const bindings: any[] = [`%${searchTerm}%`]
    
    if (params.tableId) {
      query += ' AND table_id = ?'
      bindings.push(params.tableId)
    }
    
    if (params.tournamentId) {
      query += ' AND tournament_id = ?'
      bindings.push(params.tournamentId)
    }
    
    if (params.playerId) {
      query += ' AND player_id = ?'
      bindings.push(params.playerId)
    }
    
    if (!params.includeModerated) {
      query += ' AND is_moderated = 0'
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?'
    bindings.push(params.limit || 50)
    
    try {
      const result = await this.db.prepare(query).bind(...bindings).all()
      return result.results as ChatMessageRecord[]
    } catch (error) {
      console.error('Failed to search messages:', error)
      throw new Error('Failed to search messages')
    }
  }

  /**
   * Get player chat activity
   */
  async getPlayerActivity(playerId: string, days: number = 7): Promise<{
    messageCount: number
    moderatedCount: number
    lastMessageAt: number | null
    activeChannels: string[]
  }> {
    const timestamp = Date.now() - (days * 24 * 60 * 60 * 1000)
    
    try {
      const [messageStats, channelsResult] = await Promise.all([
        this.db.prepare(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN is_moderated = 1 THEN 1 ELSE 0 END) as moderated,
            MAX(created_at) as last_message
          FROM chat_messages 
          WHERE player_id = ? AND created_at >= ?
        `).bind(playerId, timestamp).first(),
        
        this.db.prepare(`
          SELECT DISTINCT table_id, tournament_id
          FROM chat_messages 
          WHERE player_id = ? AND created_at >= ?
        `).bind(playerId, timestamp).all()
      ])
      
      const stats = messageStats as any
      const channels = channelsResult.results as any[]
      
      const activeChannels = channels
        .map(c => c.table_id || c.tournament_id)
        .filter(Boolean)
      
      return {
        messageCount: stats?.total || 0,
        moderatedCount: stats?.moderated || 0,
        lastMessageAt: stats?.last_message || null,
        activeChannels: [...new Set(activeChannels)]
      }
    } catch (error) {
      console.error('Failed to get player activity:', error)
      throw new Error('Failed to get player activity')
    }
  }
}