import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { Card, Suit, Rank } from '@primo-poker/shared'
import { pokerGameClient, PokerMessage } from '@/lib/poker-websocket'
import { evaluateHand, compareHands, parseCard, type HandResult } from '@/lib/hand-evaluator'

export interface Player {
  id: string
  name: string // Changed from username to name for consistency
  username: string
  avatar?: string
  chips: number // Changed from chipCount to chips for consistency
  chipCount: number // Keep both for backward compatibility
  holeCards?: Card[]
  position: number
  isDealer: boolean
  isSmallBlind: boolean
  isBigBlind: boolean
  currentBet: number
  hasActed: boolean
  isFolded: boolean
  isAllIn: boolean
  isActive: boolean
  lastAction?: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in'
  timeRemaining?: number
  handResult?: HandResult
  isWinner?: boolean
  winnings?: number
}

export interface HandHistoryEntry {
  id: string
  handNumber: number
  timestamp: Date
  pot: number
  winner: {
    name: string
    handResult: HandResult
    winnings: number
  }
  communityCards: Card[]
  playerCount: number
  keyActions: string[]
}

export interface GameState {
  // Table info
  tableId: string
  gamePhase: 'waiting' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown'
  isGameActive: boolean
  isMultiplayer: boolean
  isConnected: boolean
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  
  // Players
  players: Player[]
  communityCards: Card[]
  pot: number
  sidePots: { amount: number; eligiblePlayers: string[] }[] 
  currentBet: number
  minRaise: number
  activePlayerId?: string
  dealerPosition: number
  smallBlind: number
  bigBlind: number
  maxPlayers: number
  currentUserId?: string
  
  // Spectators
  spectatorCount: number
  isSpectating: boolean
  
  // Showdown & History
  showdownVisible: boolean
  handHistoryVisible: boolean
  handHistory: HandHistoryEntry[]
  currentHandNumber: number
  
  // WebSocket methods
  connectToTable: (tableId: string) => Promise<void>
  disconnectFromTable: () => void
  createMultiplayerTable: (blinds: { small: number; big: number }) => Promise<void>
  
  // Actions
  setPlayers: (players: Player[]) => void
  updatePlayer: (playerId: string, updates: Partial<Player>) => void
  setCommunityCards: (cards: Card[]) => void
  setGamePhase: (phase: GameState['gamePhase']) => void
  setPot: (amount: number) => void
  setCurrentBet: (amount: number) => void
  setActivePlayer: (playerId?: string) => void
  setConnectionStatus: (status: GameState['connectionStatus']) => void
  setShowdownVisible: (visible: boolean) => void
  setHandHistoryVisible: (visible: boolean) => void
  setSpectatorCount: (count: number) => void
  setSpectatorMode: (isSpectating: boolean) => void
  
  // Game actions
  playerAction: (playerId: string, action: Player['lastAction'], amount?: number) => void
  multiplayerAction: (action: Player['lastAction'], amount?: number) => Promise<void>
  dealCommunityCard: (card: Card) => void
  dealCommunityCards: (phase: 'flop' | 'turn' | 'river') => void
  nextPhase: () => void
  startNewGame: () => void
  startNewHand: (handNumber: number, smallBlind: number, bigBlind: number) => void
  announceWinner: (winnerId: string, winnerName: string, winAmount: number, winType: string) => void
  resetHand: () => void
  evaluateHandsAndShowdown: () => void
  addToHandHistory: (entry: HandHistoryEntry) => void
}

// Mock data for development
const createMockPlayers = (): Player[] => [
  {
    id: '1',
    name: 'AlabamaMike',
    username: 'AlabamaMike',
    chips: 2500,
    chipCount: 2500,
    position: 0,
    isDealer: true,
    isSmallBlind: false,
    isBigBlind: false,
    currentBet: 0,
    hasActed: false,
    isFolded: false,
    isAllIn: false,
    isActive: true,
    holeCards: [
      { suit: Suit.HEARTS, rank: Rank.ACE },
      { suit: Suit.SPADES, rank: Rank.KING }
    ]
  },
  {
    id: '2',
    name: 'PokerPro',
    username: 'PokerPro',
    chips: 1850,
    chipCount: 1850,
    position: 1,
    isDealer: false,
    isSmallBlind: true,
    isBigBlind: false,
    currentBet: 25,
    hasActed: true,
    isFolded: false,
    isAllIn: false,
    isActive: true,
    lastAction: 'call'
  },
  {
    id: '3',
    name: 'CardShark',
    username: 'CardShark',
    chips: 3200,
    chipCount: 3200,
    position: 2,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: true,
    currentBet: 50,
    hasActed: true,
    isFolded: false,
    isAllIn: false,
    isActive: true,
    lastAction: 'bet'
  },
  {
    id: '4',
    name: 'BluffMaster',
    username: 'BluffMaster',
    chips: 800,
    chipCount: 800,
    position: 3,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    currentBet: 0,
    hasActed: false,
    isFolded: true,
    isAllIn: false,
    isActive: false,
    lastAction: 'fold'
  },
  {
    id: '5',
    name: 'ChipLeader',
    username: 'ChipLeader',
    chips: 4500,
    chipCount: 4500,
    position: 4,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    currentBet: 50,
    hasActed: true,
    isFolded: false,
    isAllIn: false,
    isActive: true,
    lastAction: 'call',
    timeRemaining: 15
  }
]

export const useGameStore = create<GameState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    tableId: 'demo-table-1',
    gamePhase: 'flop',
    isGameActive: true,
    isMultiplayer: false,
    isConnected: false,
    connectionStatus: 'disconnected',
    players: createMockPlayers(),
    communityCards: [
      { suit: Suit.HEARTS, rank: Rank.ACE },
      { suit: Suit.DIAMONDS, rank: Rank.KING },
      { suit: Suit.CLUBS, rank: Rank.QUEEN }
    ],
    pot: 275,
    sidePots: [],
    currentBet: 50,
    minRaise: 50,
    activePlayerId: '5',
    dealerPosition: 0,
    smallBlind: 25,
    bigBlind: 50,
    maxPlayers: 9,
    
    // Showdown & History
    showdownVisible: false,
    handHistoryVisible: false,
    handHistory: [],
    currentHandNumber: 1,
    currentUserId: '1', // Default for demo
    
    // Spectators
    spectatorCount: 0,
    isSpectating: false,

    // WebSocket methods
    connectToTable: async (tableId: string) => {
      try {
        set({ connectionStatus: 'connecting', tableId, isMultiplayer: true })
        
        // Set up event listeners
        setupWebSocketListeners(set, get)
        
        // Connect to WebSocket
        await pokerGameClient.connect()
        await pokerGameClient.joinTable(tableId)
        
        set({ connectionStatus: 'connected', isConnected: true })
        
        // Request current table state
        await pokerGameClient.requestTableState()
      } catch (error) {
        console.error('Failed to connect to table:', error)
        set({ connectionStatus: 'error', isConnected: false })
        throw error
      }
    },

    disconnectFromTable: () => {
      pokerGameClient.leaveTable()
      pokerGameClient.disconnect()
      set({ 
        connectionStatus: 'disconnected', 
        isConnected: false, 
        isMultiplayer: false 
      })
    },

    createMultiplayerTable: async (blinds: { small: number; big: number }) => {
      try {
        set({ connectionStatus: 'connecting', isMultiplayer: true })
        
        // Set up event listeners
        setupWebSocketListeners(set, get)
        
        // Connect and create table
        await pokerGameClient.connect()
        await pokerGameClient.createTable(9, blinds)
        
        set({ 
          connectionStatus: 'connected', 
          isConnected: true,
          smallBlind: blinds.small,
          bigBlind: blinds.big
        })
      } catch (error) {
        console.error('Failed to create table:', error)
        set({ connectionStatus: 'error', isConnected: false })
        throw error
      }
    },

    // Basic setters
    setPlayers: (players) => set({ players }),
    
    updatePlayer: (playerId, updates) => set((state) => ({
      players: state.players.map(player =>
        player.id === playerId ? { ...player, ...updates } : player
      )
    })),
    
    setCommunityCards: (cards) => set({ communityCards: cards }),
    
    setGamePhase: (phase) => set({ gamePhase: phase }),
    
    setPot: (amount) => set({ pot: amount }),
    
    setCurrentBet: (amount) => set({ currentBet: amount }),
    
    setActivePlayer: (playerId) => set({ activePlayerId: playerId }),

    setConnectionStatus: (status) => set({ connectionStatus: status }),

    setShowdownVisible: (visible) => set({ showdownVisible: visible }),

    setHandHistoryVisible: (visible) => set({ handHistoryVisible: visible }),
    
    setSpectatorCount: (count) => set({ spectatorCount: count }),
    
    setSpectatorMode: (isSpectating) => set({ isSpectating }),

    addToHandHistory: (entry) => set((state) => ({ 
      handHistory: [entry, ...state.handHistory].slice(0, 50) // Keep last 50 hands
    })),

    evaluateHandsAndShowdown: () => {
      const state = get()
      if (state.communityCards.length !== 5) return
      
      const activePlayers = state.players.filter(p => !p.isFolded && p.holeCards?.length === 2)
      if (activePlayers.length === 0) return

      // Convert cards to hand evaluator format
      const convertCard = (card: Card): import('@/lib/hand-evaluator').Card => ({
        rank: card.rank as import('@/lib/hand-evaluator').Rank,
        suit: card.suit.toLowerCase() as import('@/lib/hand-evaluator').Suit
      })

      // Evaluate each player's hand
      const evaluatedPlayers = activePlayers.map(player => {
        const holeCards = player.holeCards!.map(convertCard)
        const communityCards = state.communityCards.map(convertCard)
        const handResult = evaluateHand(holeCards, communityCards)
        
        return {
          ...player,
          handResult
        }
      })

      // Find winners
      let bestStrength = -1
      evaluatedPlayers.forEach(player => {
        if (player.handResult.strength > bestStrength) {
          bestStrength = player.handResult.strength
        }
      })

      const winners = evaluatedPlayers.filter(p => p.handResult.strength === bestStrength)
      const winnings = Math.floor(state.pot / winners.length)

      // Update players with results
      const updatedPlayers = state.players.map(player => {
        const evaluated = evaluatedPlayers.find(p => p.id === player.id)
        if (!evaluated) return player

        const isWinner = winners.some(w => w.id === player.id)
        return {
          ...player,
          handResult: evaluated.handResult,
          isWinner,
          winnings: isWinner ? winnings : 0,
          chips: isWinner ? player.chips + winnings : player.chips
        }
      })

      // Add to hand history
      if (winners.length > 0) {
        const historyEntry: HandHistoryEntry = {
          id: `hand-${state.currentHandNumber}`,
          handNumber: state.currentHandNumber,
          timestamp: new Date(),
          pot: state.pot,
          winner: {
            name: winners[0].name,
            handResult: winners[0].handResult,
            winnings
          },
          communityCards: state.communityCards,
          playerCount: activePlayers.length,
          keyActions: [`${winners[0].name} wins with ${winners[0].handResult.handName}`]
        }
        
        set((state) => ({ 
          handHistory: [historyEntry, ...state.handHistory].slice(0, 50)
        }))
      }

      // Update state
      set({
        players: updatedPlayers,
        gamePhase: 'showdown',
        showdownVisible: true,
        pot: 0,
        currentHandNumber: state.currentHandNumber + 1
      })
    },

    // Multiplayer action - sends to WebSocket
    multiplayerAction: async (action, amount) => {
      const state = get()
      if (!state.isMultiplayer || !state.isConnected || !action) {
        throw new Error('Not connected to multiplayer game or invalid action')
      }
      
      try {
        await pokerGameClient.playerAction(action, amount)
      } catch (error) {
        console.error('Failed to send player action:', error)
        throw error
      }
    },
    
    // Local action - for single player demo
    playerAction: (playerId, action, amount = 0) => {
      const state = get()
      
      // If multiplayer, use the WebSocket method instead
      if (state.isMultiplayer && playerId === state.currentUserId) {
        state.multiplayerAction(action, amount).catch(console.error)
        return
      }
      
      const player = state.players.find(p => p.id === playerId)
      if (!player) return

      let newBet = player.currentBet
      let newChipCount = player.chipCount

      switch (action) {
        case 'fold':
          set({
            players: state.players.map(p =>
              p.id === playerId
                ? { ...p, isFolded: true, isActive: false, lastAction: action }
                : p
            )
          })
          break
        
        case 'call':
          newBet = state.currentBet
          newChipCount -= (newBet - player.currentBet)
          break
        
        case 'bet':
        case 'raise':
          newBet = amount
          newChipCount -= (newBet - player.currentBet)
          set({ currentBet: newBet, minRaise: newBet - state.currentBet })
          break
        
        case 'check':
          // No chip movement for check
          break
      }

      if (action !== 'fold') {
        set({
          players: state.players.map(p =>
            p.id === playerId
              ? {
                  ...p,
                  currentBet: newBet,
                  chipCount: newChipCount,
                  chips: newChipCount, // Update both for consistency
                  hasActed: true,
                  lastAction: action,
                  isAllIn: newChipCount === 0
                }
              : p
          )
        })
      }

      // Calculate new pot
      const totalBets = get().players.reduce((sum, p) => sum + p.currentBet, 0)
      set({ pot: state.pot + (totalBets - state.players.reduce((sum, p) => sum + (p.currentBet || 0), 0)) })
    },
    
    dealCommunityCard: (card) => set((state) => ({
      communityCards: [...state.communityCards, card]
    })),

    dealCommunityCards: (phase) => {
      const mockCards = [
        { suit: Suit.HEARTS, rank: Rank.JACK },
        { suit: Suit.SPADES, rank: Rank.TEN },
        { suit: Suit.DIAMONDS, rank: Rank.NINE },
        { suit: Suit.CLUBS, rank: Rank.EIGHT },
        { suit: Suit.HEARTS, rank: Rank.SEVEN }
      ]
      
      const state = get()
      let newCards = [...state.communityCards]
      
      switch (phase) {
        case 'flop':
          newCards = mockCards.slice(0, 3)
          break
        case 'turn':
          newCards = [...state.communityCards, mockCards[3]]
          break
        case 'river':
          newCards = [...state.communityCards, mockCards[4]]
          break
      }
      
      set({ communityCards: newCards })
    },

    nextPhase: () => {
      const state = get()
      const phaseOrder: GameState['gamePhase'][] = ['pre-flop', 'flop', 'turn', 'river', 'showdown']
      const currentIndex = phaseOrder.indexOf(state.gamePhase)
      
      if (currentIndex < phaseOrder.length - 1) {
        set({ gamePhase: phaseOrder[currentIndex + 1] })
      }
    },

    startNewGame: () => {
      set({
        gamePhase: 'pre-flop',
        isGameActive: true,
        communityCards: [],
        pot: 0,
        currentBet: 0,
        players: createMockPlayers()
      })
    },

    startNewHand: (handNumber: number, smallBlind: number, bigBlind: number) => {
      set((state) => ({
        currentHandNumber: handNumber,
        smallBlind,
        bigBlind,
        gamePhase: 'pre-flop',
        isGameActive: true,
        communityCards: [],
        pot: 0,
        currentBet: bigBlind,
        showdownVisible: false,
        // Reset player states for new hand
        players: state.players.map(p => ({
          ...p,
          currentBet: 0,
          hasActed: false,
          isFolded: false,
          isAllIn: false,
          isActive: true,
          lastAction: undefined,
          holeCards: undefined,
          isWinner: false,
          winnings: 0,
          handResult: undefined
        }))
      }))
    },

    announceWinner: (winnerId: string, winnerName: string, winAmount: number, winType: string) => {
      const state = get()
      
      // Update winner player
      const updatedPlayers = state.players.map(p => 
        p.id === winnerId 
          ? { ...p, isWinner: true, winnings: winAmount, chips: p.chips + winAmount }
          : { ...p, isWinner: false, winnings: 0 }
      )

      // Add to hand history
      const historyEntry: HandHistoryEntry = {
        id: `hand-${state.currentHandNumber}`,
        handNumber: state.currentHandNumber,
        timestamp: new Date(),
        pot: winAmount,
        winner: {
          name: winnerName,
          handResult: state.players.find(p => p.id === winnerId)?.handResult || {
            handName: winType,
            strength: 0,
            cards: []
          },
          winnings: winAmount
        },
        communityCards: state.communityCards,
        playerCount: state.players.filter(p => !p.isFolded).length,
        keyActions: [`${winnerName} wins ${winAmount} chips by ${winType}`]
      }

      set({
        players: updatedPlayers,
        gamePhase: 'showdown',
        showdownVisible: true,
        handHistory: [historyEntry, ...state.handHistory].slice(0, 50)
      })

      // Auto-hide showdown after 5 seconds
      setTimeout(() => {
        set({ showdownVisible: false })
      }, 5000)
    },
    
    resetHand: () => set((state) => ({
      gamePhase: 'pre-flop',
      communityCards: [],
      pot: 0,
      currentBet: 0,
      players: state.players.map(p => ({
        ...p,
        currentBet: 0,
        hasActed: false,
        isFolded: false,
        isAllIn: false,
        isActive: true,
        lastAction: undefined,
        holeCards: undefined
      }))
    }))
  }))
)

// WebSocket event handlers
function setupWebSocketListeners(set: any, get: any) {
  // Player joined table
  pokerGameClient.on('PLAYER_JOINED', (message) => {
    if (message.type === 'PLAYER_JOINED') {
      const { player } = message.payload
      set((state: GameState) => ({
        players: [...state.players.filter(p => p.id !== player.id), player]
      }))
    }
  })

  // Player left table  
  pokerGameClient.on('PLAYER_LEFT', (message) => {
    if (message.type === 'PLAYER_LEFT') {
      const { playerId } = message.payload
      set((state: GameState) => ({
        players: state.players.filter(p => p.id !== playerId)
      }))
    }
  })

  // Game started
  pokerGameClient.on('GAME_STARTED', (message) => {
    if (message.type === 'GAME_STARTED') {
      const { players, dealerId } = message.payload
      set({
        players,
        isGameActive: true,
        gamePhase: 'pre-flop',
        dealerPosition: players.findIndex((p: Player) => p.id === dealerId)
      })
    }
  })

  // Cards dealt to player
  pokerGameClient.on('CARDS_DEALT', (message) => {
    if (message.type === 'CARDS_DEALT') {
      const { playerId, cards } = message.payload
      set((state: GameState) => ({
        players: state.players.map(p =>
          p.id === playerId ? { ...p, holeCards: cards } : p
        )
      }))
    }
  })

  // Community cards dealt
  pokerGameClient.on('COMMUNITY_CARDS', (message) => {
    if (message.type === 'COMMUNITY_CARDS') {
      const { cards, phase } = message.payload
      set({ 
        communityCards: cards,
        gamePhase: phase
      })
    }
  })

  // Player action received
  pokerGameClient.on('PLAYER_ACTION', (message) => {
    if (message.type === 'PLAYER_ACTION') {
      const { playerId, action, amount, newChipCount } = message.payload
      set((state: GameState) => ({
        players: state.players.map(p =>
          p.id === playerId 
            ? { 
                ...p, 
                lastAction: action, 
                currentBet: amount || p.currentBet,
                chipCount: newChipCount,
                chips: newChipCount,
                hasActed: true,
                isFolded: action === 'fold',
                isActive: action !== 'fold'
              } 
            : p
        )
      }))
    }
  })

  // Table state update
  pokerGameClient.on('TABLE_STATE', (message) => {
    if (message.type === 'TABLE_STATE') {
      const { players, pot, communityCards, gamePhase } = message.payload
      set({
        players,
        pot,
        communityCards,
        gamePhase
      })
    }
  })

  // Player turn
  pokerGameClient.on('PLAYER_TURN', (message) => {
    if (message.type === 'PLAYER_TURN') {
      const { playerId, timeRemaining } = message.payload
      set((state: GameState) => ({
        activePlayerId: playerId,
        players: state.players.map(p =>
          p.id === playerId ? { ...p, timeRemaining } : p
        )
      }))
    }
  })

  // Handle errors
  pokerGameClient.on('ERROR', (message) => {
    if (message.type === 'ERROR') {
      console.error('Poker game error:', message.payload.message)
      set({ connectionStatus: 'error' })
    }
  })
}
