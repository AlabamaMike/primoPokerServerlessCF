# Primo Poker Lobby Implementation - Developer Handoff

## Executive Summary

This document outlines the implementation plan for adding a Full Tilt Poker-style lobby interface to the Primo Poker platform. The lobby will serve as the primary entry point after authentication, allowing players to browse available tables, filter by preferences, and create custom tables through a multi-step wizard interface.

## Project Context

### Current State
Based on the codebase analysis:
- ✅ **Authentication system** fully functional with JWT tokens
- ✅ **Table creation API** exists at `/api/tables` 
- ✅ **WebSocket infrastructure** operational for real-time game updates
- ✅ **Multiplayer flow** working (login → create table → game)
- ❌ **Lobby interface** missing - users go directly to multiplayer page
- ❌ **Table browsing** not implemented
- ❌ **Real-time table updates** not available outside game rooms

### Goal
Create a professional poker lobby that becomes the default landing page after login, providing:
1. Real-time table listings with filtering
2. Table creation wizard with comprehensive options
3. Seamless integration with existing game infrastructure

## Technical Architecture

### Backend Requirements

#### 1. Extend Existing APIs

**Enhance `/api/tables` GET endpoint:**
```typescript
// packages/api/src/routes/tables.ts
interface TableListRequest {
  gameType?: 'cash' | 'tournament' | 'sitAndGo'
  variant?: 'texas_holdem' | 'omaha' | 'omaha_hi_lo' 
  stakes?: { min?: number; max?: number }
  hideFullTables?: boolean
  sortBy?: 'name' | 'stakes' | 'players' | 'avgPot'
  sortOrder?: 'asc' | 'desc'
}

interface TableInfo {
  tableId: string
  name: string
  gameType: string
  variant: string
  stakes: { smallBlind: number; bigBlind: number }
  seats: { max: number; occupied: number }
  stats: {
    avgPot: number
    handsPerHour: number
    flopPercentage: number
  }
  players: PlayerSummary[]
}
```

**Enhance table creation to support advanced options:**
```typescript
// Extend existing CreateTableRequestSchema in packages/shared/src/schemas/table.ts
const CreateTableRequestSchema = z.object({
  // Existing fields...
  
  // New optional fields
  options: z.object({
    rushPoker: z.boolean().optional(),
    allowStraddle: z.boolean().optional(),
    runItTwice: z.boolean().optional(),
    showFoldedCards: z.boolean().optional(),
    rabbitHunt: z.boolean().optional(),
    autoMuckLosing: z.boolean().optional()
  }).optional(),
  
  access: z.object({
    isPrivate: z.boolean().optional(),
    password: z.string().optional(),
    inviteOnly: z.boolean().optional(),
    minRating: z.number().optional()
  }).optional()
})
```

#### 2. Add Lobby WebSocket Endpoint

Create new WebSocket handler in `packages/api/src/websocket/lobby.ts`:
```typescript
export class LobbyWebSocketHandler {
  async handleConnection(ws: WebSocket, env: Env) {
    // Send initial table list
    const tables = await this.getTableList(env)
    ws.send(JSON.stringify({
      type: 'lobby_update',
      payload: { tables, timestamp: Date.now() }
    }))
    
    // Set up periodic updates (every 5 seconds)
    const interval = setInterval(async () => {
      const updates = await this.getTableUpdates(env)
      ws.send(JSON.stringify({
        type: 'table_status_change',
        payload: updates
      }))
    }, 5000)
    
    ws.addEventListener('close', () => clearInterval(interval))
  }
}
```

#### 3. Durable Object Enhancements

Update `GameTableDO` to track and expose table statistics:
```typescript
// packages/persistence/src/game-table-do.ts
interface TableStatistics {
  totalHands: number
  totalPot: number
  lastHandTime: number
  flopsSeen: number
}

// Add method to GameTableDO
async getTableInfo(): Promise<TableInfo> {
  const stats = this.calculateStats()
  return {
    tableId: this.state.tableId,
    name: this.state.config.name,
    seats: {
      max: this.state.config.maxPlayers,
      occupied: this.state.players.filter(p => p !== null).length
    },
    stats: {
      avgPot: stats.totalPot / Math.max(stats.totalHands, 1),
      handsPerHour: this.calculateHandsPerHour(stats),
      flopPercentage: (stats.flopsSeen / Math.max(stats.totalHands, 1)) * 100
    }
    // ... other fields
  }
}
```

### Frontend Implementation

#### 1. Project Structure
```
apps/poker-frontend/src/
├── app/
│   ├── lobby/
│   │   ├── page.tsx          # Main lobby page
│   │   └── layout.tsx        # Lobby-specific layout
│   └── layout.tsx            # Update to redirect to /lobby after auth
├── components/
│   └── lobby/
│       ├── LobbyHeader.tsx
│       ├── FilterPanel.tsx
│       ├── TableList.tsx
│       ├── TablePreview.tsx
│       ├── CreateTableModal/
│       │   ├── index.tsx
│       │   ├── BasicSettingsStep.tsx
│       │   ├── StakesConfigStep.tsx
│       │   ├── TableOptionsStep.tsx
│       │   └── ReviewStep.tsx
│       └── index.ts
├── hooks/
│   └── useLobbyWebSocket.ts
└── stores/
    └── lobbyStore.ts
```

#### 2. Key Components Implementation

**Lobby Page (`app/lobby/page.tsx`):**
```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { LobbyHeader, FilterPanel, TableList, TablePreview } from '@/components/lobby'
import { useLobbyWebSocket } from '@/hooks/useLobbyWebSocket'
import { useLobbyStore } from '@/stores/lobbyStore'

export default function LobbyPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { tables, selectedTable, filters } = useLobbyStore()
  
  // Connect to lobby WebSocket
  useLobbyWebSocket()
  
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated])
  
  return (
    <div className="min-h-screen bg-gray-900">
      <LobbyHeader />
      <div className="flex h-[calc(100vh-64px)]">
        <FilterPanel className="w-64 border-r border-gray-800" />
        <div className="flex-1 flex flex-col">
          <TableList 
            tables={tables}
            className="flex-1 overflow-auto"
          />
          {selectedTable && (
            <TablePreview 
              table={selectedTable}
              className="h-64 border-t border-gray-800"
            />
          )}
        </div>
      </div>
    </div>
  )
}
```

**Table List Component (`components/lobby/TableList.tsx`):**
```tsx
import { useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { TableInfo } from '@/types/lobby'
import { useLobbyStore } from '@/stores/lobbyStore'

export function TableList({ tables, className }: Props) {
  const [sortConfig, setSortConfig] = useState({ key: 'name', order: 'asc' })
  const { selectTable, joinTable } = useLobbyStore()
  
  const sortedTables = useMemo(() => {
    // Implement sorting logic
    return [...tables].sort((a, b) => {
      // Sort implementation
    })
  }, [tables, sortConfig])
  
  const virtualizer = useVirtualizer({
    count: sortedTables.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10
  })
  
  return (
    <div className={className}>
      <div className="flex justify-between p-4">
        <Button onClick={() => setShowCreateModal(true)}>
          Request Table
        </Button>
        <div className="flex gap-2">
          {/* Filter controls */}
        </div>
      </div>
      
      <div ref={parentRef} className="overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-gray-400">
              <SortableHeader field="name">Table</SortableHeader>
              <SortableHeader field="stakes">Stakes</SortableHeader>
              <SortableHeader field="players">Players</SortableHeader>
              <SortableHeader field="avgPot">Avg Pot</SortableHeader>
              <SortableHeader field="flop">Flop %</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const table = sortedTables[virtualRow.index]
              return (
                <TableRow
                  key={table.tableId}
                  table={table}
                  onSelect={() => selectTable(table.tableId)}
                  onJoin={() => joinTable(table.tableId)}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Create Table Modal (`components/lobby/CreateTableModal/index.tsx`):**
```tsx
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { BasicSettingsStep } from './BasicSettingsStep'
import { StakesConfigStep } from './StakesConfigStep'
import { TableOptionsStep } from './TableOptionsStep'
import { ReviewStep } from './ReviewStep'
import { CreateTableRequest } from '@/types/table'

const STEPS = ['Basic Settings', 'Stakes', 'Options', 'Review']

export function CreateTableModal({ isOpen, onClose }: Props) {
  const [currentStep, setCurrentStep] = useState(0)
  const [config, setConfig] = useState<CreateTableRequest>(DEFAULT_CONFIG)
  
  const handleCreate = async () => {
    try {
      const response = await fetch('/api/tables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`
        },
        body: JSON.stringify(config)
      })
      
      const data = await response.json()
      if (data.success) {
        router.push(`/game/${data.data.tableId}`)
      }
    } catch (error) {
      toast.error('Failed to create table')
    }
  }
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Create New Table</h2>
        
        <StepIndicator steps={STEPS} currentStep={currentStep} />
        
        <div className="mt-6">
          {currentStep === 0 && (
            <BasicSettingsStep
              config={config}
              onChange={setConfig}
              onNext={() => setCurrentStep(1)}
            />
          )}
          {currentStep === 1 && (
            <StakesConfigStep
              config={config}
              onChange={setConfig}
              onNext={() => setCurrentStep(2)}
              onBack={() => setCurrentStep(0)}
            />
          )}
          {currentStep === 2 && (
            <TableOptionsStep
              config={config}
              onChange={setConfig}
              onNext={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}
          {currentStep === 3 && (
            <ReviewStep
              config={config}
              onCreate={handleCreate}
              onBack={() => setCurrentStep(2)}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}
```

#### 3. State Management

**Lobby Store (`stores/lobbyStore.ts`):**
```ts
import { create } from 'zustand'
import { TableInfo, LobbyFilters } from '@/types/lobby'

interface LobbyStore {
  tables: TableInfo[]
  filters: LobbyFilters
  selectedTableId: string | null
  isLoading: boolean
  
  // Actions
  setTables: (tables: TableInfo[]) => void
  updateTable: (tableId: string, update: Partial<TableInfo>) => void
  setFilters: (filters: LobbyFilters) => void
  selectTable: (tableId: string) => void
  joinTable: (tableId: string) => Promise<void>
}

export const useLobbyStore = create<LobbyStore>((set, get) => ({
  tables: [],
  filters: {
    gameType: 'all',
    hideFullTables: false,
    stakes: { min: 0, max: Infinity }
  },
  selectedTableId: null,
  isLoading: false,
  
  setTables: (tables) => set({ tables }),
  
  updateTable: (tableId, update) => set((state) => ({
    tables: state.tables.map(t => 
      t.tableId === tableId ? { ...t, ...update } : t
    )
  })),
  
  setFilters: (filters) => set({ filters }),
  
  selectTable: (tableId) => set({ selectedTableId: tableId }),
  
  joinTable: async (tableId) => {
    // Navigate to game page
    window.location.href = `/game/${tableId}`
  }
}))
```

**WebSocket Hook (`hooks/useLobbyWebSocket.ts`):**
```ts
import { useEffect, useRef } from 'react'
import { useLobbyStore } from '@/stores/lobbyStore'

export function useLobbyWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { setTables, updateTable } = useLobbyStore()
  
  useEffect(() => {
    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/lobby`)
    wsRef.current = ws
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      
      switch (message.type) {
        case 'lobby_update':
          setTables(message.payload.tables)
          break
          
        case 'table_status_change':
          message.payload.updates.forEach(update => {
            updateTable(update.tableId, update)
          })
          break
          
        case 'new_table_created':
          // Add new table to list
          setTables(prev => [message.payload.table, ...prev])
          break
      }
    }
    
    ws.onerror = (error) => {
      console.error('Lobby WebSocket error:', error)
    }
    
    return () => {
      ws.close()
    }
  }, [])
}
```

## Implementation Steps

### Phase 1: Backend Foundation (2-3 days)
1. **Day 1**: Extend table listing API with filtering and sorting
2. **Day 2**: Add lobby WebSocket endpoint and message handlers
3. **Day 3**: Update GameTableDO to track and expose statistics

### Phase 2: Core Frontend (3-4 days)
1. **Day 1**: Set up lobby page structure and routing
2. **Day 2**: Implement TableList with virtual scrolling
3. **Day 3**: Create FilterPanel and TablePreview components
4. **Day 4**: Build CreateTableModal with multi-step wizard

### Phase 3: Integration (2 days)
1. **Day 1**: Connect WebSocket for real-time updates
2. **Day 2**: Implement state management and API integration

### Phase 4: Polish & Testing (2 days)
1. **Day 1**: Apply Full Tilt-inspired styling and animations
2. **Day 2**: Write tests and fix bugs

## Styling Guidelines

### Color Palette (Full Tilt Style)
```css
:root {
  --lobby-bg: #1a1a1a;
  --panel-bg: #242424;
  --border-color: #333;
  --text-primary: #fff;
  --text-secondary: #999;
  --accent-green: #4ade80;  /* Available seats */
  --accent-yellow: #facc15; /* Almost full */
  --accent-red: #ef4444;    /* Full table */
  --accent-blue: #3b82f6;   /* Selected/hover */
}
```

### Key UI Elements
- **Table rows**: Hover effect with subtle highlight
- **Player count**: Color-coded based on availability
- **Animations**: Smooth transitions for updates (200ms)
- **Modals**: Dark theme with backdrop blur

## Testing Checklist

### Unit Tests
- [ ] Filter logic for table listing
- [ ] Sorting functionality
- [ ] Create table form validation
- [ ] WebSocket message handling

### Integration Tests
- [ ] Table creation flow
- [ ] Real-time updates
- [ ] Filter persistence
- [ ] Navigation to game

### E2E Tests
- [ ] Complete lobby flow
- [ ] Table creation and join
- [ ] WebSocket reconnection
- [ ] Responsive behavior

## Performance Considerations

1. **Virtual Scrolling**: Use @tanstack/react-virtual for table list
2. **Debouncing**: 300ms debounce on filter changes
3. **Memoization**: Use React.memo for table rows
4. **WebSocket Optimization**: Batch updates, 5-second intervals
5. **Lazy Loading**: Load table preview on selection only

## Migration Notes

1. **Update app router**: Redirect to `/lobby` after login instead of `/multiplayer`
2. **Preserve existing flow**: Keep direct table creation for backward compatibility
3. **Database**: No schema changes needed, uses existing table structure
4. **Authentication**: Reuse existing JWT auth for WebSocket

## Deployment Considerations

1. **Environment Variables**:
   ```env
   NEXT_PUBLIC_WS_URL=wss://primo-poker-server.alabamamike.workers.dev
   ```

2. **Cloudflare Workers**: Update wrangler.toml to include lobby WebSocket route

3. **Edge Runtime**: Ensure lobby page uses Edge Runtime for Cloudflare Pages

## Questions to Resolve

1. **Table Limits**: Maximum tables to display? (Suggest: 500 with pagination)
2. **Update Frequency**: How often to refresh table stats? (Suggest: 5 seconds)
3. **Private Tables**: Show in lobby or hide? (Suggest: Hide by default)
4. **Table History**: Track recently played tables? (Future enhancement)

## Success Criteria

- [ ] Lobby loads in < 500ms
- [ ] Real-time updates work smoothly
- [ ] Table creation takes < 2 seconds
- [ ] Filters apply instantly (client-side)
- [ ] Mobile responsive design works
- [ ] No WebSocket connection drops

## Contact for Questions

If you have any questions about this implementation plan or need clarification on any aspect, please refer to the existing codebase patterns or create an issue in the repository.

Good luck with the implementation! This lobby will significantly enhance the user experience and provide a professional entry point to the Primo Poker platform.