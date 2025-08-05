// Dynamic route for game tables
// This page handles multiplayer poker game sessions

import dynamic from 'next/dynamic'

// Required for Cloudflare Pages - all dynamic routes must use Edge Runtime
export const runtime = 'edge'

// Dynamic import with no SSR to ensure Edge compatibility
const GameWrapper = dynamic(() => import('./game-wrapper'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900">
      <div className="flex items-center justify-center h-screen">
        <div className="text-white text-xl">Preparing game...</div>
      </div>
    </div>
  ),
})

export default function MultiplayerGamePage({ params }: { params: { tableId: string } }) {
  // Edge-compatible page using dynamic imports
  return <GameWrapper tableId={params.tableId} />
}
