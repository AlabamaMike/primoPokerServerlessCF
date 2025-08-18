import { renderHook, act } from '@testing-library/react';
import { useDebounce, useDebouncedCallback } from '../useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('should debounce value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    );

    expect(result.current).toBe('initial');

    // Update value
    rerender({ value: 'updated', delay: 500 });
    
    // Should still be initial value
    expect(result.current).toBe('initial');

    // Fast forward time
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Now should be updated
    expect(result.current).toBe('updated');
  });

  it('should cancel pending updates when value changes rapidly', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    );

    // Multiple rapid updates
    rerender({ value: 'update1', delay: 500 });
    act(() => jest.advanceTimersByTime(200));
    
    rerender({ value: 'update2', delay: 500 });
    act(() => jest.advanceTimersByTime(200));
    
    rerender({ value: 'update3', delay: 500 });
    
    // Should still be initial
    expect(result.current).toBe('initial');

    // Fast forward to complete debounce
    act(() => jest.advanceTimersByTime(500));

    // Should have final value
    expect(result.current).toBe('update3');
  });

  it('should handle different types of values', () => {
    // Test with numbers
    const { result: numberResult } = renderHook(() => useDebounce(42, 100));
    expect(numberResult.current).toBe(42);

    // Test with objects
    const obj = { foo: 'bar' };
    const { result: objectResult } = renderHook(() => useDebounce(obj, 100));
    expect(objectResult.current).toBe(obj);

    // Test with arrays
    const arr = [1, 2, 3];
    const { result: arrayResult } = renderHook(() => useDebounce(arr, 100));
    expect(arrayResult.current).toBe(arr);
  });

  it('should handle delay changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    );

    rerender({ value: 'updated', delay: 100 });
    
    act(() => jest.advanceTimersByTime(100));
    
    expect(result.current).toBe('updated');
  });
});

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should debounce callback execution', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    // Call the debounced function multiple times
    act(() => {
      result.current('arg1');
      result.current('arg2');
      result.current('arg3');
    });

    // Callback should not have been called yet
    expect(callback).not.toHaveBeenCalled();

    // Fast forward time
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Callback should have been called once with last arguments
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('arg3');
  });

  it('should cancel pending calls when called rapidly', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current('first');
    });

    act(() => jest.advanceTimersByTime(200));

    act(() => {
      result.current('second');
    });

    act(() => jest.advanceTimersByTime(200));

    act(() => {
      result.current('third');
    });

    // Still not called
    expect(callback).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(500));

    // Called only once with last value
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('third');
  });

  it('should handle multiple arguments', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current('arg1', 'arg2', { foo: 'bar' });
    });

    act(() => jest.advanceTimersByTime(300));

    expect(callback).toHaveBeenCalledWith('arg1', 'arg2', { foo: 'bar' });
  });

  it('should preserve callback reference', () => {
    const callback = jest.fn();
    const { result, rerender } = renderHook(() => useDebouncedCallback(callback, 300));

    const firstReference = result.current;
    
    rerender();
    
    const secondReference = result.current;
    
    // References should be the same
    expect(firstReference).toBe(secondReference);
  });

  it('should clean up timeout on unmount', () => {
    const callback = jest.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current('test');
    });

    // Unmount before timeout completes
    unmount();

    act(() => jest.advanceTimersByTime(500));

    // Callback should not have been called
    expect(callback).not.toHaveBeenCalled();
  });

  it('should handle immediate consecutive calls', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    // Synchronous calls
    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current(i);
      }
    });

    act(() => jest.advanceTimersByTime(100));

    // Should only call once with last value
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(4);
  });

  it('should handle callback that returns a value', () => {
    const callback = jest.fn().mockReturnValue('result');
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => {
      result.current();
    });

    act(() => jest.advanceTimersByTime(100));

    expect(callback).toHaveBeenCalled();
  });
});