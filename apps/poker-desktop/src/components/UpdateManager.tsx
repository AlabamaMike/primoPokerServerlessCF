import React, { useEffect, useState } from 'react';
import { checkUpdate, installUpdate, onUpdaterEvent } from '@tauri-apps/api/updater';
import { relaunch } from '@tauri-apps/api/process';
import { listen } from '@tauri-apps/api/event';

interface UpdateInfo {
  version: string;
  date: string;
  body: string;
}

const UpdateManager: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    checkForUpdates();
    
    // Set up update event listeners
    const setupListeners = async () => {
      const unlistenDownloadStarted = await onUpdaterEvent(({ error, status }) => {
        if (error) {
          setError(error);
          setDownloading(false);
        } else if (status === 'PENDING') {
          setDownloading(true);
          setError(null);
        }
      });

      const unlistenDownloadProgress = await listen('tauri://update-download-progress', (event: any) => {
        const { chunkLength, contentLength } = event.payload;
        if (contentLength) {
          const progress = Math.round((chunkLength / contentLength) * 100);
          setDownloadProgress(progress);
        }
      });

      const unlistenUpdateReady = await onUpdaterEvent(({ error, status }) => {
        if (status === 'DONE') {
          setDownloading(false);
          setInstalling(true);
        }
      });

      return () => {
        unlistenDownloadStarted();
        unlistenDownloadProgress();
        unlistenUpdateReady();
      };
    };

    setupListeners();
  }, []);

  const checkForUpdates = async () => {
    try {
      const { shouldUpdate, manifest } = await checkUpdate();
      
      if (shouldUpdate && manifest) {
        setUpdateAvailable(true);
        setUpdateInfo({
          version: manifest.version,
          date: manifest.date,
          body: manifest.body || 'A new version is available!'
        });
        setShowNotification(true);
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const handleUpdate = async () => {
    try {
      setError(null);
      setDownloading(true);
      
      // Install the update
      await installUpdate();
      
      // Relaunch the app
      await relaunch();
    } catch (error: any) {
      setError(error.toString());
      setDownloading(false);
      setInstalling(false);
    }
  };

  const dismissNotification = () => {
    setShowNotification(false);
  };

  if (!updateAvailable || !showNotification) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className="bg-slate-800 rounded-lg shadow-2xl border border-purple-500/30 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-amber-600 px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center space-x-2">
            <span>🎉</span>
            <span>Update Available!</span>
          </h3>
          <button
            onClick={dismissNotification}
            className="text-white/80 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="mb-4">
            <div className="text-sm text-slate-400 mb-1">New Version</div>
            <div className="text-lg font-semibold text-white">{updateInfo?.version}</div>
          </div>

          {updateInfo?.body && (
            <div className="mb-4">
              <div className="text-sm text-slate-400 mb-1">What's New</div>
              <div className="text-sm text-slate-300 max-h-32 overflow-y-auto">
                {updateInfo.body}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Progress */}
          {downloading && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-400">Downloading update...</span>
                <span className="text-amber-400 font-medium">{downloadProgress}%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-amber-500 transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          )}

          {installing && (
            <div className="mb-4 text-center">
              <div className="text-amber-400 animate-pulse">Installing update...</div>
              <div className="text-sm text-slate-400 mt-1">The app will restart automatically</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={dismissNotification}
              className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              disabled={downloading || installing}
            >
              Later
            </button>
            <button
              onClick={handleUpdate}
              disabled={downloading || installing}
              className="flex-1 py-2 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white rounded-lg font-medium transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? 'Downloading...' : installing ? 'Installing...' : 'Update Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateManager;