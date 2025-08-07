import { ProfanityFilter } from '../chat-moderation'

describe('ProfanityFilter', () => {
  describe('containsProfanity', () => {
    it('should detect explicit profanity', () => {
      const filter = new ProfanityFilter()
      expect(filter.containsProfanity('This is a damn test')).toBe(true)
      expect(filter.containsProfanity('What the hell')).toBe(true)
      expect(filter.containsProfanity('This is shit')).toBe(true)
    })

    it('should detect profanity with different cases', () => {
      const filter = new ProfanityFilter()
      expect(filter.containsProfanity('DAMN this')).toBe(true)
      expect(filter.containsProfanity('HeLl no')).toBe(true)
      expect(filter.containsProfanity('ShIt happens')).toBe(true)
    })

    it('should detect profanity with leetspeak variations', () => {
      const filter = new ProfanityFilter()
      expect(filter.containsProfanity('sh1t happens')).toBe(true)
      expect(filter.containsProfanity('h3ll yeah')).toBe(true)
      expect(filter.containsProfanity('d4mn')).toBe(true)
    })

    it('should not flag clean messages', () => {
      const filter = new ProfanityFilter()
      expect(filter.containsProfanity('This is a clean message')).toBe(false)
      expect(filter.containsProfanity('Good game everyone!')).toBe(false)
      expect(filter.containsProfanity('Nice hand')).toBe(false)
    })

    it('should handle edge cases', () => {
      const filter = new ProfanityFilter()
      expect(filter.containsProfanity('')).toBe(false)
      expect(filter.containsProfanity('   ')).toBe(false)
    })
  })

  describe('filterMessage', () => {
    it('should replace profanity with asterisks', () => {
      const filter = new ProfanityFilter()
      expect(filter.filterMessage('This is damn good')).toBe('This is **** good')
      expect(filter.filterMessage('What the hell')).toBe('What the ****')
      expect(filter.filterMessage('shit happens')).toBe('**** happens')
    })

    it('should handle multiple profanities in one message', () => {
      const filter = new ProfanityFilter()
      expect(filter.filterMessage('damn this shit')).toBe('**** this ****')
      expect(filter.filterMessage('hell no, damn it')).toBe('**** no, **** it')
    })

    it('should preserve original case structure', () => {
      const filter = new ProfanityFilter()
      expect(filter.filterMessage('DAMN this')).toBe('**** this')
      expect(filter.filterMessage('HeLl no')).toBe('**** no')
    })

    it('should handle leetspeak filtering', () => {
      const filter = new ProfanityFilter()
      expect(filter.filterMessage('sh1t happens')).toBe('**** happens')
      expect(filter.filterMessage('h3ll yeah')).toBe('**** yeah')
    })

    it('should not modify clean messages', () => {
      const filter = new ProfanityFilter()
      expect(filter.filterMessage('This is clean')).toBe('This is clean')
      expect(filter.filterMessage('Good game!')).toBe('Good game!')
    })

    it('should handle edge cases', () => {
      const filter = new ProfanityFilter()
      expect(filter.filterMessage('')).toBe('')
      expect(filter.filterMessage('   ')).toBe('   ')
    })
  })

  describe('getSeverity', () => {
    it('should return HIGH for severe profanity', () => {
      const filter = new ProfanityFilter()
      expect(filter.getSeverity('fuck this')).toBe('HIGH')
      expect(filter.getSeverity('You fucking idiot')).toBe('HIGH')
    })

    it('should return MEDIUM for moderate profanity', () => {
      const filter = new ProfanityFilter()
      expect(filter.getSeverity('This is shit')).toBe('MEDIUM')
      expect(filter.getSeverity('damn it')).toBe('MEDIUM')
    })

    it('should return LOW for mild profanity', () => {
      const filter = new ProfanityFilter()
      expect(filter.getSeverity('What the hell')).toBe('LOW')
      expect(filter.getSeverity('This sucks')).toBe('LOW')
    })

    it('should return NONE for clean messages', () => {
      const filter = new ProfanityFilter()
      expect(filter.getSeverity('Good game')).toBe('NONE')
      expect(filter.getSeverity('Nice hand')).toBe('NONE')
    })
  })

  describe('custom word lists', () => {
    it('should allow adding custom banned words', () => {
      const filter = new ProfanityFilter()
      filter.addBannedWord('poker')
      expect(filter.containsProfanity('I love poker')).toBe(true)
      expect(filter.filterMessage('I love poker')).toBe('I love *****')
    })

    it('should allow removing banned words', () => {
      const filter = new ProfanityFilter()
      filter.removeBannedWord('damn')
      expect(filter.containsProfanity('damn it')).toBe(false)
      expect(filter.filterMessage('damn it')).toBe('damn it')
    })

    it('should support custom word patterns', () => {
      const filter = new ProfanityFilter()
      filter.addBannedPattern(/test\d+/gi)
      expect(filter.containsProfanity('test123')).toBe(true)
      expect(filter.filterMessage('test123 message')).toBe('******* message')
    })
  })
})