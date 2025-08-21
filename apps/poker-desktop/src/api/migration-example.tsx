/**
 * Migration Example: Converting existing code to use the type-safe API client
 * 
 * This file demonstrates how to migrate from the old fetch-based approach
 * to the new type-safe API client.
 */

import React, { useEffect, useState } from 'react'
import { api } from './endpoints'
import { useApiQuery, useApiMutation } from './hooks'
import { useAuthStore } from '../stores/auth-store'

// ========================================
// OLD APPROACH - Direct fetch calls
// ========================================
function OldProfileComponent() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const token = useAuthStore(state => state.token)

  useEffect(() => {
    async function fetchProfile() {
      try {
        setLoading(true)
        const response = await fetch('https://api.example.com/api/players/profile', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        
        const result = await response.json()
        setProfile(result.data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    
    fetchProfile()
  }, [token])

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  
  return <div>{profile?.username}</div>
}

// ========================================
// NEW APPROACH - Type-safe API client
// ========================================
function NewProfileComponent() {
  // Using the typed endpoint directly
  const { data: profile, isLoading, error, refetch } = useApiQuery(
    api.player.getProfile,
    [],
    { 
      refetchInterval: 30000, // Auto-refetch every 30 seconds
      refetchOnWindowFocus: true 
    }
  )

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.userMessage}</div>
  
  return (
    <div>
      <h2>{profile?.username}</h2>
      <p>Balance: ${profile?.balance}</p>
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}

// ========================================
// OLD APPROACH - Form submission
// ========================================
function OldDepositForm() {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const token = useAuthStore(state => state.token)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('https://api.example.com/api/wallet/deposit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          method: 'credit_card'
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Deposit failed')
      }
      
      const result = await response.json()
      alert(`Success! New balance: $${result.data.newBalance}`)
      setAmount('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount"
      />
      {error && <div>Error: {error}</div>}
      <button type="submit" disabled={loading}>
        {loading ? 'Processing...' : 'Deposit'}
      </button>
    </form>
  )
}

// ========================================
// NEW APPROACH - Type-safe mutations
// ========================================
function NewDepositForm() {
  const [amount, setAmount] = useState('')
  
  const { mutate, isLoading, error } = useApiMutation(
    api.wallet.deposit,
    {
      onSuccess: (data) => {
        alert(`Success! New balance: $${data.newBalance}`)
        setAmount('')
      },
      onError: (error) => {
        // Type-safe error handling with proper error types
        if (error.code === 'VALIDATION_FAILED') {
          console.error('Validation error:', error.details)
        }
      }
    }
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Type-safe mutation - TypeScript knows the exact shape needed
    await mutate({
      amount: parseFloat(amount),
      method: 'credit_card' // TypeScript enforces valid values
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount"
        min="1"
        step="0.01"
      />
      {error && (
        <div className="error">
          {/* User-friendly error message */}
          {error.userMessage}
        </div>
      )}
      <button type="submit" disabled={isLoading || !amount}>
        {isLoading ? 'Processing...' : 'Deposit'}
      </button>
    </form>
  )
}

// ========================================
// Advanced example with optimistic updates
// ========================================
function OptimisticTableJoin() {
  const currentBalance = 1000 // From user store
  
  const { mutate, isLoading, error, optimisticData } = useOptimisticMutation(
    (args: { tableId: string; buyIn: number }) => 
      api.table.joinTable({ buyIn: args.buyIn }, { 
        params: { tableId: args.tableId } 
      }),
    {
      optimisticUpdate: ([{ buyIn }]) => ({
        message: 'Joining table...',
        seat: -1, // Temporary seat number
        tempBalance: currentBalance - buyIn
      }),
      rollbackOnError: true
    }
  )

  const handleJoinTable = (tableId: string, buyIn: number) => {
    mutate({ tableId, buyIn })
  }

  // Show optimistic state immediately
  if (optimisticData) {
    return <div>Joining table... Balance: ${optimisticData.tempBalance}</div>
  }

  return (
    <button 
      onClick={() => handleJoinTable('table-123', 100)}
      disabled={isLoading}
    >
      Join Table ($100 buy-in)
    </button>
  )
}

// ========================================
// Error boundary integration
// ========================================
function GameActionWithErrorBoundary() {
  const { mutate, error } = useApiMutation(
    api.game.performAction,
    {
      retry: false, // Don't retry game actions
      onError: (error) => {
        // Handle specific game errors
        switch (error.code) {
          case 'PLAYER_NOT_IN_TURN':
            // Show "not your turn" UI
            break
          case 'BET_BELOW_MINIMUM':
            // Show minimum bet requirement
            break
          case 'PLAYER_INSUFFICIENT_FUNDS':
            // Show insufficient funds dialog
            break
          default:
            // Generic error handling
            console.error('Game error:', error)
        }
      }
    }
  )

  const performAction = (tableId: string, action: 'fold' | 'check' | 'raise', amount?: number) => {
    mutate(
      { action, amount },
      { params: { tableId } }
    )
  }

  return (
    <div>
      <button onClick={() => performAction('table-1', 'fold')}>Fold</button>
      <button onClick={() => performAction('table-1', 'check')}>Check</button>
      <button onClick={() => performAction('table-1', 'raise', 50)}>Raise $50</button>
      
      {error && (
        <div className="error-message">
          {error.userMessage}
        </div>
      )}
    </div>
  )
}

// ========================================
// Batch operations example
// ========================================
function BatchOperationsExample() {
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  
  const { mutate: banPlayers, isLoading } = useApiMutation(
    async (playerIds: string[]) => {
      // Type-safe batch operations
      const actions = playerIds.map(playerId => ({
        playerId,
        type: 'BAN' as const,
        reason: 'Multiple violations',
        duration: 86400000 // 24 hours
      }))
      
      return api.admin.bulkApplyActions({ actions })
    },
    {
      onSuccess: () => {
        alert(`Banned ${selectedPlayers.length} players`)
        setSelectedPlayers([])
      }
    }
  )

  return (
    <button 
      onClick={() => banPlayers(selectedPlayers)}
      disabled={isLoading || selectedPlayers.length === 0}
    >
      Ban Selected Players ({selectedPlayers.length})
    </button>
  )
}