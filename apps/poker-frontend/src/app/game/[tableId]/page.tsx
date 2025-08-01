// Generate static paths for known table IDs
export async function generateStaticParams() {
  // Return some common table IDs - these will be dynamically handled anyway
  return [
    { tableId: 'demo-table-1' },
    { tableId: 'demo-table-2' },
    { tableId: 'demo-table-3' },
    { tableId: 'table-1' },
    { tableId: 'table-2' },
    { tableId: 'table-3' },
  ]
}

import MultiplayerGameClient from './client-page'

export default async function MultiplayerGamePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params
  return <MultiplayerGameClient tableId={tableId} />
}
