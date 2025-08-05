# Full Tilt-Inspired Poker Lobby Implementation Plan

## Overview
Implement a professional poker lobby inspired by Full Tilt Poker's classic design, featuring advanced filtering, table previews, and comprehensive game information.

## Key Design Elements from Full Tilt Lobby

### 1. **Layout Structure**
- **Left Sidebar (20%)**: Game type filters and navigation
- **Center Table List (55%)**: Sortable table grid with detailed information
- **Right Preview Panel (25%)**: Table preview and quick actions

### 2. **Top Navigation Bar**
- Game format tabs: Cash Games | Sit & Go | Tournaments | Rush Poker
- Quick filters: Stakes, Players, Speed
- Search functionality
- Account balance and username display

### 3. **Left Sidebar - Game Filters**
```
├── Game Type
│   ├── No Limit Hold'em
│   ├── Pot Limit Omaha
│   ├── Mixed Games
│   └── Other Variants
├── Stakes
│   ├── Micro ($0.01-$0.25)
│   ├── Low ($0.50-$2)
│   ├── Mid ($5-$10)
│   └── High ($25+)
├── Table Size
│   ├── Heads Up (2)
│   ├── 6-Max
│   ├── 9-Max
│   └── Full Ring
└── Special Filters
    ├── Fast Fold
    ├── Deep Stack
    ├── Ante Games
    └── Jackpot Tables
```

### 4. **Center Table List - Column Structure**
- **Table Name** (with icons for special features)
- **Game** (NL Hold'em, PLO, etc.)
- **Stakes** (Small/Big blind)
- **Players** (Current/Max with visual indicator)
- **Avg Pot** (Last 20 hands)
- **Plrs/Flop** (Percentage seeing flop)
- **H/Hr** (Hands per hour)
- **Wait** (Waitlist count)

### 5. **Right Panel - Table Preview**
- Visual table representation showing:
  - Seated players with chip counts
  - Empty seats (clickable to join)
  - Current action/pot
  - Table statistics
- Quick seat button
- Add to favorites
- Table info (time bank, rake, min/max buy-in)

### 6. **Bottom Status Bar**
- Total players online
- Tables running
- Connection status
- Promotions ticker

## Implementation Phases

### Phase 1: Core Layout and Structure
1. Create new lobby component structure
2. Implement responsive grid layout
3. Set up routing and navigation
4. Create base styling matching Full Tilt aesthetic

### Phase 2: Filter System
1. Build filter sidebar component
2. Implement filter state management
3. Create filter persistence (remember user preferences)
4. Add real-time filter updates

### Phase 3: Table List Implementation
1. Create sortable table component
2. Implement column sorting logic
3. Add pagination/virtual scrolling for performance
4. Create table row hover effects and selection

### Phase 4: Table Preview System
1. Build mini table visualization component
2. Implement seat selection UI
3. Add real-time preview updates
4. Create quick-join functionality

### Phase 5: Advanced Features
1. Implement waitlist system
2. Add favorite tables
3. Create table search/filtering
4. Add keyboard navigation

### Phase 6: Polish and Performance
1. Add loading states and skeletons
2. Implement smooth transitions
3. Optimize for large table lists
4. Add sound effects and notifications

## Technical Architecture

### State Management
```typescript
interface LobbyState {
  // Filters
  selectedGameType: GameType;
  stakeRange: [number, number];
  tableSize: TableSize[];
  specialFilters: SpecialFilter[];
  
  // Tables
  tables: Table[];
  sortColumn: SortColumn;
  sortDirection: 'asc' | 'desc';
  selectedTableId: string | null;
  
  // UI State
  isLoading: boolean;
  searchQuery: string;
  viewMode: 'grid' | 'list';
}
```

### Component Structure
```
LobbyPage/
├── LobbyHeader/
│   ├── GameTypeTabs
│   ├── QuickFilters
│   └── AccountInfo
├── LobbyContent/
│   ├── FilterSidebar/
│   │   ├── GameTypeFilter
│   │   ├── StakesFilter
│   │   ├── TableSizeFilter
│   │   └── SpecialFilters
│   ├── TableList/
│   │   ├── TableListHeader
│   │   ├── TableListBody
│   │   └── TableListPagination
│   └── TablePreview/
│       ├── MiniTable
│       ├── TableStats
│       └── QuickActions
└── LobbyStatusBar/
    ├── OnlineStats
    ├── ConnectionStatus
    └── PromotionsTicker
```

### Data Models
```typescript
interface Table {
  id: string;
  name: string;
  gameType: GameType;
  stakes: Stakes;
  players: number;
  maxPlayers: number;
  avgPot: number;
  playersPerFlop: number;
  handsPerHour: number;
  waitlistCount: number;
  isFavorite: boolean;
  features: TableFeature[];
}

interface TableFeature {
  type: 'fastFold' | 'deepStack' | 'ante' | 'jackpot';
  icon: string;
  tooltip: string;
}
```

## Visual Design Specifications

### Color Palette
- **Background**: Dark gray (#1a1a1a)
- **Card Backgrounds**: Lighter gray (#2a2a2a)
- **Borders**: Medium gray (#3a3a3a)
- **Text Primary**: White (#ffffff)
- **Text Secondary**: Light gray (#b0b0b0)
- **Accent**: Full Tilt Red (#c41e3a)
- **Success**: Green (#27ae60)
- **Warning**: Orange (#f39c12)

### Typography
- **Headers**: Roboto Bold, 16-20px
- **Table Data**: Roboto Regular, 12-14px
- **Filters**: Roboto Medium, 14px
- **Status**: Roboto Light, 11px

### Spacing
- **Grid Gap**: 16px
- **Card Padding**: 12-16px
- **List Item Height**: 32px
- **Compact Mode**: 24px

## API Requirements

### New Endpoints Needed
1. `GET /api/lobby/tables` - Paginated table list with filters
2. `GET /api/lobby/table/:id/preview` - Detailed table info
3. `POST /api/lobby/table/:id/join` - Join table with seat selection
4. `POST /api/lobby/table/:id/waitlist` - Join waitlist
5. `GET /api/lobby/stats` - Global lobby statistics
6. `WebSocket /ws/lobby` - Real-time lobby updates

### WebSocket Events
- `lobby:table_added` - New table created
- `lobby:table_updated` - Table stats changed
- `lobby:table_removed` - Table closed
- `lobby:player_seated` - Player joined table
- `lobby:stats_update` - Global stats update

## Performance Considerations

1. **Virtual Scrolling**: For tables list (100+ tables)
2. **Debounced Filtering**: 300ms delay on filter changes
3. **Cached Previews**: Store last 10 table previews
4. **Progressive Loading**: Load visible tables first
5. **WebSocket Throttling**: Batch updates every 100ms

## Testing Strategy

1. **Unit Tests**
   - Filter logic
   - Sorting algorithms
   - State management

2. **Integration Tests**
   - Filter + Table List interaction
   - WebSocket updates
   - Join table flow

3. **E2E Tests**
   - Full lobby navigation
   - Table joining
   - Filter persistence

4. **Performance Tests**
   - 1000+ tables rendering
   - Rapid filter changes
   - WebSocket message flooding

## Timeline Estimate

- **Phase 1**: 2 days - Core layout
- **Phase 2**: 2 days - Filter system
- **Phase 3**: 3 days - Table list
- **Phase 4**: 2 days - Preview system
- **Phase 5**: 3 days - Advanced features
- **Phase 6**: 2 days - Polish

**Total**: ~14 days for complete implementation

## Next Steps

1. Create mockups/wireframes
2. Set up component structure
3. Implement Phase 1 layout
4. Build filter components
5. Integrate with backend API