import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Transaction {
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
  setBalance: (amount: number) => void
  addChips: (amount: number, description?: string, tableId?: string) => void
  removeChips: (amount: number, description?: string, tableId?: string) => void
  addTransaction: (transaction: Omit<Transaction, 'id' | 'timestamp' | 'balance'>) => void
  reset: () => void
}

const DEFAULT_BALANCE = 10000 // Default starting bankroll

export const useBankrollStore = create<BankrollState>()(
  persist(
    (set, get) => ({
      balance: DEFAULT_BALANCE,
      transactions: [],
      lastUpdated: Date.now(),
      
      setBalance: (amount) => set({
        balance: amount,
        lastUpdated: Date.now()
      }),
      
      addChips: (amount, description = 'Added chips', tableId) => set((state) => {
        const newBalance = state.balance + amount
        const transaction: Transaction = {
          id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: tableId ? 'cash_out' : 'deposit',
          amount,
          balance: newBalance,
          timestamp: Date.now(),
          tableId,
          description
        }
        
        return {
          balance: newBalance,
          transactions: [transaction, ...state.transactions].slice(0, 100), // Keep last 100
          lastUpdated: Date.now()
        }
      }),
      
      removeChips: (amount, description = 'Removed chips', tableId) => set((state) => {
        const newBalance = Math.max(0, state.balance - amount)
        const transaction: Transaction = {
          id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: tableId ? 'buy_in' : 'withdraw',
          amount: -amount,
          balance: newBalance,
          timestamp: Date.now(),
          tableId,
          description
        }
        
        return {
          balance: newBalance,
          transactions: [transaction, ...state.transactions].slice(0, 100),
          lastUpdated: Date.now()
        }
      }),
      
      addTransaction: (transaction) => set((state) => {
        const fullTransaction: Transaction = {
          ...transaction,
          id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          balance: state.balance
        }
        
        return {
          transactions: [fullTransaction, ...state.transactions].slice(0, 100)
        }
      }),
      
      reset: () => set({
        balance: DEFAULT_BALANCE,
        transactions: [],
        lastUpdated: Date.now()
      })
    }),
    {
      name: 'bankroll-storage'
    }
  )
)