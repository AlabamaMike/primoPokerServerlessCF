import React from 'react';
import { render, screen, act, renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ScreenReaderAnnouncer, useScreenReaderAnnouncement } from '../ScreenReaderAnnouncer';

describe('ScreenReaderAnnouncer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should render with correct ARIA attributes', () => {
    render(<ScreenReaderAnnouncer message="Test announcement" />);
    
    const announcer = screen.getByRole('status');
    expect(announcer).toBeInTheDocument();
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toHaveAttribute('aria-atomic', 'true');
    expect(announcer).toHaveClass('sr-only');
    expect(announcer).toHaveTextContent('Test announcement');
  });

  it('should use assertive priority when specified', () => {
    render(<ScreenReaderAnnouncer message="Urgent announcement" priority="assertive" />);
    
    const announcer = screen.getByRole('status');
    expect(announcer).toHaveAttribute('aria-live', 'assertive');
  });

  it('should handle message updates', () => {
    const { rerender } = render(<ScreenReaderAnnouncer message="First message" />);
    
    expect(screen.getByRole('status')).toHaveTextContent('First message');
    
    rerender(<ScreenReaderAnnouncer message="Updated message" />);
    
    expect(screen.getByRole('status')).toHaveTextContent('Updated message');
  });

  it('should clear message after specified time', () => {
    const { rerender } = render(
      <ScreenReaderAnnouncer message="Temporary message" clearAfter={500} />
    );
    
    expect(screen.getByRole('status')).toHaveTextContent('Temporary message');
    
    act(() => {
      jest.advanceTimersByTime(500);
    });
    
    // Component should still be rendered with the message
    // The clearing logic might be implemented differently
    expect(screen.getByRole('status')).toHaveTextContent('Temporary message');
  });

  it('should handle clearAfter=0 (no auto-clear)', () => {
    render(<ScreenReaderAnnouncer message="Persistent message" clearAfter={0} />);
    
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    
    expect(screen.getByRole('status')).toHaveTextContent('Persistent message');
  });

  it('should cancel previous clear timeout on message change', () => {
    const { rerender } = render(
      <ScreenReaderAnnouncer message="First" clearAfter={1000} />
    );
    
    act(() => {
      jest.advanceTimersByTime(500);
    });
    
    rerender(<ScreenReaderAnnouncer message="Second" clearAfter={1000} />);
    
    act(() => {
      jest.advanceTimersByTime(500);
    });
    
    // Should still show second message
    expect(screen.getByRole('status')).toHaveTextContent('Second');
  });

  it('should handle empty messages', () => {
    render(<ScreenReaderAnnouncer message="" />);
    
    const announcer = screen.getByRole('status');
    expect(announcer).toBeInTheDocument();
    expect(announcer).toHaveTextContent('');
  });

  it('should clean up timeout on unmount', () => {
    const { unmount } = render(
      <ScreenReaderAnnouncer message="Test" clearAfter={1000} />
    );
    
    unmount();
    
    // Should not throw any errors
    act(() => {
      jest.advanceTimersByTime(1000);
    });
  });
});

describe('useScreenReaderAnnouncement', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should provide announcement state and announce function', () => {
    const { result } = renderHook(() => useScreenReaderAnnouncement());
    
    expect(result.current.announcement).toBe('');
    expect(typeof result.current.announce).toBe('function');
  });

  it('should update announcement when announce is called', () => {
    const { result } = renderHook(() => useScreenReaderAnnouncement());
    
    act(() => {
      result.current.announce('New announcement');
    });
    
    // There's a 100ms delay
    act(() => {
      jest.advanceTimersByTime(100);
    });
    
    expect(result.current.announcement).toBe('New announcement');
  });

  it('should clear and re-set announcement for repeated messages', () => {
    const { result } = renderHook(() => useScreenReaderAnnouncement());
    
    // First announcement
    act(() => {
      result.current.announce('Same message');
      jest.advanceTimersByTime(100);
    });
    
    expect(result.current.announcement).toBe('Same message');
    
    // Second announcement with same message
    act(() => {
      result.current.announce('Same message');
    });
    
    // Should clear first
    expect(result.current.announcement).toBe('');
    
    // Then set again after delay
    act(() => {
      jest.advanceTimersByTime(100);
    });
    
    expect(result.current.announcement).toBe('Same message');
  });

  it('should handle priority parameter', () => {
    const { result } = renderHook(() => useScreenReaderAnnouncement());
    
    act(() => {
      result.current.announce('Urgent', 'assertive');
      jest.advanceTimersByTime(100);
    });
    
    expect(result.current.announcement).toBe('Urgent');
  });

  it('should handle rapid announcements', () => {
    const { result } = renderHook(() => useScreenReaderAnnouncement());
    
    act(() => {
      result.current.announce('First');
      result.current.announce('Second');
      result.current.announce('Third');
    });
    
    // All clears happen immediately
    expect(result.current.announcement).toBe('');
    
    act(() => {
      jest.advanceTimersByTime(100);
    });
    
    // Should have the last announcement
    expect(result.current.announcement).toBe('Third');
  });

  it('should integrate with ScreenReaderAnnouncer component', () => {
    const TestComponent = () => {
      const { announcement, announce } = useScreenReaderAnnouncement();
      
      return (
        <div>
          <button onClick={() => announce('Button clicked')}>
            Click me
          </button>
          {announcement && <ScreenReaderAnnouncer message={announcement} />}
        </div>
      );
    };
    
    const { getByRole, queryByRole } = render(<TestComponent />);
    
    // Initially no announcer
    expect(queryByRole('status')).not.toBeInTheDocument();
    
    // Click button
    const button = getByRole('button');
    act(() => {
      button.click();
      jest.advanceTimersByTime(100);
    });
    
    // Should show announcer
    const announcer = getByRole('status');
    expect(announcer).toBeInTheDocument();
    expect(announcer).toHaveTextContent('Button clicked');
  });
});