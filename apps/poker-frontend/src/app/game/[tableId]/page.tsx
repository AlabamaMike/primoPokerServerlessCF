// Dynamic route for game tables

import MultiplayerGameClient from './client-page'

// Next.js 15 requires async params for dynamic routes
export default async function MultiplayerGamePage({ 
  params 
}: { 
  params: Promise<{ tableId: string }> 
}) {
  const { tableId } = await params
  return <MultiplayerGameClient tableId={tableId} />
}
