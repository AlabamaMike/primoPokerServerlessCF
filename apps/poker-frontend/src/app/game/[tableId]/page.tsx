// Dynamic route for game tables
// This page handles multiplayer poker game sessions

import dynamic from 'next/dynamic'

// Dynamically import the client component with no SSR
const MultiplayerGameClient = dynamic(() => import('./client-page'), {
  ssr: false,
  loading: () => <div>Loading game...</div>
})

// Required for Cloudflare Pages deployment
export const runtime = 'edge'

export default function MultiplayerGamePage({ params }: { params: { tableId: string } }) {
  return <MultiplayerGameClient tableId={params.tableId} />
}
