import { ProfanityFilter, ProfanitySeverity } from '@primo-poker/shared'

export type ViolationType = 
  | 'PROFANITY'
  | 'MESSAGE_TOO_LONG'
  | 'MESSAGE_EMPTY'
  | 'SPAM_DETECTED'
  | 'EXCESSIVE_CAPS'
  | 'LINKS_NOT_ALLOWED'
  | 'EMOJI_NOT_ALLOWED'

export interface ValidationResult {
  isValid: boolean
  filteredMessage: string
  violations: ViolationType[]
  severity?: ProfanitySeverity
  metadata?: {
    capsPercentage?: number
    linkCount?: number
    emojiCount?: number
  }
}

export interface ContentValidatorConfig {
  profanityFilter: ProfanityFilter
  maxMessageLength: number
  minMessageLength: number
  allowedEmojis: boolean
  allowedLinks: boolean
  spamThreshold: number
  capsThreshold: number
}

export class ContentValidator {
  private config: ContentValidatorConfig
  
  constructor(config: ContentValidatorConfig) {
    this.config = config
  }

  async validateMessage(message: string): Promise<ValidationResult> {
    const violations: ViolationType[] = []
    let filteredMessage = message
    const metadata: ValidationResult['metadata'] = {}

    // Check empty message
    if (!message || message.trim().length === 0) {
      violations.push('MESSAGE_EMPTY')
      return {
        isValid: false,
        filteredMessage: '',
        violations,
      }
    }

    // Check message length
    if (message.length > this.config.maxMessageLength) {
      violations.push('MESSAGE_TOO_LONG')
    }

    // Check profanity
    let severity: ProfanitySeverity | undefined
    if (this.config.profanityFilter.containsProfanity(message)) {
      violations.push('PROFANITY')
      filteredMessage = this.config.profanityFilter.filterMessage(filteredMessage)
      severity = this.config.profanityFilter.getSeverity(message)
    }

    // Check spam patterns
    if (this.isSpam(message)) {
      violations.push('SPAM_DETECTED')
    }

    // Check excessive caps
    const capsPercentage = this.calculateCapsPercentage(filteredMessage)
    metadata.capsPercentage = capsPercentage
    if (capsPercentage > this.config.capsThreshold) {
      violations.push('EXCESSIVE_CAPS')
      filteredMessage = this.normalizeCaps(filteredMessage)
    }

    // Check links
    if (!this.config.allowedLinks && this.hasLinks(message)) {
      violations.push('LINKS_NOT_ALLOWED')
      metadata.linkCount = this.countLinks(message)
    }

    // Check emojis
    if (!this.config.allowedEmojis) {
      const emojiCount = this.countEmojis(message)
      if (emojiCount > 0) {
        metadata.emojiCount = emojiCount
        filteredMessage = this.stripEmojis(filteredMessage)
      }
    }

    return {
      isValid: violations.length === 0,
      filteredMessage,
      violations,
      severity,
      metadata,
    }
  }

  isSpam(message: string): boolean {
    // Check for repeated characters
    const repeatedChars = /(.)\1{4,}/
    if (repeatedChars.test(message)) {
      return true
    }

    // Check for repeated words
    const words = message.toLowerCase().split(/\s+/)
    const wordCounts = new Map<string, number>()
    
    for (const word of words) {
      if (word.length > 2) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1)
      }
    }

    // If any word appears more than threshold times, it's spam
    for (const count of wordCounts.values()) {
      if (count >= this.config.spamThreshold) {
        return true
      }
    }

    // Check for keyboard mashing / gibberish
    const gibberishPatterns = [
      /[asdfghjkl]{8,}/i,
      /[qwertyuiop]{8,}/i,
      /[zxcvbnm]{8,}/i,
      /([a-z])\1{3,}([a-z])\2{3,}/i,
    ]

    for (const pattern of gibberishPatterns) {
      if (pattern.test(message)) {
        return true
      }
    }

    return false
  }

  calculateCapsPercentage(message: string): number {
    const letters = message.match(/[a-zA-Z]/g) || []
    if (letters.length === 0) return 0
    
    const uppercaseCount = letters.filter(char => char === char.toUpperCase()).length
    return uppercaseCount / letters.length
  }

  normalizeCaps(message: string): string {
    const capsPercentage = this.calculateCapsPercentage(message)
    if (capsPercentage > this.config.capsThreshold) {
      // Convert to sentence case if too many caps
      return message.charAt(0).toUpperCase() + message.slice(1).toLowerCase()
    }
    // Preserve original capitalization if not excessive
    return message
  }

  hasLinks(message: string): boolean {
    const urlPattern = /https?:\/\/|www\./i
    return urlPattern.test(message)
  }

  countLinks(message: string): number {
    const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
    const matches = message.match(urlPattern)
    return matches ? matches.length : 0
  }

  countEmojis(message: string): number {
    const emojiPattern = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu
    const matches = message.match(emojiPattern)
    return matches ? matches.length : 0
  }

  stripEmojis(message: string): string {
    const emojiPattern = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu
    return message.replace(emojiPattern, '')
  }
}