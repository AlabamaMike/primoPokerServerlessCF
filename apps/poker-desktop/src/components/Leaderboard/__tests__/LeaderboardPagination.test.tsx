import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LeaderboardPagination from '../LeaderboardPagination';

describe('LeaderboardPagination', () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 10,
    totalItems: 200,
    pageSize: 20,
    onPageChange: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders pagination info correctly', () => {
    render(<LeaderboardPagination {...defaultProps} />);

    expect(screen.getByText('Showing 1-20 of 200 players')).toBeInTheDocument();
  });

  it('shows correct info for middle page', () => {
    render(<LeaderboardPagination {...defaultProps} currentPage={5} />);

    expect(screen.getByText('Showing 81-100 of 200 players')).toBeInTheDocument();
  });

  it('shows correct info for last page', () => {
    render(<LeaderboardPagination {...defaultProps} currentPage={10} totalItems={195} />);

    expect(screen.getByText('Showing 181-195 of 195 players')).toBeInTheDocument();
  });

  it('renders previous and next buttons', () => {
    render(<LeaderboardPagination {...defaultProps} />);

    expect(screen.getByLabelText('Previous page')).toBeInTheDocument();
    expect(screen.getByLabelText('Next page')).toBeInTheDocument();
  });

  it('disables previous button on first page', () => {
    render(<LeaderboardPagination {...defaultProps} currentPage={1} />);

    const prevButton = screen.getByLabelText('Previous page');
    expect(prevButton).toBeDisabled();
    expect(prevButton).toHaveClass('cursor-not-allowed');
  });

  it('disables next button on last page', () => {
    render(<LeaderboardPagination {...defaultProps} currentPage={10} />);

    const nextButton = screen.getByLabelText('Next page');
    expect(nextButton).toBeDisabled();
    expect(nextButton).toHaveClass('cursor-not-allowed');
  });

  it('calls onPageChange when clicking previous/next', () => {
    render(<LeaderboardPagination {...defaultProps} currentPage={5} />);

    fireEvent.click(screen.getByLabelText('Previous page'));
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(4);

    fireEvent.click(screen.getByLabelText('Next page'));
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(6);
  });

  it('renders page numbers for small total pages', () => {
    render(<LeaderboardPagination {...defaultProps} totalPages={5} />);

    expect(screen.getByLabelText('Go to page 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 5')).toBeInTheDocument();
    expect(screen.queryByText('...')).not.toBeInTheDocument();
  });

  it('renders ellipsis for large page counts', () => {
    render(<LeaderboardPagination {...defaultProps} currentPage={5} totalPages={20} />);

    expect(screen.getByLabelText('Go to page 1')).toBeInTheDocument();
    expect(screen.getAllByText('...')).toHaveLength(2);
    expect(screen.getByLabelText('Go to page 20')).toBeInTheDocument();
  });

  it('highlights current page', () => {
    render(<LeaderboardPagination {...defaultProps} currentPage={5} />);

    const currentPageButton = screen.getByLabelText('Go to page 5');
    expect(currentPageButton).toHaveClass('bg-purple-600', 'text-white');
    expect(currentPageButton).toHaveAttribute('aria-current', 'page');
  });

  it('calls onPageChange when clicking page number', () => {
    render(<LeaderboardPagination {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Go to page 3'));
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(3);
  });

  it('handles keyboard navigation', () => {
    render(<LeaderboardPagination {...defaultProps} currentPage={5} />);

    const container = screen.getByRole('navigation');
    
    fireEvent.keyDown(container, { key: 'ArrowLeft' });
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(4);

    fireEvent.keyDown(container, { key: 'ArrowRight' });
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(6);
  });

  it('does not navigate beyond boundaries with keyboard', () => {
    render(<LeaderboardPagination {...defaultProps} currentPage={1} />);

    const container = screen.getByRole('navigation');
    fireEvent.keyDown(container, { key: 'ArrowLeft' });
    expect(defaultProps.onPageChange).not.toHaveBeenCalled();
  });

  it('renders jump to page input', () => {
    render(<LeaderboardPagination {...defaultProps} />);

    expect(screen.getByLabelText('Jump to page number')).toBeInTheDocument();
    expect(screen.getByText('Go to page:')).toBeInTheDocument();
  });

  it('handles jump to page input changes', () => {
    render(<LeaderboardPagination {...defaultProps} />);

    const input = screen.getByLabelText('Jump to page number') as HTMLInputElement;
    
    fireEvent.change(input, { target: { value: '7' } });
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(7);
  });

  it('validates jump to page input', () => {
    render(<LeaderboardPagination {...defaultProps} />);

    const input = screen.getByLabelText('Jump to page number');
    
    // Invalid page numbers should not trigger onPageChange
    fireEvent.change(input, { target: { value: '0' } });
    expect(defaultProps.onPageChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '11' } });
    expect(defaultProps.onPageChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'abc' } });
    expect(defaultProps.onPageChange).not.toHaveBeenCalled();
  });

  it('disables all controls when disabled prop is true', () => {
    render(<LeaderboardPagination {...defaultProps} disabled={true} />);

    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).toBeDisabled();
    expect(screen.getByLabelText('Jump to page number')).toBeDisabled();
    
    const pageButtons = screen.getAllByRole('button');
    pageButtons.forEach(button => {
      if (button.textContent && !button.textContent.includes('Previous') && !button.textContent.includes('Next')) {
        expect(button).toHaveClass('cursor-not-allowed', 'opacity-50');
      }
    });
  });

  it('does not render when totalPages is 1', () => {
    const { container } = render(<LeaderboardPagination {...defaultProps} totalPages={1} />);

    expect(container.firstChild).toBeNull();
  });

  it('shows correct page numbers near beginning', () => {
    render(<LeaderboardPagination {...defaultProps} currentPage={2} totalPages={20} />);

    expect(screen.getByLabelText('Go to page 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 5')).toBeInTheDocument();
    expect(screen.getByText('...')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 20')).toBeInTheDocument();
  });

  it('shows correct page numbers near end', () => {
    render(<LeaderboardPagination {...defaultProps} currentPage={18} totalPages={20} />);

    expect(screen.getByLabelText('Go to page 1')).toBeInTheDocument();
    expect(screen.getByText('...')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 16')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 17')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 18')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 19')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 20')).toBeInTheDocument();
  });
});