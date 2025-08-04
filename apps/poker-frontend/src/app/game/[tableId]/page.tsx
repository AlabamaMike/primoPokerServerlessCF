// Dynamic route for game tables

import MultiplayerGameClient from './client-page'

export default function MultiplayerGamePage({ params }: { params: { tableId: string } }) {
  return <MultiplayerGameClient tableId={params.tableId} />
}
