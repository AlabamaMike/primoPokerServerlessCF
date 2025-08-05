'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import the game client to ensure it only loads on the client
const MultiplayerGameClient = dynamic(() => import('./client-page'), {
  loading: () => (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900">
      <div className="flex items-center justify-center h-screen">
        <div className="text-white text-xl">Loading game...</div>
      </div>
    </div>
  ),
})

export default function GameWrapper({ tableId }: { tableId: string }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900">
        <div className="flex items-center justify-center h-screen">
          <div className="text-white text-xl">Initializing game table: {tableId}...</div>
        </div>
      </div>
    }>
      <MultiplayerGameClient tableId={tableId} />
    </Suspense>
  )
}