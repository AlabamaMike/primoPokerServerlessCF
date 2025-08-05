import React, { useState } from 'react';
import { useLobbyStore } from '../../stores/lobby-store';

interface LobbyStatusBarProps {
  isWebSocketConnected?: boolean;
}

const LobbyStatusBar: React.FC<LobbyStatusBarProps> = ({ isWebSocketConnected = false }) => {
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const stats = useLobbyStore(state => state.stats);


  return (
    <div className="bg-gradient-to-t from-slate-800 to-slate-900 border-t border-purple-500/30 px-4 py-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center space-x-6 text-slate-400">
          <span>
            Online: <span className="text-emerald-400 font-semibold">{stats.playersOnline.toLocaleString()}</span>
          </span>
          <span>
            Tables: <span className="text-purple-400 font-semibold">{stats.activeTables}</span>
          </span>
          <span>
            In Play: <span className="text-amber-400 font-semibold">€{stats.totalPot.toLocaleString()}</span>
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-2 text-slate-400">
            <span className={`w-2 h-2 rounded-full ${
              isWebSocketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}></span>
            <span>{isWebSocketConnected ? 'Live' : 'Updating'}</span>
          </span>
          
          <select 
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs focus:border-purple-500 focus:outline-none transition-colors"
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
            <option value="pt">Português</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default LobbyStatusBar;