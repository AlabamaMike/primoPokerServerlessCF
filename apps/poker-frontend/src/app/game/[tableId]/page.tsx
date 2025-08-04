// Dynamic route for game tables

import MultiplayerGameClient from './client-page'

// Required for Cloudflare Pages deployment
export const runtime = 'edge'

export default function MultiplayerGamePage({ params }: { params: { tableId: string } }) {
  return <MultiplayerGameClient tableId={params.tableId} />
}
