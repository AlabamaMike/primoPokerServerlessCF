// Generate static paths for some common table IDs, allow dynamic ones
export async function generateStaticParams() {
  // Return some demo table IDs to be pre-generated
  // Dynamic table IDs will still work with fallback
  return [
    { tableId: 'demo-table-1' },
    { tableId: 'demo-table-2' },
    { tableId: 'demo-table-3' },
  ]
}

import MultiplayerGameClient from './client-page'

export default async function MultiplayerGamePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params
  return <MultiplayerGameClient tableId={tableId} />
}
