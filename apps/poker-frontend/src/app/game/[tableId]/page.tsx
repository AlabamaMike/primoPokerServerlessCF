// Configure dynamic paths for game tables
export const dynamic = 'force-dynamic'
export const revalidate = 0

import MultiplayerGameClient from './client-page'

export default async function MultiplayerGamePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params
  return <MultiplayerGameClient tableId={tableId} />
}
