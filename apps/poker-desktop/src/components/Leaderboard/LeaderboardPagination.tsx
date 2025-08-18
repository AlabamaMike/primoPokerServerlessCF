import React from 'react';
import { clsx } from 'clsx';

interface LeaderboardPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

const LeaderboardPagination: React.FC<LeaderboardPaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  disabled = false
}) => {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;
    
    if (totalPages <= maxVisible) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first, last, and surrounding pages
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    
    if (e.key === 'ArrowLeft' && currentPage > 1) {
      onPageChange(currentPage - 1);
    } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div 
      className="flex items-center justify-between gap-4 p-4"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="navigation"
      aria-label="Pagination"
    >
      {/* Info */}
      <div className="text-sm text-slate-400">
        Showing {startItem}-{endItem} of {totalItems} players
      </div>

      {/* Page Controls */}
      <div className="flex items-center gap-2">
        {/* Previous Button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || disabled}
          className={clsx(
            'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
            'focus:outline-none focus:ring-2 focus:ring-purple-500',
            currentPage === 1 || disabled
              ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
          )}
          aria-label="Previous page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Previous
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => (
            <React.Fragment key={index}>
              {page === '...' ? (
                <span className="px-2 text-slate-500">...</span>
              ) : (
                <button
                  onClick={() => onPageChange(page as number)}
                  disabled={disabled}
                  className={clsx(
                    'min-w-[40px] h-10 rounded-lg text-sm font-medium transition-all',
                    'focus:outline-none focus:ring-2 focus:ring-purple-500',
                    currentPage === page
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                  aria-label={`Go to page ${page}`}
                  aria-current={currentPage === page ? 'page' : undefined}
                >
                  {page}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Next Button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || disabled}
          className={clsx(
            'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
            'focus:outline-none focus:ring-2 focus:ring-purple-500',
            currentPage === totalPages || disabled
              ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
          )}
          aria-label="Next page"
        >
          Next
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Jump to page */}
      <div className="flex items-center gap-2">
        <label htmlFor="jump-to-page" className="text-sm text-slate-400">
          Go to page:
        </label>
        <input
          id="jump-to-page"
          type="number"
          min="1"
          max={totalPages}
          value={currentPage}
          onChange={(e) => {
            const page = parseInt(e.target.value, 10);
            if (!isNaN(page) && page >= 1 && page <= totalPages) {
              onPageChange(page);
            }
          }}
          disabled={disabled}
          className={clsx(
            'w-16 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700',
            'text-center text-sm text-white',
            'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent',
            disabled && 'cursor-not-allowed opacity-50'
          )}
          aria-label="Jump to page number"
        />
      </div>
    </div>
  );
};

export default LeaderboardPagination;