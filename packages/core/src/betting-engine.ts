/**
 * Poker Betting Engine - Phase 3B.2.1
 * 
 * Core betting logic for Texas Hold'em poker with:
 * - Advanced bet validation
 * - All-in and side pot management
 * - Blind posting automation
 * - Betting round completion detection
 */

import { GamePlayer, GamePhase, PlayerStatus } from '@primo-poker/shared'

export interface BettingRules {
  minBet: number
  maxBet: number
  canCheck: boolean
  canCall: boolean
  canRaise: boolean
  callAmount: number
  minRaise: number
  isAllInRequired: boolean
}

export interface SidePot {
  amount: number
  eligiblePlayers: string[] // Player IDs eligible for this pot
  isMain: boolean
}

export interface BettingAction {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in'
  amount: number
  playerId: string
  timestamp: number
}

export interface ValidationResult {
  isValid: boolean
  error?: string
  correctedAmount?: number
}

export interface BettingRound {
  phase: GamePhase
  actions: BettingAction[]
  isComplete: boolean
  currentPlayer: string
  currentBet: number
}

export class BettingEngine {
  private smallBlind: number
  private bigBlind: number

  constructor(smallBlind: number = 10, bigBlind: number = 20) {
    this.smallBlind = smallBlind
    this.bigBlind = bigBlind
  }

  /**
   * Validates a player action based on current game state
   */
  validateAction(
    action: BettingAction,
    players: Map<string, GamePlayer>,
    currentBet: number,
    phase: GamePhase
  ): ValidationResult {
    const player = players.get(action.playerId)
    if (!player) {
      return { isValid: false, error: 'Player not found' }
    }

    if (player.chips <= 0 && action.type !== 'fold') {
      return { isValid: false, error: 'Player has no chips' }
    }

    const rules = this.getBettingRules(action.playerId, players, currentBet, phase)

    switch (action.type) {
      case 'fold':
        return { isValid: true }

      case 'check':
        if (!rules.canCheck) {
          return { isValid: false, error: 'Cannot check - must call or raise' }
        }
        return { isValid: true }

      case 'call':
        if (!rules.canCall) {
          return { isValid: false, error: 'Cannot call - no bet to call' }
        }
        if (action.amount !== rules.callAmount) {
          return { 
            isValid: true, 
            correctedAmount: Math.min(rules.callAmount, player.chips)
          }
        }
        return { isValid: true }

      case 'bet':
        if (currentBet > 0) {
          return { isValid: false, error: 'Cannot bet - must call or raise' }
        }
        if (action.amount < rules.minBet) {
          return { isValid: false, error: `Minimum bet is ${rules.minBet}` }
        }
        if (action.amount > player.chips) {
          return { isValid: false, error: 'Cannot bet more than available chips' }
        }
        return { isValid: true }

      case 'raise':
        if (!rules.canRaise) {
          return { isValid: false, error: 'Cannot raise - no bet to raise' }
        }
        const totalBet = action.amount + (player.currentBet || 0)
        if (totalBet < currentBet + rules.minRaise) {
          return { 
            isValid: false, 
            error: `Minimum raise is ${rules.minRaise} (total bet ${currentBet + rules.minRaise})` 
          }
        }
        if (action.amount > player.chips) {
          return { isValid: false, error: 'Cannot raise more than available chips' }
        }
        return { isValid: true }

      case 'all-in':
        if (player.chips === 0) {
          return { isValid: false, error: 'No chips to go all-in' }
        }
        return { 
          isValid: true, 
          correctedAmount: player.chips 
        }

      default:
        return { isValid: false, error: 'Invalid action type' }
    }
  }

  /**
   * Determines what actions are available for a player
   */
  getBettingRules(
    playerId: string,
    players: Map<string, GamePlayer>,
    currentBet: number,
    phase: GamePhase
  ): BettingRules {
    const player = players.get(playerId)
    if (!player) {
      throw new Error('Player not found')
    }

    const playerCurrentBet = player.currentBet || 0
    const callAmount = Math.max(0, currentBet - playerCurrentBet)
    const canCall = callAmount > 0 && callAmount <= player.chips
    const canCheck = callAmount === 0
    const canRaise = currentBet > 0 && player.chips > callAmount
    const isAllInRequired = player.chips <= callAmount

    // Minimum bet is big blind for first bet, otherwise match current bet
    const minBet = currentBet === 0 ? this.bigBlind : currentBet * 2
    const maxBet = player.chips
    const minRaise = currentBet === 0 ? this.bigBlind : this.bigBlind

    return {
      minBet,
      maxBet,
      canCheck,
      canCall,
      canRaise,
      callAmount: Math.min(callAmount, player.chips),
      minRaise,
      isAllInRequired
    }
  }

  /**
   * Processes a validated action and updates game state
   */
  processAction(
    action: BettingAction,
    players: Map<string, GamePlayer>,
    pot: number
  ): { updatedPlayers: Map<string, GamePlayer>, newPot: number } {
    const updatedPlayers = new Map(players)
    const player = updatedPlayers.get(action.playerId)!

    switch (action.type) {
      case 'fold':
        player.status = PlayerStatus.FOLDED
        player.isFolded = true
        break

      case 'check':
        player.hasActed = true
        break

      case 'call':
        const callAmount = Math.min(action.amount, player.chips)
        player.chips -= callAmount
        player.currentBet = (player.currentBet || 0) + callAmount
        player.hasActed = true
        pot += callAmount
        break

      case 'bet':
      case 'raise':
        player.chips -= action.amount
        player.currentBet = (player.currentBet || 0) + action.amount
        player.hasActed = true
        pot += action.amount
        break

      case 'all-in':
        const allInAmount = player.chips
        player.chips = 0
        player.currentBet = (player.currentBet || 0) + allInAmount
        player.hasActed = true
        player.status = PlayerStatus.ALL_IN
        player.isAllIn = true
        pot += allInAmount
        break
    }

    return { updatedPlayers, newPot: pot }
  }

  /**
   * Calculates side pots when players are all-in
   */
  calculateSidePots(players: Map<string, GamePlayer>): SidePot[] {
    const playersArray = Array.from(players.values())
    const activePlayers = playersArray.filter(p => !p.isFolded && p.currentBet > 0)

    if (activePlayers.length === 0) {
      return []
    }

    // Sort by bet amount to create side pots
    activePlayers.sort((a, b) => (a.currentBet || 0) - (b.currentBet || 0))

    const sidePots: SidePot[] = []
    let previousBet = 0

    for (let i = 0; i < activePlayers.length; i++) {
      const currentBet = activePlayers[i]?.currentBet || 0
      const betDifference = currentBet - previousBet

      if (betDifference > 0) {
        const eligiblePlayers = activePlayers
          .slice(i)
          .map(p => p.id)
          .filter(id => id !== undefined)

        const potAmount = betDifference * eligiblePlayers.length

        sidePots.push({
          amount: potAmount,
          eligiblePlayers,
          isMain: i === 0
        })

        previousBet = currentBet
      }
    }

    return sidePots
  }

  /**
   * Determines if the current betting round is complete
   */
  isBettingRoundComplete(
    players: Map<string, GamePlayer>,
    currentBet: number
  ): boolean {
    const activePlayers = Array.from(players.values()).filter(
      p => !p.isFolded && p.status !== PlayerStatus.ALL_IN
    )

    // If only one active player, round is complete
    if (activePlayers.length <= 1) {
      return true
    }

    // All active players must have acted and matched the current bet
    return activePlayers.every(player => 
      player.hasActed && 
      (player.currentBet || 0) === currentBet
    )
  }

  /**
   * Posts blinds for the current hand
   */
  postBlinds(
    players: Map<string, GamePlayer>,
    dealerPosition: number
  ): { updatedPlayers: Map<string, GamePlayer>, pot: number } {
    const playersArray = Array.from(players.values())
    const activePlayers = playersArray.filter(p => p.chips > 0)

    if (activePlayers.length < 2) {
      return { updatedPlayers: players, pot: 0 }
    }

    const updatedPlayers = new Map(players)
    let pot = 0

    // Find small blind and big blind positions
    const smallBlindPlayer = this.getPlayerAtPosition(updatedPlayers, dealerPosition + 1)
    const bigBlindPlayer = this.getPlayerAtPosition(updatedPlayers, dealerPosition + 2)

    // Post small blind
    if (smallBlindPlayer) {
      const sbAmount = Math.min(this.smallBlind, smallBlindPlayer.chips)
      smallBlindPlayer.chips -= sbAmount
      smallBlindPlayer.currentBet = sbAmount
      pot += sbAmount
    }

    // Post big blind
    if (bigBlindPlayer) {
      const bbAmount = Math.min(this.bigBlind, bigBlindPlayer.chips)
      bigBlindPlayer.chips -= bbAmount
      bigBlindPlayer.currentBet = bbAmount
      pot += bbAmount
    }

    return { updatedPlayers, pot }
  }

  private getPlayerAtPosition(players: Map<string, GamePlayer>, position: number): GamePlayer | null {
    const playersArray = Array.from(players.values())
    const activePlayers = playersArray.filter(p => p.chips > 0)
    
    if (activePlayers.length === 0) return null
    
    const adjustedPosition = position % activePlayers.length
    return activePlayers[adjustedPosition] || null
  }

  /**
   * Resets betting state for new round
   */
  resetForNewRound(players: Map<string, GamePlayer>): Map<string, GamePlayer> {
    const updatedPlayers = new Map(players)
    
    updatedPlayers.forEach(player => {
      player.hasActed = false
      player.currentBet = 0
    })

    return updatedPlayers
  }
}
