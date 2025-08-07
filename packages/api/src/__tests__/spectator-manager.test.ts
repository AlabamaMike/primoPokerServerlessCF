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