import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BankrollState {
  balance: number
  lastUpdated: number
  
  // Actions
  setBalance: (amount: number) => void
  addChips: (amount: number) => void
  removeChips: (amount: number) => void
  reset: () => void
}

const DEFAULT_BALANCE = 10000 // Default starting bankroll

export const useBankrollStore = create<BankrollState>()(
  persist(
    (set) => ({
      balance: DEFAULT_BALANCE,
      lastUpdated: Date.now(),
      
      setBalance: (amount) => set({
        balance: amount,
        lastUpdated: Date.now()
      }),
      
      addChips: (amount) => set((state) => ({
        balance: state.balance + amount,
        lastUpdated: Date.now()
      })),
      
      removeChips: (amount) => set((state) => ({
        balance: Math.max(0, state.balance - amount),
        lastUpdated: Date.now()
      })),
      
      reset: () => set({
        balance: DEFAULT_BALANCE,
        lastUpdated: Date.now()
      })
    }),
    {
      name: 'bankroll-storage'
    }
  )
)