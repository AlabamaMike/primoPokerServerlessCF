# Phase 3B.2: Player Actions and Game Flow Implementation Plan

## Overview
Building on the solid Phase 3B.1 foundation, Phase 3B.2 focuses on implementing comprehensive poker game mechanics with robust player actions, betting logic, and complete game flow management.

## 🎯 Phase 3B.2 Objectives

### Core Game Mechanics
1. **Advanced Betting System**
   - Minimum/maximum bet validation
   - All-in scenarios and side pot management
   - Blind posting automation
   - Betting round completion logic

2. **Complete Hand Management**
   - Card dealing and hand evaluation
   - Community card progression (flop, turn, river)
   - Hand strength comparison and winner determination
   - Pot distribution with side pots

3. **Player Action Validation**
   - Context-aware action availability (fold/check/call/bet/raise)
   - Timeout handling for player decisions
   - Invalid action rejection with clear feedback
   - Turn-based action enforcement

4. **Game State Transitions**
   - Automated progression through betting rounds
   - Hand completion and new hand initialization
   - Player elimination and table management
   - Tournament bracket progression (foundation)

## 🏗️ Implementation Strategy

### Phase 3B.2.1: Enhanced Betting Logic (Week 1)
**Priority: HIGH** - Foundation for all poker mechanics

#### Betting System Enhancements
- **Smart Bet Validation**
  ```typescript
  interface BettingRules {
    minBet: number
    maxBet: number
    canCheck: boolean
    canCall: boolean
    canRaise: boolean
    callAmount: number
    minRaise: number
  }
  ```

- **All-In Management**
  - Side pot creation and management
  - Player chip stack validation
  - All-in player exclusion from further betting
  - Proper pot distribution logic

- **Blind System**
  - Automatic blind posting
  - Blind progression for tournaments
  - Dead button and missing blind rules
  - Heads-up blind adjustment

#### Key Files to Modify/Create:
- `packages/core/src/betting-engine.ts` - Core betting logic
- `packages/persistence/src/simple-game-table-do.ts` - Enhanced action processing
- `packages/shared/src/types.ts` - Extended betting interfaces

### Phase 3B.2.2: Card Management & Hand Evaluation (Week 1-2)
**Priority: HIGH** - Essential for game completion

#### Card System Integration
- **Deck Management**
  ```typescript
  interface GameDeck {
    cards: Card[]
    shuffle(): void
    deal(count: number): Card[]
    burn(): Card
    reset(): void
  }
  ```

- **Hand Evaluation**
  - Integration with existing hand evaluator
  - Community card combination logic
  - Hand strength comparison
  - Tie-breaking rules

- **Board Management**
  - Flop (3 cards) dealing
  - Turn (1 card) dealing  
  - River (1 card) dealing
  - Burn card handling

#### Key Files to Enhance:
- `packages/core/src/hand-evaluator.ts` - Extend existing evaluator
- `packages/core/src/deck-manager.ts` - New deck management
- `packages/persistence/src/simple-game-table-do.ts` - Card dealing integration

### Phase 3B.2.3: Game Flow Automation (Week 2)
**Priority: MEDIUM** - User experience enhancement

#### Automated Game Progression
- **Betting Round Management**
  - Automatic round completion detection
  - Next phase triggering (preflop → flop → turn → river → showdown)
  - Player timeout handling
  - Action validation and enforcement

- **Hand Completion Logic**
  - Winner determination
  - Pot distribution
  - New hand initialization
  - Button and blind advancement

- **Player Management**
  - Sit-out handling
  - Disconnection management
  - Elimination logic
  - Seat rotation

#### Key Features:
- Automatic game progression
- Player timeout enforcement (30-60 seconds)
- Graceful disconnection handling
- Real-time game state broadcasting

### Phase 3B.2.4: Advanced Player Actions (Week 2)
**Priority: MEDIUM** - Enhanced gameplay features

#### Extended Action Set
- **String Betting Prevention**
  - Single action commitment
  - Verbal declaration handling
  - Action confirmation system

- **Advanced Actions**
  - Check-raise validation
  - String bet detection
  - Angle shooting prevention
  - Proper action timing

- **Player Controls**
  - Sit out / sit back in
  - Auto-fold when away
  - Pre-action selections (call any, fold to raise)
  - Time bank usage

## 🔧 Technical Architecture

### Enhanced GameTable Durable Object
```typescript
interface EnhancedGameState {
  // Existing fields plus:
  deck: GameDeck
  sidePots: SidePot[]
  bettingRules: BettingRules
  actionTimeout: number
  handHistory: HandRecord[]
  playerTimeouts: Map<string, number>
}

interface PlayerAction {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in'
  amount?: number
  timestamp: number
  playerId: string
  isValid: boolean
  validationError?: string
}
```

### Betting Engine Core
```typescript
class BettingEngine {
  validateAction(action: PlayerAction, gameState: GameState): ValidationResult
  processAction(action: PlayerAction, gameState: GameState): GameState
  calculatePots(players: Player[]): Pot[]
  determineBettingRules(gameState: GameState, playerId: string): BettingRules
  isRoundComplete(gameState: GameState): boolean
}
```

### Real-time Updates
- Enhanced WebSocket message types for detailed game actions
- Player action validation responses
- Real-time pot and betting updates
- Game phase transition notifications

## 🧪 Testing Strategy

### Unit Tests
- Betting logic validation
- Hand evaluation accuracy
- Pot calculation correctness
- Game state transitions

### Integration Tests
- Multi-player betting scenarios
- All-in and side pot handling
- Disconnection recovery
- Game completion workflows

### Load Testing
- Multiple concurrent tables
- High-frequency action processing
- WebSocket message throughput
- Durable Object scaling

## 📊 Success Metrics

### Functional Completeness
- ✅ All poker actions implemented correctly
- ✅ Proper pot management including side pots
- ✅ Accurate hand evaluation and winner determination
- ✅ Smooth game progression automation

### Performance Targets
- Action processing: < 100ms
- Game state updates: < 200ms
- WebSocket message delivery: < 50ms
- Concurrent table support: 100+

### User Experience
- Intuitive action interface
- Clear validation feedback
- Responsive game progression
- Reliable connection handling

## 🚀 Implementation Timeline

### Week 1: Core Mechanics
- **Days 1-2**: Enhanced betting engine
- **Days 3-4**: Card management integration
- **Days 5-7**: Basic hand evaluation integration

### Week 2: Advanced Features  
- **Days 1-3**: Game flow automation
- **Days 4-5**: Advanced player actions
- **Days 6-7**: Testing and refinement

## 🔄 Phase 3B.3 Preparation

Phase 3B.2 completion enables:
- **Live Multiplayer Lobby**: Real-time table browsing
- **Spectator Mode**: Watch live games
- **Tournament Brackets**: Multi-table tournaments
- **Social Features**: Player profiles and chat
- **Analytics Dashboard**: Game statistics and insights

---

**Phase 3B.2 Status: READY TO BEGIN** 🚀  
*Building on solid Phase 3B.1 foundation for complete poker gameplay*
