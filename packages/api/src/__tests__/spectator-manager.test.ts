import { SpectatorManager, SpectatorInfo, SpectatorGameView } from '../spectator-manager'
import { GameState, GamePlayer, Card, Suit, Rank, GamePhase, PlayerStatus } from '@primo-poker/shared'

describe('SpectatorManager - Hole Card Hiding', () => {
  let spectatorManager: SpectatorManager
  let spectatorInfo: SpectatorInfo
  let gameState: GameState
  let players: GamePlayer[]

  beforeEach(() => {
    spectatorManager = new SpectatorManager()
    
    spectatorInfo = {
      spectatorId: 'spectator-1',
      username: 'TestSpectator',
      joinedAt: Date.now(),
      isEducationalMode: false,
      preferredView: 'standard'
    }

    gameState = {
      tableId: 'table-1',
      gameId: 'game-1',
      phase: GamePhase.FLOP,
      pot: 150,
      sidePots: [],
      communityCards: [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING },
        { suit: Suit.CLUBS, rank: Rank.QUEEN }
      ],
      currentBet: 50,
      minRaise: 100,
      activePlayerId: 'player-1',
      dealerId: 'player-1',
      smallBlindId: 'player-2',
      bigBlindId: 'player-3',
      handNumber: 1,
      timestamp: new Date()
    }

    players = [
      {
        id: 'player-1',
        username: 'Player1',
        email: 'player1@test.com',
        chipCount: 1000,
        chips: 950,
        currentBet: 50,
        hasActed: true,
        isFolded: false,
        isAllIn: false,
        status: PlayerStatus.ACTIVE,
        cards: [
          { suit: Suit.HEARTS, rank: Rank.TEN },
          { suit: Suit.SPADES, rank: Rank.JACK }
        ]
      },
      {
        id: 'player-2',
        username: 'Player2',
        email: 'player2@test.com',
        chipCount: 1000,
        chips: 1000,
        currentBet: 0,
        hasActed: false,
        isFolded: true,
        isAllIn: false,
        status: PlayerStatus.ACTIVE,
        cards: [
          { suit: Suit.DIAMONDS, rank: Rank.TWO },
          { suit: Suit.CLUBS, rank: Rank.THREE }
        ]
      },
      {
        id: 'player-3',
        username: 'Player3',
        email: 'player3@test.com',
        chipCount: 1000,
        chips: 900,
        currentBet: 50,
        hasActed: true,
        isFolded: false,
        isAllIn: false,
        status: PlayerStatus.ACTIVE,
        cards: [
          { suit: Suit.HEARTS, rank: Rank.KING },
          { suit: Suit.DIAMONDS, rank: Rank.QUEEN }
        ]
      }
    ]
  })

  describe('hole card visibility rules', () => {
    it('should hide hole cards for active players during normal gameplay', () => {
      // Add spectator to the table
      spectatorManager.addSpectator('table-1', spectatorInfo)

      // Generate spectator view
      const spectatorView = spectatorManager.generateSpectatorView(
        'table-1',
        gameState,
        players,
        'spectator-1'
      )

      // Active players' cards should be hidden
      expect(spectatorView.visibleCards.playerHands['player-1']).toBeNull()
      expect(spectatorView.visibleCards.playerHands['player-3']).toBeNull()
      
      // Folded player's cards should be visible
      expect(spectatorView.visibleCards.playerHands['player-2']).toEqual([
        { suit: Suit.DIAMONDS, rank: Rank.TWO },
        { suit: Suit.CLUBS, rank: Rank.THREE }
      ])
    })

    it('should show all hole cards during showdown phase', () => {
      // Change game phase to showdown
      gameState.phase = GamePhase.SHOWDOWN

      // Add spectator to the table
      spectatorManager.addSpectator('table-1', spectatorInfo)

      // Generate spectator view
      const spectatorView = spectatorManager.generateSpectatorView(
        'table-1',
        gameState,
        players,
        'spectator-1'
      )

      // All players' cards should be visible during showdown
      expect(spectatorView.visibleCards.playerHands['player-1']).toEqual([
        { suit: Suit.HEARTS, rank: Rank.TEN },
        { suit: Suit.SPADES, rank: Rank.JACK }
      ])
      expect(spectatorView.visibleCards.playerHands['player-2']).toEqual([
        { suit: Suit.DIAMONDS, rank: Rank.TWO },
        { suit: Suit.CLUBS, rank: Rank.THREE }
      ])
      expect(spectatorView.visibleCards.playerHands['player-3']).toEqual([
        { suit: Suit.HEARTS, rank: Rank.KING },
        { suit: Suit.DIAMONDS, rank: Rank.QUEEN }
      ])
    })

    it('should hide cards for players without cards', () => {
      // Remove cards from a player
      players[0].cards = undefined

      // Add spectator to the table
      spectatorManager.addSpectator('table-1', spectatorInfo)

      // Generate spectator view
      const spectatorView = spectatorManager.generateSpectatorView(
        'table-1',
        gameState,
        players,
        'spectator-1'
      )

      // Player without cards should have null
      expect(spectatorView.visibleCards.playerHands['player-1']).toBeNull()
    })

    it('should show community cards at all times', () => {
      // Add spectator to the table
      spectatorManager.addSpectator('table-1', spectatorInfo)

      // Generate spectator view
      const spectatorView = spectatorManager.generateSpectatorView(
        'table-1',
        gameState,
        players,
        'spectator-1'
      )

      // Community cards should always be visible
      expect(spectatorView.visibleCards.communityCards).toEqual([
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING },
        { suit: Suit.CLUBS, rank: Rank.QUEEN }
      ])
    })

    it('should handle empty community cards', () => {
      // Set community cards to empty
      gameState.communityCards = []

      // Add spectator to the table
      spectatorManager.addSpectator('table-1', spectatorInfo)

      // Generate spectator view
      const spectatorView = spectatorManager.generateSpectatorView(
        'table-1',
        gameState,
        players,
        'spectator-1'
      )

      // Community cards should be empty array
      expect(spectatorView.visibleCards.communityCards).toEqual([])
    })
  })

  describe('different game phases', () => {
    it('should hide cards during PRE_FLOP', () => {
      gameState.phase = GamePhase.PRE_FLOP
      gameState.communityCards = []

      spectatorManager.addSpectator('table-1', spectatorInfo)
      const spectatorView = spectatorManager.generateSpectatorView(
        'table-1',
        gameState,
        players,
        'spectator-1'
      )

      // Only folded player's cards visible
      expect(spectatorView.visibleCards.playerHands['player-1']).toBeNull()
      expect(spectatorView.visibleCards.playerHands['player-2']).toBeTruthy()
      expect(spectatorView.visibleCards.playerHands['player-3']).toBeNull()
    })

    it('should hide active players cards during TURN', () => {
      gameState.phase = GamePhase.TURN
      gameState.communityCards.push({ suit: Suit.SPADES, rank: Rank.FIVE })

      spectatorManager.addSpectator('table-1', spectatorInfo)
      const spectatorView = spectatorManager.generateSpectatorView(
        'table-1',
        gameState,
        players,
        'spectator-1'
      )

      // Active players' cards hidden
      expect(spectatorView.visibleCards.playerHands['player-1']).toBeNull()
      expect(spectatorView.visibleCards.playerHands['player-3']).toBeNull()
    })

    it('should hide active players cards during RIVER', () => {
      gameState.phase = GamePhase.RIVER
      gameState.communityCards.push(
        { suit: Suit.SPADES, rank: Rank.FIVE },
        { suit: Suit.HEARTS, rank: Rank.SEVEN }
      )

      spectatorManager.addSpectator('table-1', spectatorInfo)
      const spectatorView = spectatorManager.generateSpectatorView(
        'table-1',
        gameState,
        players,
        'spectator-1'
      )

      // Active players' cards still hidden until showdown
      expect(spectatorView.visibleCards.playerHands['player-1']).toBeNull()
      expect(spectatorView.visibleCards.playerHands['player-3']).toBeNull()
    })
  })
})

describe('SpectatorManager - State Broadcasting', () => {
  let spectatorManager: SpectatorManager
  let spectatorInfo: SpectatorInfo
  let gameState: GameState
  let players: GamePlayer[]

  beforeEach(() => {
    spectatorManager = new SpectatorManager()
    
    spectatorInfo = {
      spectatorId: 'spectator-1',
      username: 'TestSpectator',
      joinedAt: Date.now(),
      isEducationalMode: false,
      preferredView: 'standard'
    }

    gameState = {
      tableId: 'table-1',
      gameId: 'game-1',
      phase: GamePhase.FLOP,
      pot: 150,
      sidePots: [],
      communityCards: [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING },
        { suit: Suit.CLUBS, rank: Rank.QUEEN }
      ],
      currentBet: 50,
      minRaise: 100,
      activePlayerId: 'player-1',
      dealerId: 'player-1',
      smallBlindId: 'player-2',
      bigBlindId: 'player-3',
      handNumber: 1,
      timestamp: new Date()
    }

    players = [
      {
        id: 'player-1',
        username: 'Player1',
        email: 'player1@test.com',
        chipCount: 1000,
        chips: 950,
        currentBet: 50,
        hasActed: true,
        isFolded: false,
        isAllIn: false,
        status: PlayerStatus.ACTIVE,
        cards: [
          { suit: Suit.HEARTS, rank: Rank.TEN },
          { suit: Suit.SPADES, rank: Rank.JACK }
        ]
      }
    ]
  })

  describe('delayed update broadcasting', () => {
    it('should queue game state updates for spectators', () => {
      spectatorManager.addSpectator('table-1', spectatorInfo)
      
      const update = {
        gameState,
        players,
        timestamp: Date.now()
      }

      const queued = spectatorManager.queueSpectatorUpdate('table-1', update)
      
      expect(queued).toBe(true)
      expect(spectatorManager.getPendingUpdatesCount('table-1')).toBe(1)
    })

    it('should broadcast updates with 500ms delay', (done) => {
      spectatorManager.addSpectator('table-1', spectatorInfo)
      
      const startTime = Date.now()
      const update = {
        gameState,
        players,
        timestamp: startTime
      }

      let broadcastReceived = false

      // Mock broadcast callback
      spectatorManager.onBroadcast = (tableId, spectatorUpdate) => {
        const elapsed = Date.now() - startTime
        expect(elapsed).toBeGreaterThanOrEqual(500)
        expect(elapsed).toBeLessThan(600) // Allow some tolerance
        expect(spectatorUpdate.gameState).toEqual(gameState)
        broadcastReceived = true
        done()
      }

      spectatorManager.queueSpectatorUpdate('table-1', update)
      
      // Verify update is not broadcast immediately
      setTimeout(() => {
        expect(broadcastReceived).toBe(false)
      }, 400)
    })

    it('should batch multiple updates within delay window', (done) => {
      spectatorManager.addSpectator('table-1', spectatorInfo)
      
      const update1 = {
        gameState: { ...gameState, pot: 200 },
        players,
        timestamp: Date.now()
      }

      const update2 = {
        gameState: { ...gameState, pot: 300 },
        players,
        timestamp: Date.now() + 100
      }

      let broadcastCount = 0

      spectatorManager.onBroadcast = (tableId, spectatorUpdate) => {
        broadcastCount++
        // Should only broadcast once with the latest update
        expect(broadcastCount).toBe(1)
        expect(spectatorUpdate.gameState.pot).toBe(300)
        done()
      }

      spectatorManager.queueSpectatorUpdate('table-1', update1)
      
      setTimeout(() => {
        spectatorManager.queueSpectatorUpdate('table-1', update2)
      }, 100)
    })

    it('should handle spectator-specific view generation', () => {
      const educationalSpectator: SpectatorInfo = {
        ...spectatorInfo,
        isEducationalMode: true,
        preferredView: 'educational'
      }

      spectatorManager.addSpectator('table-1', educationalSpectator)

      const view = spectatorManager.generateSpectatorView(
        'table-1',
        gameState,
        players,
        educationalSpectator.spectatorId
      )

      // Educational mode should include additional features
      expect(view.potOdds).toBeDefined()
      expect(view.handStrengths).toBeDefined()
      expect(view.suggestedAction).toBeDefined()
    })

    it('should not broadcast to empty spectator list', () => {
      // Don't add any spectators
      const update = {
        gameState,
        players,
        timestamp: Date.now()
      }

      const queued = spectatorManager.queueSpectatorUpdate('table-1', update)
      
      expect(queued).toBe(false)
      expect(spectatorManager.getPendingUpdatesCount('table-1')).toBe(0)
    })
  })

  describe('spectator count limits', () => {
    it('should enforce 50 spectator limit per table', () => {
      // Add 50 spectators
      for (let i = 0; i < 50; i++) {
        const spectator: SpectatorInfo = {
          spectatorId: `spectator-${i}`,
          username: `Spectator${i}`,
          joinedAt: Date.now(),
          isEducationalMode: false,
          preferredView: 'standard'
        }
        const added = spectatorManager.addSpectator('table-1', spectator)
        expect(added).toBe(true)
      }

      expect(spectatorManager.getSpectatorCount('table-1')).toBe(50)

      // Try to add 51st spectator
      const extraSpectator: SpectatorInfo = {
        spectatorId: 'spectator-51',
        username: 'ExtraSpectator',
        joinedAt: Date.now(),
        isEducationalMode: false,
        preferredView: 'standard'
      }

      const added = spectatorManager.addSpectator('table-1', extraSpectator)
      expect(added).toBe(false)
      expect(spectatorManager.getSpectatorCount('table-1')).toBe(50)
    })

    it('should allow spectator to rejoin after leaving', () => {
      // Fill up to limit
      for (let i = 0; i < 50; i++) {
        spectatorManager.addSpectator('table-1', {
          spectatorId: `spectator-${i}`,
          username: `Spectator${i}`,
          joinedAt: Date.now(),
          isEducationalMode: false,
          preferredView: 'standard'
        })
      }

      // Remove one spectator
      spectatorManager.removeSpectator('table-1', 'spectator-0')
      expect(spectatorManager.getSpectatorCount('table-1')).toBe(49)

      // Now can add new spectator
      const newSpectator: SpectatorInfo = {
        spectatorId: 'new-spectator',
        username: 'NewSpectator',
        joinedAt: Date.now(),
        isEducationalMode: false,
        preferredView: 'standard'
      }

      const added = spectatorManager.addSpectator('table-1', newSpectator)
      expect(added).toBe(true)
      expect(spectatorManager.getSpectatorCount('table-1')).toBe(50)
    })
  })
})