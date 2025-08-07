import { Hono } from 'hono'
import { z } from 'zod'
import { authenticateUser } from '../middleware/auth'
import { D1Database } from '@cloudflare/workers-types'
import { ModerationActionsManager, ModerationRepository } from '../chat-moderation/moderation-actions'
import { ReportSystem, ReportRepository } from '../chat-moderation/report-system'
import { ProfanityFilter } from '@primo-poker/shared'
import { ContentValidator } from '../chat-moderation/content-validator'

interface ModerationEnv {
  DB: D1Database
  JWT_SECRET: string
}

// Zod schemas for validation
const reportMessageSchema = z.object({
  messageId: z.string(),
  playerId: z.string(),
  reason: z.string().min(1).max(500),
  metadata: z.record(z.any()).optional(),
})

const processReportSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  actionType: z.enum(['WARNING', 'MUTE', 'SHADOW_BAN', 'BAN']).optional(),
  notes: z.string().optional(),
})

const applyActionSchema = z.object({
  playerId: z.string(),
  type: z.enum(['WARNING', 'MUTE', 'SHADOW_BAN', 'BAN']),
  reason: z.string().min(1).max(500),
  duration: z.number().positive().optional(),
  metadata: z.record(z.any()).optional(),
})

const validateMessageSchema = z.object({
  message: z.string(),
})

export const createModerationRoutes = () => {
  const app = new Hono<{ Bindings: ModerationEnv }>()

  // Middleware to check moderator permissions
  const requireModerator = async (c: any, next: any) => {
    const user = c.get('user')
    if (!user.roles?.includes('moderator') && !user.roles?.includes('admin')) {
      return c.json({ error: 'Insufficient permissions' }, 403)
    }
    await next()
  }

  // Report a message
  app.post('/report', authenticateUser, async (c) => {
    try {
      const user = c.get('user')
      const body = await c.req.json()
      const validated = reportMessageSchema.parse(body)

      const reportRepo = createReportRepository(c.env.DB)
      const actionsRepo = createModerationRepository(c.env.DB)
      const actionsManager = new ModerationActionsManager(actionsRepo)
      
      const reportSystem = new ReportSystem(reportRepo, actionsManager, {
        autoActionThreshold: 3,
        reviewRequiredThreshold: 2,
        falseReportPenaltyThreshold: 5,
        reportCooldownMs: 60000,
      })

      const report = await reportSystem.submitReport({
        ...validated,
        reportedBy: user.playerId,
      })

      return c.json({ success: true, data: report })
    } catch (error: any) {
      if (error.message?.includes('already reported') || error.message?.includes('wait before')) {
        return c.json({ error: error.message }, 400)
      }
      return c.json({ error: 'Failed to submit report' }, 500)
    }
  })

  // Get reports (moderator only)
  app.get('/reports', authenticateUser, requireModerator, async (c) => {
    try {
      const status = c.req.query('status')
      const playerId = c.req.query('playerId')
      const limit = parseInt(c.req.query('limit') || '50')
      const offset = parseInt(c.req.query('offset') || '0')

      const db = c.env.DB
      let query = 'SELECT * FROM message_reports WHERE 1=1'
      const params: any[] = []

      if (status) {
        query += ' AND status = ?'
        params.push(status)
      }

      if (playerId) {
        query += ' AND player_id = ?'
        params.push(playerId)
      }

      query += ' ORDER BY reported_at DESC LIMIT ? OFFSET ?'
      params.push(limit, offset)

      const result = await db.prepare(query).bind(...params).all()

      return c.json({ success: true, data: result.results })
    } catch (error) {
      return c.json({ error: 'Failed to fetch reports' }, 500)
    }
  })

  // Process a report (moderator only)
  app.post('/reports/:reportId/process', authenticateUser, requireModerator, async (c) => {
    try {
      const user = c.get('user')
      const reportId = c.req.param('reportId')
      const body = await c.req.json()
      const validated = processReportSchema.parse(body)

      const reportRepo = createReportRepository(c.env.DB)
      const actionsRepo = createModerationRepository(c.env.DB)
      const actionsManager = new ModerationActionsManager(actionsRepo)
      
      const reportSystem = new ReportSystem(reportRepo, actionsManager, {
        autoActionThreshold: 3,
        reviewRequiredThreshold: 2,
        falseReportPenaltyThreshold: 5,
        reportCooldownMs: 60000,
      })

      await reportSystem.processReport({
        reportId,
        ...validated,
        reviewedBy: user.playerId,
      })

      return c.json({ success: true })
    } catch (error: any) {
      if (error.message?.includes('already been processed')) {
        return c.json({ error: error.message }, 400)
      }
      return c.json({ error: 'Failed to process report' }, 500)
    }
  })

  // Apply moderation action directly (moderator only)
  app.post('/actions', authenticateUser, requireModerator, async (c) => {
    try {
      const user = c.get('user')
      const body = await c.req.json()
      const validated = applyActionSchema.parse(body)

      const actionsRepo = createModerationRepository(c.env.DB)
      const actionsManager = new ModerationActionsManager(actionsRepo)

      const action = await actionsManager.applyAction({
        ...validated,
        appliedBy: user.playerId,
      })

      return c.json({ success: true, data: action })
    } catch (error) {
      return c.json({ error: 'Failed to apply action' }, 500)
    }
  })

  // Get player restrictions
  app.get('/players/:playerId/restrictions', authenticateUser, async (c) => {
    try {
      const playerId = c.req.param('playerId')
      const user = c.get('user')

      // Players can only view their own restrictions unless they're moderators
      if (playerId !== user.playerId && !user.roles?.includes('moderator') && !user.roles?.includes('admin')) {
        return c.json({ error: 'Insufficient permissions' }, 403)
      }

      const actionsRepo = createModerationRepository(c.env.DB)
      const actionsManager = new ModerationActionsManager(actionsRepo)

      const restrictions = await actionsManager.getPlayerRestrictions(playerId)

      return c.json({ success: true, data: restrictions })
    } catch (error) {
      return c.json({ error: 'Failed to fetch restrictions' }, 500)
    }
  })

  // Get moderation stats (moderator only)
  app.get('/stats', authenticateUser, requireModerator, async (c) => {
    try {
      const db = c.env.DB
      
      const stats = await db.prepare(`
        SELECT 
          COUNT(DISTINCT CASE WHEN type = 'WARNING' THEN id END) as total_warnings,
          COUNT(DISTINCT CASE WHEN type = 'MUTE' THEN id END) as total_mutes,
          COUNT(DISTINCT CASE WHEN type = 'SHADOW_BAN' THEN id END) as total_shadow_bans,
          COUNT(DISTINCT CASE WHEN type = 'BAN' THEN id END) as total_bans,
          COUNT(DISTINCT CASE WHEN status = 'ACTIVE' THEN id END) as active_actions,
          COUNT(DISTINCT player_id) as affected_players
        FROM moderation_actions
      `).first()

      const reportStats = await db.prepare(`
        SELECT 
          COUNT(*) as total_reports,
          COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_reports,
          COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) as approved_reports,
          COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_reports
        FROM message_reports
      `).first()

      return c.json({ 
        success: true, 
        data: {
          actions: stats,
          reports: reportStats,
        }
      })
    } catch (error) {
      return c.json({ error: 'Failed to fetch stats' }, 500)
    }
  })

  // Validate message content
  app.post('/validate', authenticateUser, async (c) => {
    try {
      const body = await c.req.json()
      const validated = validateMessageSchema.parse(body)

      const profanityFilter = new ProfanityFilter()
      const validator = new ContentValidator({
        profanityFilter,
        maxMessageLength: 500,
        minMessageLength: 1,
        allowedEmojis: true,
        allowedLinks: false,
        spamThreshold: 5,
        capsThreshold: 0.7,
      })

      const result = await validator.validateMessage(validated.message)

      return c.json({ success: true, data: result })
    } catch (error) {
      return c.json({ error: 'Failed to validate message' }, 500)
    }
  })

  return app
}

// Repository implementations
function createModerationRepository(db: D1Database): ModerationRepository {
  return {
    async saveAction(action) {
      await db.prepare(`
        INSERT INTO moderation_actions (id, player_id, type, reason, applied_by, applied_at, expires_at, metadata, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        action.id,
        action.playerId,
        action.type,
        action.reason,
        action.appliedBy,
        action.appliedAt,
        action.expiresAt || null,
        JSON.stringify(action.metadata || {}),
        'ACTIVE'
      ).run()
      
      return action
    },

    async getPlayerActions(playerId) {
      const result = await db.prepare(`
        SELECT * FROM moderation_actions 
        WHERE player_id = ? 
        ORDER BY applied_at DESC
      `).bind(playerId).all()
      
      return result.results.map((row: any) => ({
        id: row.id,
        playerId: row.player_id,
        type: row.type,
        reason: row.reason,
        appliedBy: row.applied_by,
        appliedAt: row.applied_at,
        expiresAt: row.expires_at,
        metadata: JSON.parse(row.metadata || '{}'),
      }))
    },

    async getActiveActions(playerId) {
      const now = Date.now()
      const result = await db.prepare(`
        SELECT * FROM moderation_actions 
        WHERE player_id = ? 
        AND status = 'ACTIVE'
        AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY applied_at DESC
      `).bind(playerId, now).all()
      
      return result.results.map((row: any) => ({
        id: row.id,
        playerId: row.player_id,
        type: row.type,
        reason: row.reason,
        appliedBy: row.applied_by,
        appliedAt: row.applied_at,
        expiresAt: row.expires_at,
        metadata: JSON.parse(row.metadata || '{}'),
      }))
    },

    async updateActionStatus(actionId, status) {
      await db.prepare(`
        UPDATE moderation_actions 
        SET status = ? 
        WHERE id = ?
      `).bind(status, actionId).run()
    },
  }
}

function createReportRepository(db: D1Database): ReportRepository {
  return {
    async saveReport(report) {
      await db.prepare(`
        INSERT INTO message_reports (id, message_id, player_id, reported_by, reason, reported_at, status, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        report.id,
        report.messageId,
        report.playerId,
        report.reportedBy,
        report.reason,
        report.reportedAt,
        report.status,
        JSON.stringify(report.metadata || {})
      ).run()
      
      return report
    },

    async getReport(reportId) {
      const result = await db.prepare(`
        SELECT * FROM message_reports WHERE id = ?
      `).bind(reportId).first()
      
      if (!result) return null
      
      return {
        id: result.id,
        messageId: result.message_id,
        playerId: result.player_id,
        reportedBy: result.reported_by,
        reason: result.reason,
        reportedAt: result.reported_at,
        status: result.status,
        reviewedBy: result.reviewed_by,
        reviewedAt: result.reviewed_at,
        actionTaken: result.action_taken,
        notes: result.notes,
        metadata: JSON.parse(result.metadata || '{}'),
      }
    },

    async getReportsByMessage(messageId) {
      const result = await db.prepare(`
        SELECT * FROM message_reports WHERE message_id = ?
      `).bind(messageId).all()
      
      return result.results.map((row: any) => ({
        id: row.id,
        messageId: row.message_id,
        playerId: row.player_id,
        reportedBy: row.reported_by,
        reason: row.reason,
        reportedAt: row.reported_at,
        status: row.status,
        metadata: JSON.parse(row.metadata || '{}'),
      }))
    },

    async getReportsByPlayer(playerId) {
      const result = await db.prepare(`
        SELECT * FROM message_reports WHERE player_id = ?
      `).bind(playerId).all()
      
      return result.results.map((row: any) => ({
        id: row.id,
        messageId: row.message_id,
        playerId: row.player_id,
        reportedBy: row.reported_by,
        reason: row.reason,
        reportedAt: row.reported_at,
        status: row.status,
        metadata: JSON.parse(row.metadata || '{}'),
      }))
    },

    async getReportsByReporter(reporterId) {
      const result = await db.prepare(`
        SELECT * FROM message_reports WHERE reported_by = ?
      `).bind(reporterId).all()
      
      return result.results.map((row: any) => ({
        id: row.id,
        messageId: row.message_id,
        playerId: row.player_id,
        reportedBy: row.reported_by,
        reason: row.reason,
        reportedAt: row.reported_at,
        status: row.status,
        metadata: JSON.parse(row.metadata || '{}'),
      }))
    },

    async updateReportStatus(reportId, status, metadata) {
      await db.prepare(`
        UPDATE message_reports 
        SET status = ?, reviewed_by = ?, reviewed_at = ?, action_taken = ?, notes = ?
        WHERE id = ?
      `).bind(
        status,
        metadata?.reviewedBy || null,
        metadata?.reviewedAt || null,
        metadata?.actionTaken || null,
        metadata?.notes || null,
        reportId
      ).run()
    },

    async getReportsCount(reporterId, since) {
      const result = await db.prepare(`
        SELECT COUNT(*) as count 
        FROM message_reports 
        WHERE reported_by = ? AND reported_at > ?
      `).bind(reporterId, since).first()
      
      return result?.count || 0
    },
  }
}