'use client'

import React, { useState } from 'react'
import { useBankrollStore, Transaction } from '@/stores/bankroll-store'
import { ChevronDown, Wallet, TrendingUp, TrendingDown, DollarSign, Plus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DepositModal } from './DepositModal'

interface WalletDisplayProps {
  compact?: boolean
  showHistory?: boolean
}

export function WalletDisplay({ compact = false, showHistory = true }: WalletDisplayProps) {
  const { balance, transactions } = useBankrollStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)
  
  const formatAmount = (amount: number) => {
    const absAmount = Math.abs(amount)
    return `${amount >= 0 ? '+' : '-'}$${absAmount.toLocaleString()}`
  }
  
  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(timestamp).toLocaleDateString()
  }
  
  const getTransactionIcon = (type: Transaction['type']) => {
    switch (type) {
      case 'deposit':
      case 'cash_out':
        return <TrendingUp className="w-4 h-4 text-green-400" />
      case 'withdraw':
      case 'buy_in':
        return <TrendingDown className="w-4 h-4 text-red-400" />
      case 'win':
        return <DollarSign className="w-4 h-4 text-green-400" />
      case 'loss':
        return <DollarSign className="w-4 h-4 text-red-400" />
    }
  }
  
  if (compact) {
    return (
      <div className="relative">
        {/* Compact View Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] px-4 py-2 rounded-lg transition-colors"
          data-testid="wallet-display"
        >
          <Wallet className="w-4 h-4 text-[#4CAF50]" />
          <span className="font-bold text-white">
            ${balance.toLocaleString()}
          </span>
          {showHistory && (
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`} />
          )}
        </button>
        
        {/* Expanded Dropdown */}
        <AnimatePresence>
          {isExpanded && showHistory && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full mt-2 right-0 w-80 bg-[#2d2d2d] rounded-lg shadow-xl border border-[#3d3d3d] overflow-hidden z-50"
            >
              {/* Header */}
              <div className="p-4 border-b border-[#3d3d3d]">
                <h3 className="font-semibold text-white">Recent Transactions</h3>
              </div>
              
              {/* Transaction List */}
              <div className="max-h-64 overflow-y-auto">
                {transactions.length === 0 ? (
                  <div className="p-4 text-center text-gray-400">
                    No transactions yet
                  </div>
                ) : (
                  transactions.slice(0, 5).map((txn) => (
                    <div
                      key={txn.id}
                      className="flex items-center justify-between p-3 hover:bg-[#3d3d3d] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {getTransactionIcon(txn.type)}
                        <div>
                          <div className="text-sm text-white">{txn.description}</div>
                          <div className="text-xs text-gray-400">{formatTime(txn.timestamp)}</div>
                        </div>
                      </div>
                      <div className={`font-semibold ${
                        txn.amount >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatAmount(txn.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Footer */}
              <div className="p-3 border-t border-[#3d3d3d] space-y-2">
                <button
                  onClick={() => {
                    setShowDepositModal(true)
                    setIsExpanded(false)
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#4CAF50] hover:bg-[#45a049] text-white rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Chips
                </button>
                {transactions.length > 5 && (
                  <button className="w-full text-sm text-[#4CAF50] hover:text-[#45a049] transition-colors">
                    View All Transactions
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Deposit Modal */}
        <DepositModal 
          isOpen={showDepositModal} 
          onClose={() => setShowDepositModal(false)} 
        />
      </div>
    )
  }
  
  // Full view (not implemented in this phase)
  return (
    <div className="bg-[#2d2d2d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Wallet</h2>
        <Wallet className="w-6 h-6 text-[#4CAF50]" />
      </div>
      <div className="text-3xl font-bold text-white mb-4">
        ${balance.toLocaleString()}
      </div>
      {/* Transaction history would go here */}
    </div>
  )
}