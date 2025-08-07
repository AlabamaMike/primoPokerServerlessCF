import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FilterPanel from '../FilterPanel';
import { useLobbyStore } from '../../../stores/lobby-store';

// Mock the store
jest.mock('../../../stores/lobby-store');

describe('FilterPanel', () => {
  const mockUseLobbyStore = useLobbyStore as jest.MockedFunction<typeof useLobbyStore>;
  const mockSetFilters = jest.fn();
  
  const defaultFilters = {
    gameTypes: ['nlhe'],
    stakes: ['micro', 'low'],
    tableSizes: [6, 9],
    features: []
  };

  beforeEach(() => {
    mockUseLobbyStore.mockReturnValue({
      filters: defaultFilters,
      setFilters: mockSetFilters,
      tables: [],
      isLoadingTables: false,
      tablesError: null,
      selectedTableId: null,
      selectedTable: null,
      favoriteTables: [],
      favoriteTableIds: new Set(),
      stats: { playersOnline: 0, activeTables: 0, totalPot: 0 },
      toggleFavorite: jest.fn(),
      selectTable: jest.fn(),
      fetchTables: jest.fn(),
      fetchStats: jest.fn(),
      joinTable: jest.fn(),
      joinWaitlist: jest.fn()
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Collapsible Sections', () => {
    it('should render all filter sections', () => {
      render(<FilterPanel />);
      
      expect(screen.getByText('Game Type')).toBeInTheDocument();
      expect(screen.getByText('Stakes')).toBeInTheDocument();
      expect(screen.getByText('Table Size')).toBeInTheDocument();
      expect(screen.getByText('Features')).toBeInTheDocument();
    });

    it('should toggle section visibility when clicking header', () => {
      render(<FilterPanel />);
      
      const gameTypeHeader = screen.getByText('Game Type');
      const nlheCheckbox = screen.getByLabelText("NL Hold'em");
      
      // Initially visible
      expect(nlheCheckbox).toBeVisible();
      
      // Click to collapse
      fireEvent.click(gameTypeHeader);
      expect(nlheCheckbox).not.toBeVisible();
      
      // Click to expand
      fireEvent.click(gameTypeHeader);
      expect(nlheCheckbox).toBeVisible();
    });

    it('should show collapse/expand icons', () => {
      render(<FilterPanel />);
      
      const gameTypeHeader = screen.getByText('Game Type').closest('button');
      const expandIcon = gameTypeHeader?.querySelector('[data-testid="expand-icon"]');
      const collapseIcon = gameTypeHeader?.querySelector('[data-testid="collapse-icon"]');
      
      // Initially expanded
      expect(collapseIcon).toBeInTheDocument();
      expect(expandIcon).not.toBeInTheDocument();
      
      // Click to collapse
      fireEvent.click(gameTypeHeader!);
      
      const newExpandIcon = gameTypeHeader?.querySelector('[data-testid="expand-icon"]');
      const newCollapseIcon = gameTypeHeader?.querySelector('[data-testid="collapse-icon"]');
      
      expect(newExpandIcon).toBeInTheDocument();
      expect(newCollapseIcon).not.toBeInTheDocument();
    });
  });

  describe('Game Type Filters', () => {
    it('should display all game type options', () => {
      render(<FilterPanel />);
      
      expect(screen.getByLabelText("NL Hold'em")).toBeInTheDocument();
      expect(screen.getByLabelText('PLO')).toBeInTheDocument();
      expect(screen.getByLabelText('PLO5')).toBeInTheDocument();
      expect(screen.getByLabelText('Short Deck')).toBeInTheDocument();
      expect(screen.getByLabelText('Mixed Games')).toBeInTheDocument();
    });

    it('should update filters when game type is toggled', () => {
      render(<FilterPanel />);
      
      const ploCheckbox = screen.getByLabelText('PLO');
      fireEvent.click(ploCheckbox);
      
      expect(mockSetFilters).toHaveBeenCalledWith({
        ...defaultFilters,
        gameTypes: ['nlhe', 'plo']
      });
    });

    it('should uncheck game type when clicked again', () => {
      render(<FilterPanel />);
      
      const nlheCheckbox = screen.getByLabelText("NL Hold'em");
      fireEvent.click(nlheCheckbox);
      
      expect(mockSetFilters).toHaveBeenCalledWith({
        ...defaultFilters,
        gameTypes: []
      });
    });
  });

  describe('Stakes Filters', () => {
    it('should display all stake levels', () => {
      render(<FilterPanel />);
      
      expect(screen.getByLabelText('Micro Stakes')).toBeInTheDocument();
      expect(screen.getByLabelText('Low Stakes')).toBeInTheDocument();
      expect(screen.getByLabelText('Mid Stakes')).toBeInTheDocument();
      expect(screen.getByLabelText('High Stakes')).toBeInTheDocument();
    });

    it('should show stake ranges', () => {
      render(<FilterPanel />);
      
      expect(screen.getByText('€0.01 - €0.25')).toBeInTheDocument();
      expect(screen.getByText('€0.50 - €2.00')).toBeInTheDocument();
      expect(screen.getByText('€5.00 - €10.00')).toBeInTheDocument();
      expect(screen.getByText('€25.00+')).toBeInTheDocument();
    });

    it('should update filters when stake level is toggled', () => {
      render(<FilterPanel />);
      
      const midStakesCheckbox = screen.getByLabelText('Mid Stakes');
      fireEvent.click(midStakesCheckbox);
      
      expect(mockSetFilters).toHaveBeenCalledWith({
        ...defaultFilters,
        stakes: ['micro', 'low', 'mid']
      });
    });
  });

  describe('Table Size Filters', () => {
    it('should display all table size options', () => {
      render(<FilterPanel />);
      
      expect(screen.getByLabelText('Heads-Up')).toBeInTheDocument();
      expect(screen.getByLabelText('6-Max')).toBeInTheDocument();
      expect(screen.getByLabelText('9-Max')).toBeInTheDocument();
    });

    it('should update filters when table size is toggled', () => {
      render(<FilterPanel />);
      
      const headsUpCheckbox = screen.getByLabelText('Heads-Up');
      fireEvent.click(headsUpCheckbox);
      
      expect(mockSetFilters).toHaveBeenCalledWith({
        ...defaultFilters,
        tableSizes: [6, 9, 2]
      });
    });
  });

  describe('Feature Filters', () => {
    it('should display all feature options', () => {
      render(<FilterPanel />);
      
      expect(screen.getByLabelText('Featured Tables')).toBeInTheDocument();
      expect(screen.getByLabelText('Speed Tables')).toBeInTheDocument();
      expect(screen.getByLabelText('Beginner Friendly')).toBeInTheDocument();
      expect(screen.getByLabelText('Deep Stack')).toBeInTheDocument();
      expect(screen.getByLabelText('Rakeback')).toBeInTheDocument();
      expect(screen.getByLabelText('Jackpot')).toBeInTheDocument();
    });

    it('should update filters when feature is toggled', () => {
      render(<FilterPanel />);
      
      const speedCheckbox = screen.getByLabelText('Speed Tables');
      fireEvent.click(speedCheckbox);
      
      expect(mockSetFilters).toHaveBeenCalledWith({
        ...defaultFilters,
        features: ['speed']
      });
    });
  });

  describe('Reset Filters', () => {
    it('should show reset button when filters are applied', () => {
      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        filters: {
          gameTypes: ['nlhe', 'plo'],
          stakes: ['high'],
          tableSizes: [2],
          features: ['speed', 'rakeback']
        }
      });

      render(<FilterPanel />);
      
      expect(screen.getByText('Reset Filters')).toBeInTheDocument();
    });

    it('should reset all filters when reset button is clicked', () => {
      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        filters: {
          gameTypes: ['nlhe', 'plo'],
          stakes: ['high'],
          tableSizes: [2],
          features: ['speed', 'rakeback']
        }
      });

      render(<FilterPanel />);
      
      const resetButton = screen.getByText('Reset Filters');
      fireEvent.click(resetButton);
      
      expect(mockSetFilters).toHaveBeenCalledWith({
        gameTypes: ['nlhe'],
        stakes: ['micro', 'low'],
        tableSizes: [6, 9],
        features: []
      });
    });

    it('should not show reset button with default filters', () => {
      render(<FilterPanel />);
      
      expect(screen.queryByText('Reset Filters')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for sections', () => {
      render(<FilterPanel />);
      
      expect(screen.getByRole('region', { name: /game type filters/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /stakes filters/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /table size filters/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /feature filters/i })).toBeInTheDocument();
    });

    it('should have keyboard navigation support', () => {
      render(<FilterPanel />);
      
      const firstCheckbox = screen.getByLabelText("NL Hold'em");
      firstCheckbox.focus();
      
      expect(document.activeElement).toBe(firstCheckbox);
      
      // Simulate tab to next checkbox
      fireEvent.keyDown(firstCheckbox, { key: 'Tab' });
    });
  });
});