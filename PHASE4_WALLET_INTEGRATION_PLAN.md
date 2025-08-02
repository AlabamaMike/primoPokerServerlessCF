# Phase 4: Wallet Integration

## Overview
Create a comprehensive wallet/bankroll UI that gives players visibility and control over their chip balance across the platform.

## Current State
- Bankroll store exists with persistence
- Chips are added/removed when joining/leaving tables
- No UI to view balance outside of buy-in modal
- No transaction history

## Target Features
1. **Wallet Display Component**
   - Always visible balance indicator
   - Quick view of recent transactions
   - Visual feedback for balance changes

2. **Transaction History**
   - Track all chip movements
   - Buy-ins, cash-outs, wins, losses
   - Timestamps and table references

3. **Deposit/Withdraw UI**
   - Mock interface for adding chips
   - Simulate real money integration
   - Clear limits and controls

4. **Balance Animations**
   - Smooth transitions on balance changes
   - Highlight wins with green
   - Show losses with red

## Implementation Tasks

### 1. Wallet Display Component
**File**: `apps/poker-frontend/src/components/WalletDisplay.tsx`

```typescript
interface WalletDisplayProps {
  compact?: boolean
  showHistory?: boolean
}

export function WalletDisplay({ compact = false, showHistory = false }: WalletDisplayProps) {
  const { balance, transactions } = useBankrollStore()
  const [isExpanded, setIsExpanded] = useState(false)
  
  return (
    <div className="relative">
      {/* Compact View */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 bg-[#2d2d2d] px-4 py-2 rounded-lg"
      >
        <Wallet className="w-4 h-4 text-[#4CAF50]" />
        <span className="font-bold text-white">
          ${balance.toLocaleString()}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${
          isExpanded ? 'rotate-180' : ''
        }`} />
      </button>
      
      {/* Expanded View */}
      {isExpanded && (
        <div className="absolute top-full mt-2 right-0 w-80 bg-[#2d2d2d] rounded-lg shadow-xl">
          <TransactionHistory transactions={transactions.slice(0, 5)} />
          <button className="w-full p-3 text-[#4CAF50] hover:bg-[#3d3d3d]">
            View Full History
          </button>
        </div>
      )}
    </div>
  )
}
```

### 2. Transaction Tracking
**File**: `apps/poker-frontend/src/stores/bankroll-store.ts`

Update store to track transactions:
```typescript
interface Transaction {
  id: string
  type: 'deposit' | 'withdraw' | 'buy_in' | 'cash_out' | 'win' | 'loss'
  amount: number
  balance: number // Balance after transaction
  timestamp: number
  tableId?: string
  description: string
}

interface BankrollState {
  balance: number
  transactions: Transaction[]
  lastUpdated: number
  
  // Actions
  addTransaction: (transaction: Omit<Transaction, 'id' | 'timestamp' | 'balance'>) => void
}
```

### 3. Header Integration
**File**: `apps/poker-frontend/src/app/game/[tableId]/client-page.tsx`

Add wallet to header:
```typescript
<header className="bg-[#2d2d2d] px-5 py-3 border-b-2 border-[#3d3d3d]">
  <div className="max-w-7xl mx-auto flex justify-between items-center">
    <div className="flex items-center gap-6">
      {/* Existing table info */}
    </div>
    
    <div className="flex items-center gap-4">
      <WalletDisplay compact />
      {/* Existing buttons */}
    </div>
  </div>
</header>
```

### 4. Deposit/Withdraw Modal
**File**: `apps/poker-frontend/src/components/DepositModal.tsx`

```typescript
export function DepositModal({ isOpen, onClose }: ModalProps) {
  const [amount, setAmount] = useState(1000)
  const { addChips, addTransaction } = useBankrollStore()
  
  const handleDeposit = () => {
    addChips(amount)
    addTransaction({
      type: 'deposit',
      amount,
      description: 'Added chips to bankroll'
    })
    onClose()
  }
  
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2>Add Chips to Bankroll</h2>
      <p className="text-gray-400 mb-4">
        This is a demo. In production, this would connect to a payment processor.
      </p>
      
      {/* Quick amounts */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[100, 500, 1000, 5000].map(value => (
          <button
            key={value}
            onClick={() => setAmount(value)}
            className={`p-2 rounded ${
              amount === value ? 'bg-[#4CAF50]' : 'bg-[#3d3d3d]'
            }`}
          >
            ${value}
          </button>
        ))}
      </div>
      
      {/* Custom amount */}
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="w-full p-3 bg-[#1a1a1a] rounded"
      />
      
      <button
        onClick={handleDeposit}
        className="w-full mt-4 p-3 bg-[#4CAF50] rounded"
      >
        Add ${amount} to Bankroll
      </button>
    </Modal>
  )
}
```

### 5. Balance Change Animations
**File**: `apps/poker-frontend/src/components/BalanceChange.tsx`

```typescript
export function BalanceChange({ change, show }: { change: number, show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className={`absolute -top-8 right-0 font-bold ${
            change > 0 ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {change > 0 ? '+' : ''}{change}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

## Visual Design
- Dark theme consistent with poker table
- Green accent for positive actions
- Red for losses/negative actions
- Smooth animations for all transitions
- Clear typography for amounts

## Testing Scenarios
- [ ] Wallet balance visible on all pages
- [ ] Balance updates when joining table
- [ ] Balance updates when standing up
- [ ] Transaction history shows all movements
- [ ] Deposit modal adds chips correctly
- [ ] Animations play on balance changes
- [ ] Persistence works across sessions

## Future Enhancements
- Real payment integration
- Withdrawal to crypto/fiat
- Bonus chips system
- Loyalty rewards
- Tournament buy-ins
- Multi-currency support