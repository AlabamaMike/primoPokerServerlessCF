'use client'

import React from 'react'

interface StandUpModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  chipCount: number
  isStandingUp?: boolean
}

export function StandUpModal({
  isOpen,
  onClose,
  onConfirm,
  chipCount,
  isStandingUp = false
}: StandUpModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2d2d2d] rounded-lg max-w-md w-full border border-[#3d3d3d]">
        {/* Header */}
        <div className="p-6 border-b border-[#3d3d3d]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Stand Up from Table?</h2>
            <button 
              onClick={onClose}
              disabled={isStandingUp}
              className="text-gray-400 hover:text-white text-2xl disabled:opacity-50"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-6">
            <p className="text-gray-300 mb-4">
              Are you sure you want to stand up from the table?
            </p>
            
            <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#3d3d3d]">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Your chips:</span>
                <span className="text-2xl font-bold text-[#4CAF50]">
                  ${chipCount.toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                These chips will be returned to your bankroll
              </p>
            </div>
          </div>

          <div className="bg-orange-900/20 border border-orange-600/30 rounded-lg p-3 mb-6">
            <p className="text-orange-400 text-sm">
              <strong>Note:</strong> You cannot stand up during an active hand. 
              Your seat will become available for other players.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isStandingUp}
              className="flex-1 px-4 py-3 bg-[#3d3d3d] hover:bg-[#4d4d4d] disabled:bg-[#2d2d2d] text-white rounded transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isStandingUp}
              className={`flex-1 px-6 py-3 rounded font-medium transition-colors ${
                isStandingUp
                  ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              }`}
            >
              {isStandingUp ? 'Standing Up...' : 'Stand Up'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}