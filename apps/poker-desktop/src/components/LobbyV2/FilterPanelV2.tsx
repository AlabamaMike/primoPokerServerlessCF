import React from 'react';
import { GameType, StakeLevel, TableFeature, Filters } from './types';
import { useFilterStore } from '../../stores/filter-store';
import { CollapsibleSection } from '../shared';

/**
 * FilterPanelV2 - Refactored version using the new filter store
 * This component demonstrates direct usage of the domain-specific filter store
 * instead of the monolithic lobby store.
 */
const FilterPanelV2: React.FC = () => {
  // Use the dedicated filter store
  const { 
    filters, 
    updateGameTypes,
    updateStakes,
    updateTableSizes,
    updateFeatures,
    resetFilters
  } = useFilterStore();

  const handleGameTypeToggle = (gameType: GameType) => {
    const newGameTypes = filters.gameTypes.includes(gameType)
      ? filters.gameTypes.filter(gt => gt !== gameType)
      : [...filters.gameTypes, gameType];
    updateGameTypes(newGameTypes);
  };

  const handleStakeToggle = (stake: StakeLevel) => {
    const newStakes = filters.stakes.includes(stake)
      ? filters.stakes.filter(s => s !== stake)
      : [...filters.stakes, stake];
    updateStakes(newStakes);
  };

  const handleTableSizeToggle = (size: number) => {
    const newSizes = filters.tableSizes.includes(size)
      ? filters.tableSizes.filter(s => s !== size)
      : [...filters.tableSizes, size];
    updateTableSizes(newSizes);
  };

  const handleFeatureToggle = (feature: TableFeature) => {
    const newFeatures = filters.features.includes(feature)
      ? filters.features.filter(f => f !== feature)
      : [...filters.features, feature];
    updateFeatures(newFeatures);
  };

  const isDefaultFilters = () => {
    return (
      filters.gameTypes.length === 1 && filters.gameTypes[0] === 'nlhe' &&
      filters.stakes.length === 2 && filters.stakes.includes('micro') && filters.stakes.includes('low') &&
      filters.tableSizes.length === 2 && filters.tableSizes.includes(6) && filters.tableSizes.includes(9) &&
      filters.features.length === 0
    );
  };

  return (
    <div className="w-64 bg-slate-800/50 backdrop-blur border-r border-slate-700/50 p-4 overflow-y-auto">
      <div className="space-y-4">
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
        <CollapsibleSection title="Game Type" ariaLabel="Game type filters" defaultOpen={true}>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.gameTypes.includes('nlhe')}
              onChange={() => handleGameTypeToggle('nlhe')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="NL Hold'em"
            />
            <span className="text-sm">NL Hold'em</span>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.gameTypes.includes('plo')}
              onChange={() => handleGameTypeToggle('plo')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="PLO"
            />
            <span className="text-sm">PLO</span>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.gameTypes.includes('plo5')}
              onChange={() => handleGameTypeToggle('plo5')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="PLO5"
            />
            <span className="text-sm">PLO5</span>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.gameTypes.includes('shortdeck')}
              onChange={() => handleGameTypeToggle('shortdeck')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Short Deck"
            />
            <span className="text-sm">Short Deck</span>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.gameTypes.includes('mixed')}
              onChange={() => handleGameTypeToggle('mixed')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Mixed Games"
            />
            <span className="text-sm">Mixed Games</span>
          </label>
        </CollapsibleSection>

        {/* Stakes Filter */}
        <CollapsibleSection title="Stakes" ariaLabel="Stakes filters" defaultOpen={true}>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.stakes.includes('micro')}
              onChange={() => handleStakeToggle('micro')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Micro Stakes"
            />
            <div className="flex-1">
              <div className="text-sm">Micro Stakes</div>
              <div className="text-xs text-slate-400">€0.01 - €0.25</div>
            </div>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.stakes.includes('low')}
              onChange={() => handleStakeToggle('low')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Low Stakes"
            />
            <div className="flex-1">
              <div className="text-sm">Low Stakes</div>
              <div className="text-xs text-slate-400">€0.50 - €2.00</div>
            </div>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.stakes.includes('mid')}
              onChange={() => handleStakeToggle('mid')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Mid Stakes"
            />
            <div className="flex-1">
              <div className="text-sm">Mid Stakes</div>
              <div className="text-xs text-slate-400">€5.00 - €10.00</div>
            </div>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.stakes.includes('high')}
              onChange={() => handleStakeToggle('high')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="High Stakes"
            />
            <div className="flex-1">
              <div className="text-sm">High Stakes</div>
              <div className="text-xs text-slate-400">€25.00+</div>
            </div>
          </label>
        </CollapsibleSection>

        {/* Table Size Filter */}
        <CollapsibleSection title="Table Size" ariaLabel="Table size filters" defaultOpen={true}>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.tableSizes.includes(2)}
              onChange={() => handleTableSizeToggle(2)}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Heads-Up"
            />
            <span className="text-sm">Heads-Up</span>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.tableSizes.includes(6)}
              onChange={() => handleTableSizeToggle(6)}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="6-Max"
            />
            <span className="text-sm">6-Max</span>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.tableSizes.includes(9)}
              onChange={() => handleTableSizeToggle(9)}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="9-Max"
            />
            <span className="text-sm">9-Max</span>
          </label>
        </CollapsibleSection>

        {/* Special Features */}
        <CollapsibleSection title="Features" ariaLabel="Feature filters" defaultOpen={true}>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.features.includes('featured')}
              onChange={() => handleFeatureToggle('featured')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Featured Tables"
            />
            <span className="text-sm">Featured Tables</span>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.features.includes('speed')}
              onChange={() => handleFeatureToggle('speed')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Speed Tables"
            />
            <span className="text-sm">Speed Tables</span>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.features.includes('beginner')}
              onChange={() => handleFeatureToggle('beginner')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Beginner Friendly"
            />
            <span className="text-sm">Beginner Friendly</span>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.features.includes('deepstack')}
              onChange={() => handleFeatureToggle('deepstack')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Deep Stack"
            />
            <span className="text-sm">Deep Stack</span>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.features.includes('rakeback')}
              onChange={() => handleFeatureToggle('rakeback')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Rakeback"
            />
            <span className="text-sm">Rakeback</span>
          </label>
          <label className="flex items-center space-x-3 hover:bg-slate-700/50 p-2 rounded-lg cursor-pointer transition-colors">
            <input 
              type="checkbox" 
              checked={filters.features.includes('jackpot')}
              onChange={() => handleFeatureToggle('jackpot')}
              className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              aria-label="Jackpot"
            />
            <span className="text-sm">Jackpot</span>
          </label>
        </CollapsibleSection>

        {/* Reset Filters Button */}
        {!isDefaultFilters() && (
          <button
            onClick={resetFilters}
            className="w-full py-2 px-4 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 transition-colors text-sm font-medium"
          >
            Reset Filters
          </button>
        )}
      </div>
    </div>
  );
};

export default FilterPanelV2;