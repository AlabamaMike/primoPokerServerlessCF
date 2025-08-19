import React from 'react';
import { StatsPeriod } from '@primo-poker/shared';
import { clsx } from 'clsx';

interface TimePeriodFilterProps {
  selectedPeriod: StatsPeriod;
  onPeriodChange: (period: StatsPeriod) => void;
  disabled?: boolean;
}

const TimePeriodFilter: React.FC<TimePeriodFilterProps> = ({
  selectedPeriod,
  onPeriodChange,
  disabled = false
}) => {
  const periods = [
    { value: StatsPeriod.DAILY, label: 'Today', icon: '📅' },
    { value: StatsPeriod.WEEKLY, label: 'This Week', icon: '📊' },
    { value: StatsPeriod.MONTHLY, label: 'This Month', icon: '📈' },
    { value: StatsPeriod.YEARLY, label: 'This Year', icon: '🗓️' },
    { value: StatsPeriod.ALL_TIME, label: 'All Time', icon: '🏆' }
  ];

  return (
    <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-1">
      {periods.map((period) => (
        <button
          key={period.value}
          onClick={() => onPeriodChange(period.value)}
          disabled={disabled}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
            'focus:outline-none focus:ring-2 focus:ring-purple-500',
            selectedPeriod === period.value
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
              : 'text-slate-300 hover:text-white hover:bg-slate-700',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          aria-label={`Filter by ${period.label}`}
        >
          <span className="text-base">{period.icon}</span>
          <span>{period.label}</span>
        </button>
      ))}
    </div>
  );
};

export default TimePeriodFilter;