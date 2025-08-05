// Dynamic route for game tables
// This page handles multiplayer poker game sessions

import MultiplayerGameClient from './client-page'

export default function MultiplayerGamePage({ params }: { params: { tableId: string } }) {
  // Simple page without Edge Runtime - let Cloudflare Pages handle it
  return <MultiplayerGameClient tableId={params.tableId} />
}
