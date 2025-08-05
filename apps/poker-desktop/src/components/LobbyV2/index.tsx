import React, { useEffect, useState } from 'react';
import LobbyHeader from './LobbyHeader';
import LobbyContent from './LobbyContent';
import LobbyStatusBar from './LobbyStatusBar';
import QuickSeatModal from './QuickSeatModal';
import WaitlistPanel from './WaitlistPanel';
import { WaitlistNotificationManager } from './WaitlistNotification';
import { useLobbyStore } from '../../stores/lobby-store';
import { useLobbyWebSocket } from '../../hooks/useLobbyWebSocket';

interface LobbyV2Props {
  apiUrl: string;
  onJoinTable?: (tableId: string) => void;
}

const LobbyV2: React.FC<LobbyV2Props> = ({ apiUrl, onJoinTable }) => {
  const { fetchTables, fetchStats } = useLobbyStore();
  const [showQuickSeat, setShowQuickSeat] = useState(false);
  
  // Enable WebSocket for real-time updates
  const { isConnected } = useLobbyWebSocket({
    url: apiUrl,
    enabled: true
  });

  // Initial data fetch
  useEffect(() => {
    fetchTables(apiUrl);
    fetchStats(apiUrl);
    
    // Refresh tables every 30 seconds as fallback
    const interval = setInterval(() => {
      fetchTables(apiUrl);
      fetchStats(apiUrl);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [apiUrl, fetchTables, fetchStats]);

  const handleQuickSeatFound = (tableId: string) => {
    if (onJoinTable) {
      onJoinTable(tableId);
    }
  };

  return (
    <div className="h-screen bg-slate-900 text-slate-50 flex flex-col">
      <LobbyHeader onQuickSeat={() => setShowQuickSeat(true)} />
      <LobbyContent apiUrl={apiUrl} onJoinTable={onJoinTable} />
      <LobbyStatusBar isWebSocketConnected={isConnected} />
      
      <QuickSeatModal
        isOpen={showQuickSeat}
        onClose={() => setShowQuickSeat(false)}
        onSeatFound={handleQuickSeatFound}
        apiUrl={apiUrl}
      />
      
      <WaitlistPanel
        apiUrl={apiUrl}
        onJoinTable={onJoinTable || (() => {})}
      />
      
      <WaitlistNotificationManager
        onJoinTable={onJoinTable}
      />
    </div>
  );
};

export default LobbyV2;