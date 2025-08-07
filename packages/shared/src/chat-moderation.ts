export type ProfanitySeverity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'

interface ProfanityWord {
  word: string
  pattern: RegExp
  severity: ProfanitySeverity
}

export class ProfanityFilter {
  private bannedWords: Map<string, ProfanityWord> = new Map()
  private customPatterns: RegExp[] = []
  
  constructor() {
    this.initializeDefaultWords()
  }

  private initializeDefaultWords(): void {
    // High severity words
    const highSeverity = ['fuck', 'fucking', 'fucker', 'fucked', 'fucks', 'motherfucker']
    highSeverity.forEach(word => {
      this.addWord(word, 'HIGH')
    })

    // Medium severity words  
    const mediumSeverity = ['shit', 'shits', 'shitty', 'bullshit', 'damn', 'damned', 'bitch', 'bitches', 'ass', 'asshole']
    mediumSeverity.forEach(word => {
      this.addWord(word, 'MEDIUM')
    })

    // Low severity words
    const lowSeverity = ['hell', 'sucks', 'suck', 'crap', 'piss', 'pissed']
    lowSeverity.forEach(word => {
      this.addWord(word, 'LOW')
    })
  }

  private addWord(word: string, severity: ProfanitySeverity): void {
    // Create pattern with common leetspeak variations
    const leetVariations = word
      .replace(/a/g, '[a4@]')
      .replace(/e/g, '[e3]')
      .replace(/i/g, '[i1!]')
      .replace(/o/g, '[o0]')
      .replace(/s/g, '[s5$]')
      .replace(/t/g, '[t7]')
      .replace(/l/g, '[l1]')
      .replace(/g/g, '[g9]')
    
    const pattern = new RegExp(`\\b${leetVariations}\\b`, 'gi')
    
    this.bannedWords.set(word, {
      word,
      pattern,
      severity
    })
  }

  containsProfanity(message: string): boolean {
    if (!message || typeof message !== 'string') {
      return false
    }

    // Check default banned words
    for (const [, wordInfo] of this.bannedWords) {
      if (wordInfo.pattern.test(message)) {
        return true
      }
    }

    // Check custom patterns
    for (const pattern of this.customPatterns) {
      if (pattern.test(message)) {
        return true
      }
    }

    return false
  }

  filterMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      return ''
    }

    let filtered = message

    // Filter banned words
    for (const [, wordInfo] of this.bannedWords) {
      filtered = filtered.replace(wordInfo.pattern, (match) => {
        return '*'.repeat(match.length)
      })
    }

    // Filter custom patterns  
    for (const pattern of this.customPatterns) {
      filtered = filtered.replace(pattern, (match) => {
        return '*'.repeat(match.length)
      })
    }

    return filtered
  }

  getSeverity(message: string): ProfanitySeverity {
    if (!message || typeof message !== 'string') {
      return 'NONE'
    }

    let highestSeverity: ProfanitySeverity = 'NONE'
    const severityOrder: ProfanitySeverity[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH']

    // Check banned words
    for (const [, wordInfo] of this.bannedWords) {
      if (wordInfo.pattern.test(message)) {
        const currentIndex = severityOrder.indexOf(wordInfo.severity)
        const highestIndex = severityOrder.indexOf(highestSeverity)
        
        if (currentIndex > highestIndex) {
          highestSeverity = wordInfo.severity
        }
      }
    }

    return highestSeverity
  }

  addBannedWord(word: string, severity: ProfanitySeverity = 'MEDIUM'): void {
    this.addWord(word, severity)
  }

  removeBannedWord(word: string): void {
    this.bannedWords.delete(word)
  }

  addBannedPattern(pattern: RegExp): void {
    this.customPatterns.push(pattern)
  }

  clearCustomPatterns(): void {
    this.customPatterns = []
  }

  getBannedWords(): string[] {
    return Array.from(this.bannedWords.keys())
  }
}