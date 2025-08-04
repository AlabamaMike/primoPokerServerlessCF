// Dynamic route for game tables

import MultiplayerGameClient from './client-page'

// Required for Cloudflare Pages deployment
export const runtime = 'edge'

export default async function MultiplayerGamePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params
  return <MultiplayerGameClient tableId={tableId} />
}
