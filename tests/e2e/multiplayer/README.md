# Multiplayer Poker Engine Test Suite

This comprehensive test suite validates the multiplayer poker engine functionality including game flow, betting mechanics, button rotation, and edge cases.

## Features

- **Full Table Testing**: Tests with 6-9 players
- **Button Rotation**: Validates correct dealer button movement
- **Blind Posting**: Ensures small/big blinds are posted correctly
- **Betting Validation**: Tests all betting actions and pot calculations
- **Edge Cases**: Player disconnections, eliminations, and dynamic joins/leaves
- **Hand History Logging**: Optional detailed logging of all hands played

## Installation

```bash
cd tests/e2e/multiplayer
npm install
```

## Running Tests

### Run all tests:
```bash
npm test
```

### Run specific test suites:
```bash
npm run test:full-table    # 6+ player scenarios
npm run test:button        # Button rotation tests
npm run test:betting       # Betting validation (when implemented)
```

### Run with different log levels:
```bash
# Minimal logging (default)
npm run test:minimal

# Detailed logging with hand histories
npm run test:detailed

# Debug mode with WebSocket messages
npm run test:debug-logs
```

### Debug mode:
```bash
npm run test:debug         # Opens Playwright inspector
npm run test:headed        # Run in headed browser mode
```

## Configuration

The test suite can be configured via environment variables:

- `TEST_LOG_LEVEL`: Set logging verbosity (minimal, normal, detailed, debug)
- `SAVE_HAND_HISTORIES`: Save detailed hand histories to JSON files (true/false)
- `LOG_WS_MESSAGES`: Log all WebSocket messages (true/false)

## Test Structure

```
multiplayer/
├── config.ts                 # Test configuration
├── test-base.ts             # Base test class with fixtures
├── helpers/
│   ├── logger.ts            # Test logging and hand history
│   ├── api-client.ts        # HTTP API interactions
│   ├── websocket-helper.ts  # WebSocket connection management
│   ├── player-simulator.ts  # Automated player actions
│   └── game-validator.ts    # Game state validation
├── full-table.spec.ts       # 6+ player test scenarios
├── button-rotation.spec.ts  # Button movement tests
└── betting-rounds.spec.ts   # Betting validation (TBD)
```

## Test Scenarios

### Full Table Tests
- 6-player cash game with full button rotation
- 9-player table with complex betting scenarios
- Dynamic table with players joining/leaving

### Button Rotation Tests
- Clockwise button movement validation
- Heads-up blind posting rules
- Button skipping eliminated players

### Betting Tests (To Be Implemented)
- All betting actions (check, bet, raise, fold, all-in)
- Side pot calculations
- Minimum raise validation
- Pot-limit and no-limit betting

## Hand History Output

When `SAVE_HAND_HISTORIES=true`, detailed hand histories are saved to:
```
test-results/hand-histories/hand-history-{test-name}-{timestamp}.json
```

Each file contains:
- Test metadata
- Complete hand-by-hand action log
- Player positions and chip counts
- Community cards and winners
- Raw game state (in debug mode)

## Troubleshooting

### API Connection Issues
- Ensure the poker server is running at the configured URL
- Check `config.ts` for correct API endpoints
- Verify network connectivity

### WebSocket Issues
- Check for firewall/proxy blocking WebSocket connections
- Ensure authentication tokens are valid
- Monitor console for connection errors

### Test Timeouts
- Increase timeouts in `playwright.config.ts` if needed
- Check for server performance issues
- Reduce number of hands in test scenarios

## Adding New Tests

1. Create a new spec file following the naming pattern `{feature}.spec.ts`
2. Import the test base: `import { test, expect } from './test-base'`
3. Use provided fixtures for API, WebSocket, and player simulation
4. Add validation using the GameValidator helper
5. Update this README with new test documentation