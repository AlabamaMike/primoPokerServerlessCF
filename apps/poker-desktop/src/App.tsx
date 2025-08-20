import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { testSafeInvoke } from "./utils/test-utils";
import ConnectionStatus from "./components/ConnectionStatus";
import LoginForm from "./components/LoginForm";
import Lobby from "./components/Lobby";
import LobbyV2 from "./components/LobbyV2";
import GamePage from "./components/GamePage";
import GameTableDemo from "./components/GameTableDemo";
import LobbyMockup from "./components/LobbyV2/LobbyMockup";
import PrimoLobbyMockup from "./components/LobbyV2/PrimoLobbyMockup";
import UpdateManager from "./components/UpdateManager";
import { useAuthStore } from "./stores/auth-store";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorToast, useToasts } from "./components/ErrorToast";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { useConnectionState } from "./hooks/useConnectionState";
import { offlineQueue } from "./services/offline-queue";
import "./App.css";

interface BackendStatus {
  connected: boolean;
  backend_url: string;
  latency_ms?: number;
}

const BACKEND_URL = import.meta.env.VITE_API_URL || "https://primo-poker-server.alabamamike.workers.dev";
const IS_TEST_MODE = import.meta.env.VITE_TEST_MODE === 'true';

function App() {
  const [connectionStatus, setConnectionStatus] = useState<BackendStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLobby, setShowLobby] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [showLobbyMockup, setShowLobbyMockup] = useState(false);
  const [currentTableId, setCurrentTableId] = useState<string | null>(null);
  const { user, isAuthenticated, checkAuth } = useAuthStore();
  const { toasts, removeToast, showError, showSuccess } = useToasts();

  useEffect(() => {
    // Check connection and auth on mount
    checkConnection();
    checkAuth();
    
    // Check connection every 30 seconds
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, [checkAuth]);

  async function checkConnection() {
    try {
      // In test mode, simulate a successful connection
      if (IS_TEST_MODE) {
        console.log('[Test Mode] Simulating successful connection');
        setConnectionStatus({
          connected: true,
          backend_url: BACKEND_URL,
          latency_ms: 100
        });
        setLoading(false);
        return true;
      }

      const status = await testSafeInvoke<BackendStatus>("check_backend_connection", {
        apiUrl: BACKEND_URL
      });
      setConnectionStatus(status);
      return status.connected;
    } catch (error) {
      console.error("Failed to check backend connection:", error);
      setConnectionStatus({
        connected: false,
        backend_url: BACKEND_URL
      });
      return false;
    } finally {
      setLoading(false);
    }
  }

  // Use connection state hook for advanced features
  const connectionState = useConnectionState(
    checkConnection,
    {
      checkInterval: 30000,
      onOffline: () => showError('Lost internet connection. Your actions will be saved offline.'),
      onOnline: () => showSuccess('Back online!'),
      onReconnect: () => {
        showSuccess('Reconnected to server');
        // TODO: Implement action handler for offline queue processing
        // For now, just notify the user if there are queued actions
        if (offlineQueue.getQueueSize() > 0) {
          showError(`${offlineQueue.getQueueSize()} offline actions pending. Manual sync may be required.`);
          // Future implementation would process the queue like this:
          // offlineQueue.processQueue(async (action, payload) => {
          //   // Handle different action types
          //   switch (action) {
          //     case 'join_table':
          //       return await joinTable(payload);
          //     case 'place_bet':
          //       return await placeBet(payload);
          //     default:
          //       throw new Error(`Unknown action: ${action}`);
          //   }
          // }).catch(err => {
          //   showError('Failed to sync some offline actions');
          // });
        }
      }
    }
  );

  return (
    <ErrorBoundary 
      level="app"
      onError={(error) => {
        console.error('App-level error:', error);
        showError(`Application error: ${error.message}`);
      }}
    >
      <div className="container">
        <OfflineIndicator 
          checkConnectionFn={checkConnection}
          position="top"
        />
        
        <ErrorToast 
          toasts={toasts}
          onDismiss={removeToast}
          position="top-right"
        />
        
        <h1 className="text-4xl font-bold text-white mb-8">🃏 Primo Poker Desktop</h1>
        
        <ConnectionStatus 
          status={connectionStatus} 
          loading={loading} 
          onRetry={checkConnection}
        />

      {connectionStatus?.connected && (
        <div className="mt-8">
          {!isAuthenticated ? (
            <LoginForm 
              apiUrl={BACKEND_URL} 
              onSuccess={() => {
                console.log('Login successful!');
                // Navigate to lobby after login
              }}
            />
          ) : showLobbyMockup ? (
            <ErrorBoundary level="page" fallback={
              <div className="text-center p-8">
                <p className="text-red-500">Failed to load lobby mockup</p>
                <button
                  onClick={() => setShowLobbyMockup(false)}
                  className="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
                >
                  Go Back
                </button>
              </div>
            }>
              <div className="fixed inset-0 z-50">
                <button
                  onClick={() => setShowLobbyMockup(false)}
                  className="absolute top-4 right-4 z-10 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Close Mockup
                </button>
                <PrimoLobbyMockup />
              </div>
            </ErrorBoundary>
          ) : showDemo ? (
            <div>
              <div className="mb-4">
                <button
                  onClick={() => setShowDemo(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ← Back to Main Menu
                </button>
              </div>
              <GameTableDemo />
            </div>
          ) : currentTableId ? (
            <ErrorBoundary 
              level="page"
              onError={(error) => {
                showError('Game error occurred. Please rejoin the table.');
                setCurrentTableId(null);
                setShowLobby(true);
              }}
            >
              <GamePage 
                tableId={currentTableId}
                onLeaveTable={() => {
                  setCurrentTableId(null);
                  setShowLobby(true);
                }}
              />
            </ErrorBoundary>
          ) : showLobby ? (
            <ErrorBoundary level="page">
              <div className="fixed inset-0 z-40">
                <LobbyV2 
                  apiUrl={BACKEND_URL} 
                  onJoinTable={(tableId) => {
                    setCurrentTableId(tableId);
                    setShowLobby(false);
                  }}
                />
                <button
                  onClick={() => setShowLobby(false)}
                  className="absolute top-4 right-20 z-50 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Exit Lobby
                </button>
              </div>
            </ErrorBoundary>
          ) : (
            <div className="authenticated-content" data-testid="authenticated-content">
              <div className="bg-black/50 border border-gray-600 rounded p-6">
                <h2 className="text-2xl font-bold text-white mb-4">
                  Welcome back{user?.name ? `, ${user.name}` : ''}!
                </h2>
                <p className="text-gray-300 mb-6">Ready to play some poker?</p>
                
                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowLobby(true)}
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-semibold transition-colors"
                    data-testid="play-button"
                  >
                    Play Now
                  </button>
                  <button 
                    onClick={() => setShowLobbyMockup(true)}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-semibold transition-colors"
                  >
                    New Lobby Design
                  </button>
                  <button 
                    onClick={() => setShowDemo(true)}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors"
                    data-testid="demo-button"
                  >
                    Table Demo
                  </button>
                  <button 
                    onClick={() => {
                      const oldLobby = window.confirm('View old lobby design?');
                      if (oldLobby) {
                        // Temporarily use old lobby
                        window.alert('Old lobby temporarily disabled. New design is now default.');
                      }
                    }}
                    className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-semibold transition-colors"
                  >
                    Old Lobby
                  </button>
                  <button 
                    onClick={() => useAuthStore.getState().logout()}
                    className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-semibold transition-colors"
                    data-testid="logout-button"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Update Manager - Always rendered to check for updates */}
      <UpdateManager />
    </div>
    </ErrorBoundary>
  );
}

export default App;