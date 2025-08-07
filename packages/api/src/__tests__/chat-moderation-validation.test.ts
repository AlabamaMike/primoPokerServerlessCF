import { ContentValidator, ValidationResult } from '../chat-moderation/content-validator'
import { ProfanityFilter } from '@primo-poker/shared'

describe('ContentValidator', () => {
  let validator: ContentValidator
  let mockProfanityFilter: jest.Mocked<ProfanityFilter>

  beforeEach(() => {
    mockProfanityFilter = {
      containsProfanity: jest.fn(),
      filterMessage: jest.fn(),
      getSeverity: jest.fn(),
    } as any
    
    validator = new ContentValidator({
      profanityFilter: mockProfanityFilter,
      maxMessageLength: 500,
      minMessageLength: 1,
      allowedEmojis: true,
      allowedLinks: false,
      spamThreshold: 5,
      capsThreshold: 0.7,
    })
  })

  describe('validateMessage', () => {
    it('should pass clean messages', async () => {
      mockProfanityFilter.containsProfanity.mockReturnValue(false)
      mockProfanityFilter.getSeverity.mockReturnValue('NONE')
      
      const result = await validator.validateMessage('Hello everyone!')
      
      expect(result.isValid).toBe(true)
      expect(result.filteredMessage).toBe('Hello everyone!')
      expect(result.violations).toEqual([])
    })

    it('should reject messages with profanity', async () => {
      mockProfanityFilter.containsProfanity.mockReturnValue(true)
      mockProfanityFilter.getSeverity.mockReturnValue('HIGH')
      mockProfanityFilter.filterMessage.mockReturnValue('**** you')
      
      const result = await validator.validateMessage('fuck you')
      
      expect(result.isValid).toBe(false)
      expect(result.filteredMessage).toBe('**** you')
      expect(result.violations).toContain('PROFANITY')
      expect(result.severity).toBe('HIGH')
    })

    it('should reject messages that are too long', async () => {
      mockProfanityFilter.containsProfanity.mockReturnValue(false)
      const longMessage = 'a'.repeat(501)
      
      const result = await validator.validateMessage(longMessage)
      
      expect(result.isValid).toBe(false)
      expect(result.violations).toContain('MESSAGE_TOO_LONG')
    })

    it('should reject empty messages', async () => {
      const result = await validator.validateMessage('')
      
      expect(result.isValid).toBe(false)
      expect(result.violations).toContain('MESSAGE_EMPTY')
    })

    it('should detect and reject spam patterns', async () => {
      mockProfanityFilter.containsProfanity.mockReturnValue(false)
      
      const result = await validator.validateMessage('aaaaaaaaaa')
      
      expect(result.isValid).toBe(false)
      expect(result.violations).toContain('SPAM_DETECTED')
    })

    it('should detect excessive caps', async () => {
      mockProfanityFilter.containsProfanity.mockReturnValue(false)
      
      const result = await validator.validateMessage('HELLO EVERYONE THIS IS LOUD')
      
      expect(result.isValid).toBe(false)
      expect(result.violations).toContain('EXCESSIVE_CAPS')
      expect(result.filteredMessage).toBe('Hello everyone this is loud')
    })

    it('should reject messages with links when not allowed', async () => {
      mockProfanityFilter.containsProfanity.mockReturnValue(false)
      
      const result = await validator.validateMessage('Check out https://example.com')
      
      expect(result.isValid).toBe(false)
      expect(result.violations).toContain('LINKS_NOT_ALLOWED')
    })

    it('should allow messages with links when configured', async () => {
      validator = new ContentValidator({
        profanityFilter: mockProfanityFilter,
        maxMessageLength: 500,
        minMessageLength: 1,
        allowedEmojis: true,
        allowedLinks: true,
        spamThreshold: 5,
        capsThreshold: 0.7,
      })
      
      mockProfanityFilter.containsProfanity.mockReturnValue(false)
      
      const result = await validator.validateMessage('Check out https://example.com')
      
      expect(result.isValid).toBe(true)
      expect(result.violations).toEqual([])
    })

    it('should handle multiple violations', async () => {
      mockProfanityFilter.containsProfanity.mockReturnValue(true)
      mockProfanityFilter.getSeverity.mockReturnValue('MEDIUM')
      mockProfanityFilter.filterMessage.mockReturnValue('**** THIS WEBSITE')
      
      const result = await validator.validateMessage('SHIT THIS WEBSITE https://spam.com')
      
      expect(result.isValid).toBe(false)
      expect(result.violations).toContain('PROFANITY')
      expect(result.violations).toContain('EXCESSIVE_CAPS')
      expect(result.violations).toContain('LINKS_NOT_ALLOWED')
    })

    it('should strip excessive emojis when disabled', async () => {
      validator = new ContentValidator({
        profanityFilter: mockProfanityFilter,
        maxMessageLength: 500,
        minMessageLength: 1,
        allowedEmojis: false,
        allowedLinks: false,
        spamThreshold: 5,
        capsThreshold: 0.7,
      })
      
      mockProfanityFilter.containsProfanity.mockReturnValue(false)
      
      const result = await validator.validateMessage('Hello 😀😀😀😀😀')
      
      expect(result.isValid).toBe(true)
      expect(result.filteredMessage).toBe('Hello ')
      expect(result.violations).toEqual([])
    })
  })

  describe('isSpam', () => {
    it('should detect repeated characters', () => {
      expect(validator.isSpam('aaaaaaaaaa')).toBe(true)
      expect(validator.isSpam('normal message')).toBe(false)
    })

    it('should detect repeated words', () => {
      expect(validator.isSpam('spam spam spam spam spam')).toBe(true)
      expect(validator.isSpam('This is not spam')).toBe(false)
    })

    it('should detect gibberish', () => {
      expect(validator.isSpam('asdfghjkl qwerty')).toBe(true)
      expect(validator.isSpam('Hello world')).toBe(false)
    })
  })

  describe('calculateCapsPercentage', () => {
    it('should calculate caps percentage correctly', () => {
      expect(validator.calculateCapsPercentage('HELLO')).toBe(1.0)
      expect(validator.calculateCapsPercentage('Hello')).toBe(0.2)
      expect(validator.calculateCapsPercentage('hello')).toBe(0.0)
      expect(validator.calculateCapsPercentage('HELLO WORLD')).toBe(1.0)
    })

    it('should handle empty strings', () => {
      expect(validator.calculateCapsPercentage('')).toBe(0)
    })

    it('should ignore non-letter characters', () => {
      expect(validator.calculateCapsPercentage('123')).toBe(0)
      expect(validator.calculateCapsPercentage('!!!')).toBe(0)
    })
  })

  describe('normalizeCaps', () => {
    it('should convert excessive caps to sentence case', () => {
      expect(validator.normalizeCaps('HELLO WORLD')).toBe('Hello world')
      expect(validator.normalizeCaps('THIS IS LOUD')).toBe('This is loud')
    })

    it('should preserve proper capitalization', () => {
      expect(validator.normalizeCaps('Hello World')).toBe('Hello World')
      expect(validator.normalizeCaps('I am OK')).toBe('I am OK')
    })
  })

  describe('hasLinks', () => {
    it('should detect various URL formats', () => {
      expect(validator.hasLinks('Visit https://example.com')).toBe(true)
      expect(validator.hasLinks('Go to http://test.org')).toBe(true)
      expect(validator.hasLinks('Check www.site.com')).toBe(true)
      expect(validator.hasLinks('No links here')).toBe(false)
    })
  })

  describe('stripEmojis', () => {
    it('should remove emoji characters', () => {
      expect(validator.stripEmojis('Hello 😀 World 🌍')).toBe('Hello  World ')
      expect(validator.stripEmojis('👍 Great job! 🎉')).toBe(' Great job! ')
    })

    it('should preserve regular text', () => {
      expect(validator.stripEmojis('Hello World')).toBe('Hello World')
    })
  })
})