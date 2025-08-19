import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TimePeriodFilter from '../TimePeriodFilter';
import { StatsPeriod } from '@primo-poker/shared';

describe('TimePeriodFilter', () => {
  const defaultProps = {
    selectedPeriod: StatsPeriod.ALL_TIME,
    onPeriodChange: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all time period buttons', () => {
    render(<TimePeriodFilter {...defaultProps} />);

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('This Week')).toBeInTheDocument();
    expect(screen.getByText('This Month')).toBeInTheDocument();
    expect(screen.getByText('This Year')).toBeInTheDocument();
    expect(screen.getByText('All Time')).toBeInTheDocument();
  });

  it('shows correct icons for each period', () => {
    render(<TimePeriodFilter {...defaultProps} />);

    expect(screen.getByText('📅')).toBeInTheDocument(); // Today
    expect(screen.getByText('📊')).toBeInTheDocument(); // This Week
    expect(screen.getByText('📈')).toBeInTheDocument(); // This Month
    expect(screen.getByText('🗓️')).toBeInTheDocument(); // This Year
    expect(screen.getByText('🏆')).toBeInTheDocument(); // All Time
  });

  it('highlights the selected period', () => {
    render(<TimePeriodFilter {...defaultProps} selectedPeriod={StatsPeriod.WEEKLY} />);

    const weekButton = screen.getByText('This Week').closest('button')!;
    expect(weekButton).toHaveClass('bg-purple-600', 'text-white');
    
    const todayButton = screen.getByText('Today').closest('button')!;
    expect(todayButton).not.toHaveClass('bg-purple-600');
    expect(todayButton).toHaveClass('text-slate-300');
  });

  it('calls onPeriodChange when clicking a period', () => {
    render(<TimePeriodFilter {...defaultProps} />);

    fireEvent.click(screen.getByText('Today'));
    expect(defaultProps.onPeriodChange).toHaveBeenCalledWith(StatsPeriod.DAILY);

    fireEvent.click(screen.getByText('This Week'));
    expect(defaultProps.onPeriodChange).toHaveBeenCalledWith(StatsPeriod.WEEKLY);

    fireEvent.click(screen.getByText('This Month'));
    expect(defaultProps.onPeriodChange).toHaveBeenCalledWith(StatsPeriod.MONTHLY);

    fireEvent.click(screen.getByText('This Year'));
    expect(defaultProps.onPeriodChange).toHaveBeenCalledWith(StatsPeriod.YEARLY);

    fireEvent.click(screen.getByText('All Time'));
    expect(defaultProps.onPeriodChange).toHaveBeenCalledWith(StatsPeriod.ALL_TIME);
  });

  it('disables all buttons when disabled prop is true', () => {
    render(<TimePeriodFilter {...defaultProps} disabled={true} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
      expect(button).toHaveClass('opacity-50', 'cursor-not-allowed');
    });
  });

  it('does not call onPeriodChange when disabled', () => {
    render(<TimePeriodFilter {...defaultProps} disabled={true} />);

    fireEvent.click(screen.getByText('Today'));
    expect(defaultProps.onPeriodChange).not.toHaveBeenCalled();
  });

  it('has proper accessibility labels', () => {
    render(<TimePeriodFilter {...defaultProps} />);

    expect(screen.getByLabelText('Filter by Today')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by This Week')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by This Month')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by This Year')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by All Time')).toBeInTheDocument();
  });

  it('maintains focus outline when using keyboard navigation', () => {
    render(<TimePeriodFilter {...defaultProps} />);

    const todayButton = screen.getByText('Today').closest('button')!;
    todayButton.focus();

    expect(todayButton).toHaveClass('focus:ring-2', 'focus:ring-purple-500');
  });

  it('applies hover styles correctly', () => {
    render(<TimePeriodFilter {...defaultProps} />);

    const unselectedButton = screen.getByText('Today').closest('button')!;
    expect(unselectedButton).toHaveClass('hover:text-white', 'hover:bg-slate-700');
  });

  it('renders within a container with proper styling', () => {
    const { container } = render(<TimePeriodFilter {...defaultProps} />);

    const filterContainer = container.firstChild;
    expect(filterContainer).toHaveClass('bg-slate-800/50', 'rounded-lg', 'p-1');
  });
});