// Dynamic route for game tables
// This page handles multiplayer poker game sessions

// Required for Cloudflare Pages - all dynamic routes must use Edge Runtime
export const runtime = 'edge'

export default function MultiplayerGamePage({ params }: { params: { tableId: string } }) {
  // Simple Edge-compatible page that provides table ID to client
  // The actual game will be loaded client-side
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900">
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">🃏 Primo Poker</h1>
          <p className="text-white text-xl mb-2">Loading Table: {params.tableId}</p>
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
      </div>
      {/* Hidden element to pass table ID to client-side code */}
      <div id="game-table-id" data-table-id={params.tableId} style={{ display: 'none' }} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // Store table ID globally for client components
            window.__POKER_TABLE_ID__ = ${JSON.stringify(params.tableId)};
          `,
        }}
      />
    </div>
  )
}
