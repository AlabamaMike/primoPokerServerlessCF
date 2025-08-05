import React from 'react';
import { GameType, StakeLevel, TableFeature, Filters } from './types';

interface FilterSidebarProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

const FilterSidebar: React.FC<FilterSidebarProps> = ({ filters, onFiltersChange }) => {
  const handleGameTypeToggle = (gameType: GameType) => {
    const newGameTypes = filters.gameTypes.includes(gameType)
      ? filters.gameTypes.filter(gt => gt !== gameType)
      : [...filters.gameTypes, gameType];
    onFiltersChange({ ...filters, gameTypes: newGameTypes });
  };

  const handleStakeToggle = (stake: StakeLevel) => {
    const newStakes = filters.stakes.includes(stake)
      ? filters.stakes.filter(s => s !== stake)
      : [...filters.stakes, stake];
    onFiltersChange({ ...filters, stakes: newStakes });
  };

  const handleTableSizeToggle = (size: number) => {
    const newSizes = filters.tableSizes.includes(size)
      ? filters.tableSizes.filter(s => s !== size)
      : [...filters.tableSizes, size];
    onFiltersChange({ ...filters, tableSizes: newSizes });
  };

  const handleFeatureToggle = (feature: TableFeature) => {
    const newFeatures = filters.features.includes(feature)
      ? filters.features.filter(f => f !== feature)
      : [...filters.features, feature];
    onFiltersChange({ ...filters, features: newFeatures });
  };

  return (
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
              <input 
                type="checkbox" 
                checked={filters.gameTypes.includes('nlhe')}
                onChange={() => handleGameTypeToggle('nlhe')}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm">No Limit Hold'em</span>
            </label>
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.gameTypes.includes('plo')}
                onChange={() => handleGameTypeToggle('plo')}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm">Pot Limit Omaha</span>
            </label>
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.gameTypes.includes('shortdeck')}
                onChange={() => handleGameTypeToggle('shortdeck')}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm">Short Deck</span>
            </label>
          </div>
        </div>

        {/* Stakes Filter */}
        <div>
          <h3 className="text-sm font-semibold text-slate-400 mb-3 tracking-wider">STAKES</h3>
          <div className="space-y-2">
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.stakes.includes('micro')}
                onChange={() => handleStakeToggle('micro')}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm">Micro (€0.01 - €0.25)</span>
            </label>
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.stakes.includes('low')}
                onChange={() => handleStakeToggle('low')}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm">Low (€0.50 - €2)</span>
            </label>
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.stakes.includes('mid')}
                onChange={() => handleStakeToggle('mid')}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm">Mid (€5 - €10)</span>
            </label>
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.stakes.includes('high')}
                onChange={() => handleStakeToggle('high')}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm">High (€25+)</span>
            </label>
          </div>
        </div>

        {/* Table Size Filter */}
        <div>
          <h3 className="text-sm font-semibold text-slate-400 mb-3 tracking-wider">TABLE SIZE</h3>
          <div className="space-y-2">
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.tableSizes.includes(2)}
                onChange={() => handleTableSizeToggle(2)}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm">Heads Up (2 max)</span>
            </label>
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.tableSizes.includes(6)}
                onChange={() => handleTableSizeToggle(6)}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm">6-Max</span>
            </label>
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.tableSizes.includes(9)}
                onChange={() => handleTableSizeToggle(9)}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm">9-Max</span>
            </label>
          </div>
        </div>

        {/* Special Features */}
        <div>
          <h3 className="text-sm font-semibold text-slate-400 mb-3 tracking-wider">SPECIAL FEATURES</h3>
          <div className="space-y-2">
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.features.includes('speed')}
                onChange={() => handleFeatureToggle('speed')}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm flex items-center space-x-1">
                <span>Speed Tables</span>
                <span className="text-amber-400 text-xs">⚡</span>
              </span>
            </label>
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.features.includes('lucky8')}
                onChange={() => handleFeatureToggle('lucky8')}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm flex items-center space-x-1">
                <span>Lucky 8 Tables</span>
                <span className="text-amber-400 text-xs">🎰</span>
              </span>
            </label>
            <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={filters.features.includes('beginner')}
                onChange={() => handleFeatureToggle('beginner')}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500" 
              />
              <span className="text-sm">Beginner Friendly</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterSidebar;