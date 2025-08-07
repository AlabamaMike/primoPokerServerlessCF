/**
 * Wallet Security Module
 * 
 * Provides security features for wallet operations including:
 * - HMAC transaction signing
 * - Rate limiting
 * - Fraud detection
 * - Audit logging
 */

import crypto from 'crypto'
import { logger } from '@primo-poker/core'

export interface SecurityConfig {
  hmacSecret: string
  signatureExpiryMs: number // Default 5 minutes
  rateLimitConfig: RateLimitConfig
  fraudDetectionConfig: FraudDetectionConfig
  transactionApprovalConfig: TransactionApprovalConfig
}

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  maxDepositsPerWindow: number
  maxWithdrawalsPerWindow: number
  maxTransfersPerWindow: number
}

export interface FraudDetectionConfig {
  unusualAmountThreshold: number
  rapidTransactionCount: number
  rapidTransactionWindowMs: number
  suspiciousPatterns: {
    multipleFailedAttempts: number
    unusualGeoLocationChange: boolean
    nightTimeThreshold: { start: number; end: number }
  }
}

export interface TransactionApprovalConfig {
  largeAmountThreshold: number
  requiresApproval: boolean
  approvalTimeoutMs: number
}

export interface SecurityContext {
  playerId: string
  ipAddress?: string
  country?: string
  userAgent?: string
  timestamp: number
}

export interface AuditLogEntry {
  id: string
  timestamp: number
  playerId?: string
  action: string
  amount?: number
  success: boolean
  error?: string
  ipAddress?: string
  country?: string
  userAgent?: string
  metadata?: Record<string, any>
}

export interface PendingApproval {
  approvalId: string
  playerId: string
  type: string
  amount: number
  description: string
  createdAt: number
  expiresAt: number
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  adminId?: string
  reason?: string
}

export class WalletSecurityManager {
  private nonceStore: Map<string, number> = new Map()
  private rateLimitStore: Map<string, RateLimitEntry[]> = new Map()
  private failedAttempts: Map<string, number> = new Map()
  private lastLocationStore: Map<string, LocationEntry> = new Map()
  private auditLogs: AuditLogEntry[] = []
  private securityLogs: SecurityLogEntry[] = []
  private pendingApprovals: Map<string, PendingApproval> = new Map()
  private transactionHistory: Map<string, TransactionHistoryEntry[]> = new Map()

  constructor(private config: SecurityConfig) {}

  /**
   * Verify HMAC signature for a request
   */
  async verifySignature(request: Request): Promise<{ valid: boolean; error?: string }> {
    const signature = request.headers.get('X-Wallet-Signature')
    const timestamp = request.headers.get('X-Wallet-Timestamp')
    const nonce = request.headers.get('X-Wallet-Nonce')

    // Check if signature headers are present
    if (!signature || !timestamp || !nonce) {
      return { valid: false, error: 'HMAC signature required for this operation' }
    }

    // Check timestamp validity (prevent replay attacks)
    const requestTime = parseInt(timestamp)
    const currentTime = Date.now()
    
    if (isNaN(requestTime)) {
      return { valid: false, error: 'Invalid timestamp format' }
    }

    if (currentTime - requestTime > this.config.signatureExpiryMs) {
      return { valid: false, error: 'Request signature has expired' }
    }

    if (requestTime > currentTime + 60000) { // 1 minute future tolerance
      return { valid: false, error: 'Request timestamp is in the future' }
    }

    // Check nonce uniqueness
    if (this.nonceStore.has(nonce)) {
      return { valid: false, error: 'Nonce already used' }
    }

    // Verify HMAC signature
    try {
      const body = await request.clone().text()
      const expectedSignature = crypto
        .createHmac('sha256', this.config.hmacSecret)
        .update(body)
        .digest('hex')

      if (signature !== expectedSignature) {
        return { valid: false, error: 'Invalid signature' }
      }

      // Store nonce to prevent reuse
      this.nonceStore.set(nonce, currentTime)
      
      // Clean up old nonces periodically
      this.cleanupOldNonces()

      return { valid: true }
    } catch (error) {
      logger.error('Error verifying signature:', error as Error)
      return { valid: false, error: 'Failed to verify signature' }
    }
  }

  /**
   * Check if an endpoint requires signature
   */
  requiresSignature(pathname: string, method: string): boolean {
    const protectedEndpoints = [
      '/wallet/withdraw',
      '/wallet/deposit',
      '/wallet/transfer',
      '/wallet/buy-in',
      '/wallet/cash-out'
    ]

    return method === 'POST' && protectedEndpoints.includes(pathname)
  }

  /**
   * Check rate limits for a player/endpoint combination
   */
  checkRateLimit(playerId: string, endpoint: string): { allowed: boolean; retryAfter?: number } {
    const key = `${playerId}:${endpoint}`
    const now = Date.now()
    
    // Get or create rate limit entries
    let entries = this.rateLimitStore.get(key) || []
    
    // Remove expired entries
    entries = entries.filter(e => now - e.timestamp < this.config.rateLimitConfig.windowMs)
    
    // Check endpoint-specific limits
    const endpointLimits: Record<string, number> = {
      '/wallet/deposit': this.config.rateLimitConfig.maxDepositsPerWindow,
      '/wallet/withdraw': this.config.rateLimitConfig.maxWithdrawalsPerWindow,
      '/wallet/transfer': this.config.rateLimitConfig.maxTransfersPerWindow
    }

    const limit = endpointLimits[endpoint] || this.config.rateLimitConfig.maxRequests

    if (entries.length >= limit) {
      const oldestEntry = entries[0]
      const retryAfter = Math.ceil((oldestEntry.timestamp + this.config.rateLimitConfig.windowMs - now) / 1000)
      return { allowed: false, retryAfter }
    }

    // Add new entry
    entries.push({ timestamp: now })
    this.rateLimitStore.set(key, entries)

    return { allowed: true }
  }

  /**
   * Detect fraudulent activity
   */
  async detectFraud(
    playerId: string,
    transactionType: string,
    amount: number,
    context: SecurityContext
  ): Promise<{ suspicious: boolean; reasons: string[] }> {
    const reasons: string[] = []

    // Check unusual amount
    if (amount > this.config.fraudDetectionConfig.unusualAmountThreshold) {
      reasons.push('unusual amount')
    }

    // Check rapid transactions
    const recentTransactions = this.getRecentTransactions(playerId)
    if (recentTransactions.length >= this.config.fraudDetectionConfig.rapidTransactionCount) {
      reasons.push('rapid transactions')
    }

    // Check failed attempts
    const failedCount = this.failedAttempts.get(playerId) || 0
    if (failedCount >= this.config.fraudDetectionConfig.suspiciousPatterns.multipleFailedAttempts) {
      reasons.push('multiple failed attempts')
    }

    // Check geographic anomaly
    if (context.country && this.config.fraudDetectionConfig.suspiciousPatterns.unusualGeoLocationChange) {
      const lastLocation = this.lastLocationStore.get(playerId)
      if (lastLocation && lastLocation.country !== context.country) {
        const timeDiff = context.timestamp - lastLocation.timestamp
        if (timeDiff < 3600000) { // 1 hour - too fast to travel
          reasons.push('geographic anomaly')
        }
      }
    }

    // Check time-based patterns (night time transactions)
    const hour = new Date().getHours()
    const { start, end } = this.config.fraudDetectionConfig.suspiciousPatterns.nightTimeThreshold
    if (hour >= start && hour < end) {
      reasons.push('unusual time')
    }

    // Update location tracking
    if (context.country) {
      this.lastLocationStore.set(playerId, {
        country: context.country,
        timestamp: context.timestamp
      })
    }

    return {
      suspicious: reasons.length > 0,
      reasons
    }
  }

  /**
   * Create a pending approval for large transactions
   */
  createPendingApproval(
    playerId: string,
    type: string,
    amount: number,
    description: string
  ): PendingApproval {
    const approvalId = crypto.randomUUID()
    const now = Date.now()
    
    const approval: PendingApproval = {
      approvalId,
      playerId,
      type,
      amount,
      description,
      createdAt: now,
      expiresAt: now + this.config.transactionApprovalConfig.approvalTimeoutMs,
      status: 'pending'
    }

    this.pendingApprovals.set(approvalId, approval)
    
    return approval
  }

  /**
   * Process approval decision
   */
  processApproval(
    approvalId: string,
    approved: boolean,
    adminId: string,
    reason: string
  ): PendingApproval | null {
    const approval = this.pendingApprovals.get(approvalId)
    if (!approval || approval.status !== 'pending') {
      return null
    }

    approval.status = approved ? 'approved' : 'rejected'
    approval.adminId = adminId
    approval.reason = reason

    return approval
  }

  /**
   * Record audit log entry
   */
  recordAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    const logEntry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...entry
    }

    this.auditLogs.push(logEntry)

    // Keep only recent logs in memory (e.g., last 10000)
    if (this.auditLogs.length > 10000) {
      this.auditLogs = this.auditLogs.slice(-10000)
    }
  }

  /**
   * Record security event
   */
  recordSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high',
    context: SecurityContext,
    details?: any
  ): void {
    const logEntry: SecurityLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      event,
      severity,
      playerId: context.playerId,
      ipAddress: context.ipAddress,
      country: context.country,
      userAgent: context.userAgent,
      details
    }

    this.securityLogs.push(logEntry)

    // Keep only recent logs
    if (this.securityLogs.length > 5000) {
      this.securityLogs = this.securityLogs.slice(-5000)
    }
  }

  /**
   * Get audit logs with filters
   */
  getAuditLogs(filters: AuditLogFilters): { logs: AuditLogEntry[]; totalCount: number } {
    let logs = [...this.auditLogs]

    // Apply filters
    if (filters.playerId) {
      logs = logs.filter(log => log.playerId === filters.playerId)
    }

    if (filters.action) {
      logs = logs.filter(log => log.action === filters.action)
    }

    if (filters.startDate) {
      logs = logs.filter(log => log.timestamp >= filters.startDate!)
    }

    if (filters.endDate) {
      logs = logs.filter(log => log.timestamp <= filters.endDate!)
    }

    // Sort by timestamp descending
    logs.sort((a, b) => b.timestamp - a.timestamp)

    const totalCount = logs.length

    // Apply limit
    if (filters.limit) {
      logs = logs.slice(0, filters.limit)
    }

    return { logs, totalCount }
  }

  /**
   * Get security logs
   */
  getSecurityLogs(): SecurityLogEntry[] {
    return [...this.securityLogs].sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals(): PendingApproval[] {
    const now = Date.now()
    const pending: PendingApproval[] = []

    for (const [id, approval] of this.pendingApprovals) {
      if (approval.status === 'pending') {
        if (approval.expiresAt < now) {
          approval.status = 'expired'
        } else {
          pending.push(approval)
        }
      }
    }

    return pending
  }

  /**
   * Calculate risk score for a player
   */
  calculateRiskScore(playerId: string): RiskAssessment {
    const factors: string[] = []
    let score = 0

    // Failed attempts
    const failedCount = this.failedAttempts.get(playerId) || 0
    if (failedCount > 0) {
      factors.push('multiple_failed_attempts')
      score += failedCount * 10
    }

    // Recent fraud flags
    const recentTransactions = this.getRecentTransactions(playerId)
    const flaggedCount = recentTransactions.filter(t => t.flagged).length
    if (flaggedCount > 0) {
      factors.push('recent_suspicious_activity')
      score += flaggedCount * 15
    }

    // Rapid transactions
    if (recentTransactions.length > this.config.fraudDetectionConfig.rapidTransactionCount) {
      factors.push('rapid_transaction_pattern')
      score += 20
    }

    // Cap at 100
    score = Math.min(score, 100)

    return {
      playerId,
      riskScore: score,
      factors,
      recommendation: score > 70 ? 'block' : score > 50 ? 'review' : 'allow'
    }
  }

  /**
   * Record failed attempt
   */
  recordFailedAttempt(playerId: string): void {
    const current = this.failedAttempts.get(playerId) || 0
    this.failedAttempts.set(playerId, current + 1)
  }

  /**
   * Record transaction for history tracking
   */
  recordTransaction(playerId: string, amount: number, type: string, flagged: boolean = false): void {
    const history = this.transactionHistory.get(playerId) || []
    history.push({
      timestamp: Date.now(),
      amount,
      type,
      flagged
    })

    // Keep only recent transactions
    const cutoff = Date.now() - this.config.fraudDetectionConfig.rapidTransactionWindowMs
    const filtered = history.filter(t => t.timestamp > cutoff)
    
    this.transactionHistory.set(playerId, filtered)
  }

  /**
   * Get recent transactions for fraud detection
   */
  private getRecentTransactions(playerId: string): TransactionHistoryEntry[] {
    const cutoff = Date.now() - this.config.fraudDetectionConfig.rapidTransactionWindowMs
    const history = this.transactionHistory.get(playerId) || []
    return history.filter(t => t.timestamp > cutoff)
  }

  /**
   * Clean up old nonces
   */
  private cleanupOldNonces(): void {
    const cutoff = Date.now() - this.config.signatureExpiryMs
    
    for (const [nonce, timestamp] of this.nonceStore) {
      if (timestamp < cutoff) {
        this.nonceStore.delete(nonce)
      }
    }
  }

  /**
   * Check if player is temporarily blocked
   */
  isPlayerBlocked(playerId: string): boolean {
    const failedCount = this.failedAttempts.get(playerId) || 0
    return failedCount >= this.config.fraudDetectionConfig.suspiciousPatterns.multipleFailedAttempts
  }

  /**
   * Clear failed attempts for a player
   */
  clearFailedAttempts(playerId: string): void {
    this.failedAttempts.delete(playerId)
  }
}

// Type definitions
interface RateLimitEntry {
  timestamp: number
}

interface LocationEntry {
  country: string
  timestamp: number
}

interface SecurityLogEntry {
  id: string
  timestamp: number
  event: string
  severity: 'low' | 'medium' | 'high'
  playerId?: string
  ipAddress?: string
  country?: string
  userAgent?: string
  details?: any
}

interface TransactionHistoryEntry {
  timestamp: number
  amount: number
  type: string
  flagged: boolean
}

interface AuditLogFilters {
  playerId?: string
  action?: string
  startDate?: number
  endDate?: number
  limit?: number
}

interface RiskAssessment {
  playerId: string
  riskScore: number
  factors: string[]
  recommendation: 'allow' | 'review' | 'block'
}