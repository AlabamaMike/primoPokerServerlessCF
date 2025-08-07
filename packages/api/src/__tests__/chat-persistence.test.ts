/**
 * Chat Persistence Tests
 * 
 * Tests for chat message persistence to D1 database
 */

import { D1Database, D1Result } from '@cloudflare/workers-types'

// Mock D1Database
class MockD1Database implements Partial<D1Database> {
  private data = new Map<string, any[]>()
  
  prepare(query: string): any {
    return {
      bind: (...params: any[]) => ({
        run: async () => this.executeQuery(query, params),
        all: async () => this.executeQuery(query, params),
        first: async () => {
          const result = await this.executeQuery(query, params)
          return result.results?.[0]
        }
      }),
      run: async () => this.executeQuery(query, []),
      all: async () => this.executeQuery(query, []),
      first: async () => {
        const result = await this.executeQuery(query, [])
        return result.results?.[0]
      }
    }
  }

  batch(statements: any[]): Promise<D1Result<unknown>[]> {
    return Promise.all(statements.map(stmt => stmt.run()))
  }

  dump(): Promise<ArrayBuffer> {
    throw new Error('Not implemented')
  }

  exec(query: string): Promise<D1Result> {
    return this.executeQuery(query, [])
  }

  private async executeQuery(query: string, params: any[]): Promise<D1Result<any>> {
    // Simple mock implementation
    const upperQuery = query.toUpperCase().trim()
    
    if (upperQuery.startsWith('INSERT INTO CHAT_MESSAGES')) {
      const message = {
        id: params[0],
        player_id: params[1],
        table_id: params[2],
        tournament_id: params[3],
        message: params[4],
        message_type: params[5],
        is_moderated: params[6],
        moderation_reason: params[7],
        created_at: params[8],
        updated_at: params[9]
      }
      
      const messages = this.data.get('chat_messages') || []
      messages.push(message)
      this.data.set('chat_messages', messages)
      
      return {
        results: [],
        success: true,
        meta: { changes: 1, last_row_id: 1, duration: 1 }
      }
    }
    
    if (upperQuery.startsWith('SELECT') && upperQuery.includes('CHAT_MESSAGES')) {
      const messages = this.data.get('chat_messages') || []
      let filtered = [...messages]
      
      // Simple WHERE clause handling
      if (upperQuery.includes('WHERE')) {
        if (upperQuery.includes('TABLE_ID')) {
          const tableId = params.find((p, i) => query.includes(`table_id = ?`) && i === 0)
          filtered = filtered.filter(m => m.table_id === tableId)
        }
        if (upperQuery.includes('PLAYER_ID')) {
          const playerId = params.find((p, i) => query.includes(`player_id = ?`))
          filtered = filtered.filter(m => m.player_id === playerId)
        }
      }
      
      // Simple ORDER BY handling
      if (upperQuery.includes('ORDER BY CREATED_AT DESC')) {
        filtered.sort((a, b) => b.created_at - a.created_at)
      }
      
      // Simple LIMIT handling
      if (upperQuery.includes('LIMIT')) {
        const limitMatch = upperQuery.match(/LIMIT (\d+)/)
        if (limitMatch) {
          const limit = parseInt(limitMatch[1])
          filtered = filtered.slice(0, limit)
        }
      }
      
      return {
        results: filtered,
        success: true,
        meta: { changes: 0, last_row_id: 0, duration: 1 }
      }
    }
    
    if (upperQuery.startsWith('UPDATE CHAT_MESSAGES')) {
      const messages = this.data.get('chat_messages') || []
      const id = params[params.length - 1] // Assuming ID is last param
      const messageIndex = messages.findIndex(m => m.id === id)
      
      if (messageIndex !== -1) {
        if (upperQuery.includes('IS_MODERATED')) {
          messages[messageIndex].is_moderated = true
          messages[messageIndex].moderation_reason = params[0]
        }
        messages[messageIndex].updated_at = Date.now()
      }
      
      return {
        results: [],
        success: true,
        meta: { changes: messageIndex !== -1 ? 1 : 0, last_row_id: 0, duration: 1 }
      }
    }
    
    if (upperQuery.startsWith('DELETE FROM CHAT_MESSAGES')) {
      const messages = this.data.get('chat_messages') || []
      const beforeLength = messages.length
      
      if (upperQuery.includes('CREATED_AT <')) {
        const timestamp = params[0]
        this.data.set('chat_messages', messages.filter(m => m.created_at >= timestamp))
      }
      
      const changes = beforeLength - (this.data.get('chat_messages')?.length || 0)
      
      return {
        results: [],
        success: true,
        meta: { changes, last_row_id: 0, duration: 1 }
      }
    }
    
    return {
      results: [],
      success: true,
      meta: { changes: 0, last_row_id: 0, duration: 1 }
    }
  }
}

// Chat Persistence Repository
export class ChatPersistenceRepository {
  constructor(private db: D1Database) {}

  async saveMessage(message: {
    id: string
    playerId: string
    tableId?: string
    tournamentId?: string
    message: string
    messageType: 'chat' | 'system' | 'command'
    isModerated?: boolean
    moderationReason?: string
  }): Promise<void> {
    const now = Date.now()
    
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
  }

  async getMessageHistory(params: {
    tableId?: string
    tournamentId?: string
    playerId?: string
    limit?: number
    offset?: number
    startTime?: number
    endTime?: number
    includeModerated?: boolean
  }): Promise<any[]> {
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
      query += ' AND is_moderated = false'
    }
    
    query += ' ORDER BY created_at DESC'
    
    if (params.limit) {
      query += ` LIMIT ${params.limit}`
      if (params.offset) {
        query += ` OFFSET ${params.offset}`
      }
    }
    
    const result = await this.db.prepare(query).bind(...bindings).all()
    return result.results
  }

  async markMessageAsModerated(messageId: string, reason: string): Promise<void> {
    await this.db.prepare(`
      UPDATE chat_messages 
      SET is_moderated = true, moderation_reason = ?, updated_at = ?
      WHERE id = ?
    `).bind(reason, Date.now(), messageId).run()
  }

  async deleteOldMessages(olderThanTimestamp: number): Promise<number> {
    const result = await this.db.prepare(`
      DELETE FROM chat_messages WHERE created_at < ?
    `).bind(olderThanTimestamp).run()
    
    return result.meta.changes || 0
  }

  async getMessageStats(tableId?: string): Promise<{
    totalMessages: number
    moderatedMessages: number
    uniquePlayers: number
  }> {
    let whereClause = ''
    const bindings: any[] = []
    
    if (tableId) {
      whereClause = ' WHERE table_id = ?'
      bindings.push(tableId)
    }
    
    const totalResult = await this.db.prepare(
      `SELECT COUNT(*) as count FROM chat_messages${whereClause}`
    ).bind(...bindings).first()
    
    const moderatedResult = await this.db.prepare(
      `SELECT COUNT(*) as count FROM chat_messages${whereClause}${tableId ? ' AND' : ' WHERE'} is_moderated = true`
    ).bind(...bindings).first()
    
    const uniquePlayersResult = await this.db.prepare(
      `SELECT COUNT(DISTINCT player_id) as count FROM chat_messages${whereClause}`
    ).bind(...bindings).first()
    
    return {
      totalMessages: totalResult?.count || 0,
      moderatedMessages: moderatedResult?.count || 0,
      uniquePlayers: uniquePlayersResult?.count || 0
    }
  }
}

describe('Chat Persistence', () => {
  let db: MockD1Database
  let repository: ChatPersistenceRepository

  beforeEach(() => {
    db = new MockD1Database()
    repository = new ChatPersistenceRepository(db as any)
  })

  describe('Message Saving', () => {
    it('should save a chat message', async () => {
      const message = {
        id: 'msg-123',
        playerId: 'player-1',
        tableId: 'table-1',
        message: 'Hello, world!',
        messageType: 'chat' as const
      }

      await repository.saveMessage(message)

      const history = await repository.getMessageHistory({ tableId: 'table-1' })
      expect(history).toHaveLength(1)
      expect(history[0].message).toBe('Hello, world!')
    })

    it('should save a system message', async () => {
      const message = {
        id: 'msg-sys-1',
        playerId: 'system',
        tableId: 'table-1',
        message: 'Player2 joined the table',
        messageType: 'system' as const
      }

      await repository.saveMessage(message)

      const history = await repository.getMessageHistory({ tableId: 'table-1' })
      expect(history).toHaveLength(1)
      expect(history[0].message_type).toBe('system')
    })

    it('should save a command message', async () => {
      const message = {
        id: 'msg-cmd-1',
        playerId: 'player-1',
        tableId: 'table-1',
        message: '/fold',
        messageType: 'command' as const
      }

      await repository.saveMessage(message)

      const history = await repository.getMessageHistory({ tableId: 'table-1' })
      expect(history).toHaveLength(1)
      expect(history[0].message_type).toBe('command')
    })

    it('should save moderated messages', async () => {
      const message = {
        id: 'msg-mod-1',
        playerId: 'player-1',
        tableId: 'table-1',
        message: '[MODERATED]',
        messageType: 'chat' as const,
        isModerated: true,
        moderationReason: 'Inappropriate language'
      }

      await repository.saveMessage(message)

      const history = await repository.getMessageHistory({ 
        tableId: 'table-1',
        includeModerated: true 
      })
      expect(history).toHaveLength(1)
      expect(history[0].is_moderated).toBe(true)
      expect(history[0].moderation_reason).toBe('Inappropriate language')
    })
  })

  describe('Message Retrieval', () => {
    beforeEach(async () => {
      // Add test messages
      const messages = [
        { id: '1', playerId: 'p1', tableId: 't1', message: 'Message 1', messageType: 'chat' as const },
        { id: '2', playerId: 'p2', tableId: 't1', message: 'Message 2', messageType: 'chat' as const },
        { id: '3', playerId: 'p1', tableId: 't2', message: 'Message 3', messageType: 'chat' as const },
        { id: '4', playerId: 'p3', tableId: 't1', message: 'Message 4', messageType: 'system' as const },
        { id: '5', playerId: 'p1', tableId: 't1', message: 'Message 5', messageType: 'chat' as const }
      ]

      for (const msg of messages) {
        await repository.saveMessage(msg)
      }
    })

    it('should retrieve messages by table', async () => {
      const history = await repository.getMessageHistory({ tableId: 't1' })
      expect(history).toHaveLength(4)
      expect(history.every(m => m.table_id === 't1')).toBe(true)
    })

    it('should retrieve messages by player', async () => {
      const history = await repository.getMessageHistory({ playerId: 'p1' })
      expect(history).toHaveLength(3)
      expect(history.every(m => m.player_id === 'p1')).toBe(true)
    })

    it('should paginate results', async () => {
      const page1 = await repository.getMessageHistory({ 
        tableId: 't1',
        limit: 2,
        offset: 0 
      })
      expect(page1).toHaveLength(2)

      const page2 = await repository.getMessageHistory({ 
        tableId: 't1',
        limit: 2,
        offset: 2 
      })
      expect(page2).toHaveLength(2)
    })

    it('should filter by time range', async () => {
      const now = Date.now()
      const history = await repository.getMessageHistory({ 
        startTime: now - 3600000, // 1 hour ago
        endTime: now
      })
      expect(history.length).toBeGreaterThan(0)
    })

    it('should exclude moderated messages by default', async () => {
      await repository.markMessageAsModerated('1', 'Test moderation')
      
      const history = await repository.getMessageHistory({ tableId: 't1' })
      expect(history.find(m => m.id === '1')).toBeUndefined()

      const historyWithModerated = await repository.getMessageHistory({ 
        tableId: 't1',
        includeModerated: true 
      })
      expect(historyWithModerated.find(m => m.id === '1')).toBeDefined()
    })

    it('should order messages by creation time', async () => {
      const history = await repository.getMessageHistory({ tableId: 't1' })
      
      // Messages should be in descending order (newest first)
      for (let i = 1; i < history.length; i++) {
        expect(history[i - 1].created_at).toBeGreaterThanOrEqual(history[i].created_at)
      }
    })
  })

  describe('Message Moderation', () => {
    it('should mark message as moderated', async () => {
      await repository.saveMessage({
        id: 'msg-to-moderate',
        playerId: 'player-1',
        tableId: 'table-1',
        message: 'Bad message',
        messageType: 'chat'
      })

      await repository.markMessageAsModerated('msg-to-moderate', 'Inappropriate content')

      const history = await repository.getMessageHistory({ 
        tableId: 'table-1',
        includeModerated: true 
      })
      
      const moderatedMsg = history.find(m => m.id === 'msg-to-moderate')
      expect(moderatedMsg?.is_moderated).toBe(true)
      expect(moderatedMsg?.moderation_reason).toBe('Inappropriate content')
    })
  })

  describe('Message Cleanup', () => {
    it('should delete old messages', async () => {
      // Save messages with different timestamps
      const oldTimestamp = Date.now() - 86400000 * 2 // 2 days ago
      const recentTimestamp = Date.now() - 3600000 // 1 hour ago

      // Mock old messages
      await db.exec(`INSERT INTO chat_messages VALUES 
        ('old-1', 'p1', 't1', null, 'Old message', 'chat', false, null, ${oldTimestamp}, ${oldTimestamp}),
        ('recent-1', 'p1', 't1', null, 'Recent message', 'chat', false, null, ${recentTimestamp}, ${recentTimestamp})
      `)

      const deletedCount = await repository.deleteOldMessages(Date.now() - 86400000) // Delete older than 1 day

      expect(deletedCount).toBe(1)

      const remaining = await repository.getMessageHistory({})
      expect(remaining.find(m => m.id === 'old-1')).toBeUndefined()
      expect(remaining.find(m => m.id === 'recent-1')).toBeDefined()
    })
  })

  describe('Message Statistics', () => {
    beforeEach(async () => {
      // Add varied test data
      await repository.saveMessage({
        id: 's1',
        playerId: 'p1',
        tableId: 'stats-table',
        message: 'Message 1',
        messageType: 'chat'
      })

      await repository.saveMessage({
        id: 's2',
        playerId: 'p2',
        tableId: 'stats-table',
        message: 'Message 2',
        messageType: 'chat'
      })

      await repository.saveMessage({
        id: 's3',
        playerId: 'p1',
        tableId: 'stats-table',
        message: 'Bad message',
        messageType: 'chat',
        isModerated: true,
        moderationReason: 'Spam'
      })

      await repository.saveMessage({
        id: 's4',
        playerId: 'p3',
        tableId: 'other-table',
        message: 'Other table message',
        messageType: 'chat'
      })
    })

    it('should get message statistics for a table', async () => {
      const stats = await repository.getMessageStats('stats-table')
      
      expect(stats.totalMessages).toBe(3)
      expect(stats.moderatedMessages).toBe(1)
      expect(stats.uniquePlayers).toBe(2)
    })

    it('should get global message statistics', async () => {
      const stats = await repository.getMessageStats()
      
      expect(stats.totalMessages).toBe(4)
      expect(stats.moderatedMessages).toBe(1)
      expect(stats.uniquePlayers).toBe(3)
    })
  })
})