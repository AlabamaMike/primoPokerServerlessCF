import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import ConnectionStatus from "./components/ConnectionStatus";
import LoginForm from "./components/LoginForm";
import { useAuthStore } from "./stores/auth-store";
import "./App.css";

interface BackendStatus {
  connected: boolean;
  backend_url: string;
  latency_ms?: number;
}

const BACKEND_URL = import.meta.env.VITE_API_URL || "https://primo-poker-server.alabamamike.workers.dev";

function App() {
  const [connectionStatus, setConnectionStatus] = useState<BackendStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isAuthenticated, checkAuth } = useAuthStore();

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
      const status = await invoke<BackendStatus>("check_backend_connection", {
        apiUrl: BACKEND_URL
      });
      setConnectionStatus(status);
    } catch (error) {
      console.error("Failed to check backend connection:", error);
      setConnectionStatus({
        connected: false,
        backend_url: BACKEND_URL
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
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
          ) : (
            <div className="authenticated-content" data-testid="authenticated-content">
              <div className="bg-black/50 border border-gray-600 rounded p-6">
                <h2 className="text-2xl font-bold text-white mb-4">
                  Welcome back{user?.name ? `, ${user.name}` : ''}!
                </h2>
                <p className="text-gray-300 mb-6">Ready to play some poker?</p>
                
                <div className="flex gap-4">
                  <button 
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-semibold transition-colors"
                    data-testid="play-button"
                  >
                    Play Now
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
    </div>
  );
}

export default App;