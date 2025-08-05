import React from 'react';

/**
 * Primo Poker Lobby - Unique design for Asian and European markets
 * Features purple/gold color scheme with cultural considerations
 */
const PrimoLobbyMockup: React.FC = () => {
  return (
    <div className="h-screen bg-slate-900 text-slate-50 flex flex-col">
      {/* Top Navigation Bar with gradient */}
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 border-b border-purple-500/30 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            {/* Logo Area */}
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-amber-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">P</span>
              </div>
              <span className="text-xl font-semibold bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent">
                Primo Poker
              </span>
            </div>
            
            {/* Game Type Tabs */}
            <div className="flex space-x-1">
              <button className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-t font-semibold shadow-lg shadow-purple-500/20">
                Cash Games
              </button>
              <button className="px-4 py-2 hover:bg-slate-800 rounded-t transition-colors">
                Sit & Go
              </button>
              <button className="px-4 py-2 hover:bg-slate-800 rounded-t transition-colors">
                Tournaments
              </button>
              <button className="px-4 py-2 hover:bg-slate-800 rounded-t transition-colors">
                <span className="flex items-center space-x-1">
                  <span>Speed Poker</span>
                  <span className="text-amber-400">⚡</span>
                </span>
              </button>
            </div>
            
            {/* Quick Filters */}
            <div className="flex items-center space-x-3 text-sm">
              <select className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 focus:border-purple-500 transition-colors">
                <option>All Stakes</option>
                <option>Micro (¥1-¥25)</option>
                <option>Low (¥50-¥200)</option>
                <option>Mid (¥500-¥1000)</option>
                <option>High (¥2000+)</option>
              </select>
              <select className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 focus:border-purple-500 transition-colors">
                <option>All Tables</option>
                <option>2 Players</option>
                <option>6 Players</option>
                <option>9 Players</option>
              </select>
            </div>
          </div>
          
          {/* Account Info */}
          <div className="flex items-center space-x-4">
            <input 
              type="text" 
              placeholder="Search tables..." 
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm w-48 focus:border-purple-500 focus:outline-none transition-colors"
            />
            <div className="text-sm">
              <div className="text-slate-400">Balance</div>
              <div className="font-semibold text-amber-400">€1,888.88</div>
            </div>
            <div className="text-sm">
              <div className="text-slate-400">Player</div>
              <div className="font-semibold flex items-center space-x-1">
                <span>LuckyDragon</span>
                <span className="text-amber-400">⭐</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Filters with purple accents */}
        <div className="w-64 bg-slate-800/50 backdrop-blur border-r border-slate-700/50 p-4 overflow-y-auto">
          <div className="space-y-6">
            {/* Featured Section */}
            <div className="bg-gradient-to-r from-purple-600/20 to-amber-500/20 rounded-lg p-3 border border-purple-500/30">
              <h3 className="text-sm font-semibold text-amber-400 mb-2 flex items-center space-x-1">
                <span>🏆</span>
                <span>FEATURED TABLES</span>
              </h3>
              <div className="text-xs text-slate-300">
                Special rake back and bonuses!
              </div>
            </div>

            {/* Game Type Filter */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-3 tracking-wider">GAME TYPE</h3>
              <div className="space-y-2">
                <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" defaultChecked />
                  <span className="text-sm">No Limit Hold'em</span>
                </label>
                <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" />
                  <span className="text-sm">Pot Limit Omaha</span>
                </label>
                <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" />
                  <span className="text-sm">Short Deck</span>
                </label>
              </div>
            </div>

            {/* Stakes Filter with currency symbols */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-3 tracking-wider">STAKES</h3>
              <div className="space-y-2">
                <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" defaultChecked />
                  <span className="text-sm">Micro (€0.01 - €0.25)</span>
                </label>
                <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" defaultChecked />
                  <span className="text-sm">Low (€0.50 - €2)</span>
                </label>
                <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" />
                  <span className="text-sm">Mid (€5 - €10)</span>
                </label>
                <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" />
                  <span className="text-sm">High (€25+)</span>
                </label>
              </div>
            </div>

            {/* Table Features */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-3 tracking-wider">SPECIAL FEATURES</h3>
              <div className="space-y-2">
                <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" />
                  <span className="text-sm flex items-center space-x-1">
                    <span>Speed Tables</span>
                    <span className="text-amber-400 text-xs">⚡</span>
                  </span>
                </label>
                <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" />
                  <span className="text-sm flex items-center space-x-1">
                    <span>Lucky 8 Tables</span>
                    <span className="text-amber-400 text-xs">🎰</span>
                  </span>
                </label>
                <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" />
                  <span className="text-sm">Beginner Friendly</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Center - Table List with Primo styling */}
        <div className="flex-1 flex flex-col">
          {/* Table List Header */}
          <div className="bg-slate-800/50 backdrop-blur border-b border-slate-700/50">
            <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <div className="col-span-3 flex items-center space-x-1 cursor-pointer hover:text-purple-400 transition-colors">
                <span>Table</span>
                <span className="text-slate-600">▼</span>
              </div>
              <div className="col-span-2 cursor-pointer hover:text-purple-400 transition-colors">Game</div>
              <div className="col-span-1 cursor-pointer hover:text-purple-400 transition-colors">Stakes</div>
              <div className="col-span-1 cursor-pointer hover:text-purple-400 transition-colors">Players</div>
              <div className="col-span-1 text-right cursor-pointer hover:text-purple-400 transition-colors">Avg Pot</div>
              <div className="col-span-1 text-right cursor-pointer hover:text-purple-400 transition-colors">Speed</div>
              <div className="col-span-1 text-center cursor-pointer hover:text-purple-400 transition-colors">Wait</div>
              <div className="col-span-2"></div>
            </div>
          </div>

          {/* Table List Body */}
          <div className="flex-1 overflow-y-auto bg-slate-900/50">
            {/* Featured Table */}
            <div className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-b border-slate-700/50 hover:bg-slate-800/30 cursor-pointer bg-gradient-to-r from-purple-900/20 to-amber-900/20">
              <div className="col-span-3 font-medium flex items-center space-x-2">
                <span className="text-amber-400">🏆</span>
                <span>Dragon's Fortune</span>
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Featured</span>
              </div>
              <div className="col-span-2 text-slate-300">NL Hold'em</div>
              <div className="col-span-1 text-slate-300">€1/€2</div>
              <div className="col-span-1">
                <div className="flex items-center space-x-1">
                  <div className="flex space-x-0.5">
                    {[...Array(6)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-1.5 h-3 rounded-sm ${i < 5 ? 'bg-emerald-500' : 'bg-slate-600'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">5/6</span>
                </div>
              </div>
              <div className="col-span-1 text-right text-slate-300">€88</div>
              <div className="col-span-1 text-right text-slate-300">Fast</div>
              <div className="col-span-1 text-center text-slate-300">0</div>
              <div className="col-span-2 text-right space-x-2">
                <button className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white text-xs rounded-lg font-medium transition-all transform hover:scale-105 shadow-lg shadow-purple-500/20">
                  JOIN
                </button>
                <button className="p-1.5 text-amber-400 hover:text-amber-300 transition-colors">
                  ⭐
                </button>
              </div>
            </div>

            {/* Regular Tables */}
            <div className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-b border-slate-700/50 hover:bg-slate-800/30 cursor-pointer transition-colors">
              <div className="col-span-3 font-medium flex items-center space-x-2">
                <span className="text-purple-400">♠</span>
                <span>Monaco High Roller</span>
              </div>
              <div className="col-span-2 text-slate-300">NL Hold'em</div>
              <div className="col-span-1 text-slate-300">€5/€10</div>
              <div className="col-span-1">
                <div className="flex items-center space-x-1">
                  <div className="flex space-x-0.5">
                    {[...Array(9)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-1.5 h-3 rounded-sm ${i < 7 ? 'bg-emerald-500' : 'bg-slate-600'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">7/9</span>
                </div>
              </div>
              <div className="col-span-1 text-right text-slate-300">€280</div>
              <div className="col-span-1 text-right text-slate-300">Normal</div>
              <div className="col-span-1 text-center text-slate-300">2</div>
              <div className="col-span-2 text-right space-x-2">
                <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg font-medium transition-all transform hover:scale-105">
                  JOIN
                </button>
                <button className="p-1.5 text-slate-400 hover:text-amber-400 transition-colors">
                  ☆
                </button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-b border-slate-700/50 hover:bg-slate-800/30 cursor-pointer transition-colors">
              <div className="col-span-3 font-medium flex items-center space-x-2">
                <span className="text-pink-400">🌸</span>
                <span>Sakura Lounge</span>
              </div>
              <div className="col-span-2 text-slate-300">PLO</div>
              <div className="col-span-1 text-slate-300">€0.50/€1</div>
              <div className="col-span-1">
                <div className="flex items-center space-x-1">
                  <div className="flex space-x-0.5">
                    {[...Array(6)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-1.5 h-3 rounded-sm ${i < 6 ? 'bg-emerald-500' : 'bg-slate-600'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">6/6</span>
                </div>
              </div>
              <div className="col-span-1 text-right text-slate-300">€45</div>
              <div className="col-span-1 text-right text-slate-300">Normal</div>
              <div className="col-span-1 text-center text-amber-400">8</div>
              <div className="col-span-2 text-right space-x-2">
                <button className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded-lg font-medium transition-all">
                  WAITLIST
                </button>
                <button className="p-1.5 text-slate-400 hover:text-amber-400 transition-colors">
                  ☆
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Table Preview with Primo styling */}
        <div className="w-80 bg-slate-800/50 backdrop-blur border-l border-slate-700/50 p-4">
          <h3 className="text-lg font-semibold mb-4 bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent">
            Dragon's Fortune
          </h3>
          
          {/* Mini Table Visualization */}
          <div className="bg-slate-900 rounded-xl p-4 mb-4 border border-purple-500/20 shadow-lg shadow-purple-500/10">
            <div className="relative w-full h-48">
              {/* Table Felt */}
              <div className="absolute inset-0 bg-gradient-to-br from-green-900/40 to-green-800/40 rounded-full"></div>
              <div className="absolute inset-2 border-2 border-amber-500/30 rounded-full"></div>
              
              {/* Pot Display */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="text-xs text-slate-400 uppercase tracking-wider">Pot</div>
                <div className="text-2xl font-bold text-amber-400">€88</div>
                <div className="text-xs text-emerald-400 mt-1">+12% rake back</div>
              </div>
              
              {/* Sample Seats */}
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2">
                <div className="bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                  <div className="text-xs font-medium">LuckyAce</div>
                  <div className="text-amber-400 text-sm">€245</div>
                </div>
              </div>
              
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
                <div className="bg-gradient-to-r from-purple-800 to-purple-700 px-3 py-2 rounded-lg border border-purple-600">
                  <div className="text-xs font-medium">You</div>
                  <div className="text-amber-400 text-sm">€200</div>
                </div>
              </div>
              
              <div className="absolute left-2 top-1/2 transform -translate-y-1/2">
                <div className="bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700 border-dashed">
                  <div className="text-xs text-slate-400">Empty</div>
                </div>
              </div>
            </div>
          </div>

          {/* Table Info */}
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
              <span className="text-sm text-slate-400">Game</span>
              <span className="text-sm font-medium">No Limit Hold'em</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
              <span className="text-sm text-slate-400">Stakes</span>
              <span className="text-sm font-medium">€1/€2</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
              <span className="text-sm text-slate-400">Buy-in</span>
              <span className="text-sm font-medium">€50 - €200</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <span className="text-sm text-amber-400">Bonus</span>
              <span className="text-sm font-medium text-amber-400">12% Rake Back</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white rounded-lg font-semibold transition-all transform hover:scale-105 shadow-lg shadow-purple-500/30">
              Join Table
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button className="py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors">
                Add to Favorites
              </button>
              <button className="py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors">
                Table Stats
              </button>
            </div>
          </div>
          
          {/* Lucky Number Display */}
          <div className="mt-4 p-3 bg-gradient-to-r from-purple-900/20 to-amber-900/20 rounded-lg border border-purple-500/20">
            <div className="text-xs text-slate-400 mb-1">Today's Lucky Numbers</div>
            <div className="flex space-x-2">
              <span className="text-lg font-bold text-amber-400">8</span>
              <span className="text-lg font-bold text-purple-400">8</span>
              <span className="text-lg font-bold text-emerald-400">8</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="bg-gradient-to-t from-slate-800 to-slate-900 border-t border-purple-500/30 px-4 py-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-6 text-slate-400">
            <span>Online: <span className="text-emerald-400 font-semibold">8,888</span></span>
            <span>Tables: <span className="text-purple-400 font-semibold">288</span></span>
            <span>In Play: <span className="text-amber-400 font-semibold">€888,888</span></span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-2 text-slate-400">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span>Connected</span>
            </span>
            <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs">
              <option>English</option>
              <option>中文</option>
              <option>日本語</option>
              <option>한국어</option>
              <option>Deutsch</option>
              <option>Français</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrimoLobbyMockup;