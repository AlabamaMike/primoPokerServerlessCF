interface ConnectionStatusProps {
  status: {
    connected: boolean;
    backend_url: string;
    latency_ms?: number;
  } | null;
  loading: boolean;
  onRetry: () => void;
}

export default function ConnectionStatus({ status, loading, onRetry }: ConnectionStatusProps) {
  if (loading) {
    return (
      <div className="connection-status" data-testid="connection-status">
        <div className="flex items-center space-x-2">
          <div className="animate-spin h-4 w-4 border-2 border-yellow-400 border-t-transparent rounded-full"></div>
          <span className="text-yellow-400">Connecting to backend...</span>
        </div>
      </div>
    );
  }

  if (!status || !status.connected) {
    return (
      <div className="connection-status" data-testid="connection-status">
        <div className="flex items-center space-x-2">
          <div className="h-3 w-3 bg-red-500 rounded-full"></div>
          <span className="text-red-400">Disconnected</span>
          <button 
            onClick={onRetry}
            className="ml-4 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
          >
            Retry
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Backend: {status?.backend_url}</p>
      </div>
    );
  }

  return (
    <div className="connection-status" data-testid="connection-status">
      <div className="flex items-center space-x-2">
        <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-green-400">Connected</span>
        {status.latency_ms && (
          <span className="text-xs text-gray-500">({status.latency_ms}ms)</span>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1">Backend: {status.backend_url}</p>
    </div>
  );
}