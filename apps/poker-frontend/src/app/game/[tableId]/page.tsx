// Dynamic route for game tables

import MultiplayerGameClient from './client-page'

export default async function MultiplayerGamePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params
  return <MultiplayerGameClient tableId={tableId} />
}
