import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LobbyV2 } from '../components/LobbyV2';
import { useLobbyStore } from '../stores/lobby-store';

// Enable test mode for demo
const apiUrl = 'https://primo-poker-server.alabamamike.workers.dev';

const LobbyDemo: React.FC = () => {
  const navigate = useNavigate();
  const { stats } = useLobbyStore();

  useEffect(() => {
    // Log lobby stats for verification
    console.log('Lobby Stats:', stats);
  }, [stats]);

  const handleJoinTable = (tableId: string) => {
    console.log('Joining table:', tableId);
    // In a real app, this would navigate to the game page
    navigate(`/game/${tableId}`);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-2xl mx-auto p-4">
        <div className="mb-4 bg-slate-800 rounded-lg p-4 border border-purple-500/20">
          <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent mb-2">
            Primo Poker Lobby Demo
          </h2>
          <p className="text-slate-400 text-sm mb-3">
            This is a demonstration of the new Primo Poker lobby with real-time updates and cultural design elements.
          </p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="bg-slate-900 rounded p-3">
              <div className="text-slate-400 mb-1">Connection Status</div>
              <div className="text-emerald-400 font-medium">Connected ✓</div>
            </div>
            <div className="bg-slate-900 rounded p-3">
              <div className="text-slate-400 mb-1">API Mode</div>
              <div className="text-amber-400 font-medium">Test Mode</div>
            </div>
            <div className="bg-slate-900 rounded p-3">
              <div className="text-slate-400 mb-1">WebSocket</div>
              <div className="text-purple-400 font-medium">Real-time Updates</div>
            </div>
          </div>
        </div>

        <LobbyV2 apiUrl={apiUrl} onJoinTable={handleJoinTable} />

        <div className="mt-4 bg-slate-800 rounded-lg p-4 border border-purple-500/20">
          <h3 className="font-semibold mb-2">Feature Highlights</h3>
          <ul className="text-sm text-slate-400 space-y-1">
            <li>✓ Purple/Gold gradient design system for Asian/European appeal</li>
            <li>✓ Real-time table updates via WebSocket</li>
            <li>✓ Advanced multi-level filtering system</li>
            <li>✓ Sortable columns with visual indicators</li>
            <li>✓ Favorites system with localStorage persistence</li>
            <li>✓ Lucky number displays and cultural elements</li>
            <li>✓ Responsive design with glassmorphism effects</li>
            <li>✓ Quick join and waitlist functionality</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default LobbyDemo;