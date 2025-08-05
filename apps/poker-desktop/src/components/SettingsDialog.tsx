import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { checkUpdate } from '@tauri-apps/api/updater';
import { getVersion } from '@tauri-apps/api/app';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UpdateSettings {
  autoCheck: boolean;
  autoDownload: boolean;
  checkInterval: number; // hours
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'updates' | 'about'>('general');
  const [appVersion, setAppVersion] = useState('');
  const [updateSettings, setUpdateSettings] = useState<UpdateSettings>({
    autoCheck: true,
    autoDownload: false,
    checkInterval: 24
  });
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadAppVersion();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    // Load settings from localStorage or backend
    const saved = localStorage.getItem('primo-poker-update-settings');
    if (saved) {
      setUpdateSettings(JSON.parse(saved));
    }
  };

  const loadAppVersion = async () => {
    try {
      const version = await getVersion();
      setAppVersion(version);
    } catch (error) {
      console.error('Failed to get app version:', error);
      setAppVersion('Unknown');
    }
  };

  const saveSettings = () => {
    localStorage.setItem('primo-poker-update-settings', JSON.stringify(updateSettings));
    onClose();
  };

  const checkForUpdatesNow = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);

    try {
      const { shouldUpdate, manifest } = await checkUpdate();
      
      if (shouldUpdate && manifest) {
        setUpdateStatus(`Update available: v${manifest.version}`);
      } else {
        setUpdateStatus('You have the latest version!');
      }
    } catch (error) {
      setUpdateStatus('Failed to check for updates');
      console.error('Update check failed:', error);
    } finally {
      setCheckingUpdate(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl border border-purple-500/20">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-amber-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-700 px-6">
          <div className="flex space-x-6">
            <button
              onClick={() => setActiveTab('general')}
              className={`py-3 px-1 border-b-2 font-medium transition-colors ${
                activeTab === 'general'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab('updates')}
              className={`py-3 px-1 border-b-2 font-medium transition-colors ${
                activeTab === 'updates'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              Updates
            </button>
            <button
              onClick={() => setActiveTab('about')}
              className={`py-3 px-1 border-b-2 font-medium transition-colors ${
                activeTab === 'about'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              About
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">General Settings</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Sound Effects</div>
                      <div className="text-sm text-slate-400">Play sounds for game actions</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Animations</div>
                      <div className="text-sm text-slate-400">Enable smooth animations</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Four Color Deck</div>
                      <div className="text-sm text-slate-400">Use four colors for card suits</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'updates' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Update Settings</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Auto-check for updates</div>
                      <div className="text-sm text-slate-400">Check for updates on startup</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={updateSettings.autoCheck}
                        onChange={(e) => setUpdateSettings({ ...updateSettings, autoCheck: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Auto-download updates</div>
                      <div className="text-sm text-slate-400">Download updates in the background</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={updateSettings.autoDownload}
                        onChange={(e) => setUpdateSettings({ ...updateSettings, autoDownload: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  <div>
                    <div className="font-medium mb-2">Check interval</div>
                    <select 
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                      value={updateSettings.checkInterval}
                      onChange={(e) => setUpdateSettings({ ...updateSettings, checkInterval: parseInt(e.target.value) })}
                    >
                      <option value="1">Every hour</option>
                      <option value="6">Every 6 hours</option>
                      <option value="12">Every 12 hours</option>
                      <option value="24">Once a day</option>
                      <option value="168">Once a week</option>
                    </select>
                  </div>

                  <div className="pt-4 border-t border-slate-700">
                    <button
                      onClick={checkForUpdatesNow}
                      disabled={checkingUpdate}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {checkingUpdate ? 'Checking...' : 'Check for Updates Now'}
                    </button>
                    
                    {updateStatus && (
                      <div className={`mt-3 p-3 rounded-lg text-sm ${
                        updateStatus.includes('available') 
                          ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400'
                          : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                      }`}>
                        {updateStatus}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30">
                  <span className="text-white font-bold text-4xl">P</span>
                </div>
                
                <h3 className="text-2xl font-bold mb-2">Primo Poker Desktop</h3>
                <div className="text-lg text-slate-400 mb-6">Version {appVersion}</div>
                
                <div className="space-y-2 text-sm text-slate-400">
                  <p>© 2025 Primo Poker. All rights reserved.</p>
                  <p>Built with Tauri, React, and TypeScript</p>
                </div>
                
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <div className="space-y-3">
                    <a href="#" className="block text-purple-400 hover:text-purple-300 transition-colors">
                      Terms of Service
                    </a>
                    <a href="#" className="block text-purple-400 hover:text-purple-300 transition-colors">
                      Privacy Policy
                    </a>
                    <a href="#" className="block text-purple-400 hover:text-purple-300 transition-colors">
                      Support
                    </a>
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-slate-900/50 rounded-lg">
                  <div className="text-xs text-slate-500">
                    This software is licensed under the Primo Poker EULA.
                    By using this software, you agree to the terms and conditions.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 px-6 py-4 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={saveSettings}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white rounded-lg font-medium transition-all transform hover:scale-105"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;