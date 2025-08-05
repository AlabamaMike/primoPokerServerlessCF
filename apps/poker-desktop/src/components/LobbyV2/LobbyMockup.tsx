import React from 'react';

/**
 * Visual mockup of the Full Tilt-inspired lobby design
 * This is a static mockup to demonstrate the layout and styling
 */
const LobbyMockup: React.FC = () => {
  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Top Navigation Bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            {/* Game Type Tabs */}
            <div className="flex space-x-1">
              <button className="px-4 py-2 bg-red-600 text-white rounded-t font-semibold">
                Cash Games
              </button>
              <button className="px-4 py-2 hover:bg-gray-700 rounded-t">
                Sit & Go
              </button>
              <button className="px-4 py-2 hover:bg-gray-700 rounded-t">
                Tournaments
              </button>
              <button className="px-4 py-2 hover:bg-gray-700 rounded-t">
                Rush Poker
              </button>
            </div>
            
            {/* Quick Filters */}
            <div className="flex items-center space-x-3 text-sm">
              <select className="bg-gray-700 border border-gray-600 rounded px-2 py-1">
                <option>All Stakes</option>
                <option>Micro</option>
                <option>Low</option>
                <option>Mid</option>
                <option>High</option>
              </select>
              <select className="bg-gray-700 border border-gray-600 rounded px-2 py-1">
                <option>All Sizes</option>
                <option>Heads Up</option>
                <option>6-Max</option>
                <option>9-Max</option>
              </select>
            </div>
          </div>
          
          {/* Account Info */}
          <div className="flex items-center space-x-4">
            <input 
              type="text" 
              placeholder="Search tables..." 
              className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm w-48"
            />
            <div className="text-sm">
              <div className="text-gray-400">Balance</div>
              <div className="font-semibold">$1,234.56</div>
            </div>
            <div className="text-sm">
              <div className="text-gray-400">Player</div>
              <div className="font-semibold">testuser</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Filters */}
        <div className="w-64 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto">
          <div className="space-y-6">
            {/* Game Type Filter */}
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">GAME TYPE</h3>
              <div className="space-y-1">
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" defaultChecked />
                  <span className="text-sm">No Limit Hold'em</span>
                </label>
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" />
                  <span className="text-sm">Pot Limit Omaha</span>
                </label>
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" />
                  <span className="text-sm">Omaha Hi/Lo</span>
                </label>
              </div>
            </div>

            {/* Stakes Filter */}
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">STAKES</h3>
              <div className="space-y-1">
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" defaultChecked />
                  <span className="text-sm">Micro ($0.01/$0.02 - $0.10/$0.25)</span>
                </label>
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" defaultChecked />
                  <span className="text-sm">Low ($0.25/$0.50 - $1/$2)</span>
                </label>
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" />
                  <span className="text-sm">Mid ($2/$5 - $5/$10)</span>
                </label>
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" />
                  <span className="text-sm">High ($10/$25+)</span>
                </label>
              </div>
            </div>

            {/* Table Size Filter */}
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">TABLE SIZE</h3>
              <div className="space-y-1">
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" />
                  <span className="text-sm">Heads Up (2 max)</span>
                </label>
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" defaultChecked />
                  <span className="text-sm">6-Max</span>
                </label>
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" defaultChecked />
                  <span className="text-sm">9-Max</span>
                </label>
              </div>
            </div>

            {/* Special Filters */}
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">SPECIAL</h3>
              <div className="space-y-1">
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" />
                  <span className="text-sm">Fast Fold</span>
                </label>
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" />
                  <span className="text-sm">Deep Stack (200BB+)</span>
                </label>
                <label className="flex items-center space-x-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" className="text-red-600" />
                  <span className="text-sm">Jackpot Tables</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Center - Table List */}
        <div className="flex-1 flex flex-col">
          {/* Table List Header */}
          <div className="bg-gray-800 border-b border-gray-700">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-gray-400">
              <div className="col-span-3 flex items-center space-x-1 cursor-pointer hover:text-white">
                <span>TABLE</span>
                <span className="text-gray-600">▼</span>
              </div>
              <div className="col-span-2 cursor-pointer hover:text-white">GAME</div>
              <div className="col-span-1 cursor-pointer hover:text-white">STAKES</div>
              <div className="col-span-1 cursor-pointer hover:text-white">PLAYERS</div>
              <div className="col-span-1 text-right cursor-pointer hover:text-white">AVG POT</div>
              <div className="col-span-1 text-right cursor-pointer hover:text-white">PLRS/FLP</div>
              <div className="col-span-1 text-right cursor-pointer hover:text-white">H/HR</div>
              <div className="col-span-1 text-center cursor-pointer hover:text-white">WAIT</div>
              <div className="col-span-1"></div>
            </div>
          </div>

          {/* Table List Body */}
          <div className="flex-1 overflow-y-auto bg-gray-850">
            {/* Sample Table Rows */}
            {[
              { name: 'Bellagio', game: 'NL Hold\'em', stakes: '$1/$2', players: '5/6', avgPot: '$45', plrsFlop: '68%', handsHr: '62', wait: '0' },
              { name: 'Venetian', game: 'NL Hold\'em', stakes: '$0.50/$1', players: '8/9', avgPot: '$28', plrsFlop: '45%', handsHr: '58', wait: '2' },
              { name: 'Aria High Stakes', game: 'NL Hold\'em', stakes: '$5/$10', players: '4/6', avgPot: '$380', plrsFlop: '52%', handsHr: '48', wait: '0' },
              { name: 'MGM Grand', game: 'PLO', stakes: '$1/$2', players: '6/6', avgPot: '$125', plrsFlop: '78%', handsHr: '42', wait: '4' },
              { name: 'Wynn', game: 'NL Hold\'em', stakes: '$2/$5', players: '7/9', avgPot: '$95', plrsFlop: '38%', handsHr: '55', wait: '0' },
            ].map((table, idx) => (
              <div 
                key={idx} 
                className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-b border-gray-700 hover:bg-gray-800 cursor-pointer"
              >
                <div className="col-span-3 font-medium flex items-center space-x-2">
                  <span className="text-red-500">♠</span>
                  <span>{table.name}</span>
                </div>
                <div className="col-span-2 text-gray-300">{table.game}</div>
                <div className="col-span-1 text-gray-300">{table.stakes}</div>
                <div className="col-span-1">
                  <div className="flex items-center space-x-1">
                    <div className="flex space-x-0.5">
                      {[...Array(9)].map((_, i) => (
                        <div 
                          key={i} 
                          className={`w-1 h-3 ${i < parseInt(table.players.split('/')[0]) ? 'bg-green-500' : 'bg-gray-600'}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">{table.players}</span>
                  </div>
                </div>
                <div className="col-span-1 text-right text-gray-300">{table.avgPot}</div>
                <div className="col-span-1 text-right text-gray-300">{table.plrsFlop}</div>
                <div className="col-span-1 text-right text-gray-300">{table.handsHr}</div>
                <div className="col-span-1 text-center text-gray-300">{table.wait}</div>
                <div className="col-span-1 text-right">
                  <button className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium">
                    JOIN
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel - Table Preview */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
          <h3 className="text-lg font-semibold mb-4">Table Preview</h3>
          
          {/* Mini Table Visualization */}
          <div className="bg-gray-900 rounded-lg p-4 mb-4">
            <div className="relative w-full h-48">
              {/* Table Oval */}
              <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
              
              {/* Sample Seats */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2">
                <div className="bg-gray-700 px-2 py-1 rounded text-xs">
                  <div>Player1</div>
                  <div className="text-yellow-400">$245</div>
                </div>
              </div>
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-2">
                <div className="bg-gray-700 px-2 py-1 rounded text-xs">
                  <div>Player2</div>
                  <div className="text-yellow-400">$180</div>
                </div>
              </div>
              
              {/* Pot */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <div className="text-center">
                  <div className="text-xs text-gray-400">Pot</div>
                  <div className="text-lg font-semibold text-yellow-400">$45</div>
                </div>
              </div>
            </div>
          </div>

          {/* Table Info */}
          <div className="space-y-3 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Game:</span>
              <span>No Limit Hold'em</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Stakes:</span>
              <span>$1/$2</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Buy-in:</span>
              <span>$50 - $200</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Players:</span>
              <span>5/6</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Avg Pot:</span>
              <span>$45</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Speed:</span>
              <span>62 hands/hr</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded font-semibold">
              Join Table
            </button>
            <button className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">
              Add to Favorites
            </button>
            <button className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">
              Join Waitlist
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center space-x-6">
            <span>Players Online: <span className="text-white font-semibold">1,247</span></span>
            <span>Tables: <span className="text-white font-semibold">186</span></span>
            <span>Tournaments: <span className="text-white font-semibold">23</span></span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Connected</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LobbyMockup;