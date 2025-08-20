import { renderHook, act } from '@testing-library/react';
import { useAsync } from '../useAsync';

describe('useAsync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with idle state', () => {
    const asyncFn = jest.fn();
    const { result } = renderHook(() => useAsync(asyncFn));
    
    const [state] = result.current;
    expect(state.isIdle).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.isError).toBe(false);
    expect(state.isSuccess).toBe(false);
    expect(state.data).toBeNull();
    expect(state.error).toBeNull();
  });

  it('should execute async function and handle success', async () => {
    const mockData = { test: 'data' };
    const asyncFn = jest.fn().mockResolvedValue(mockData);
    const { result } = renderHook(() => useAsync(asyncFn));
    
    let executeResult: any;
    await act(async () => {
      const [, actions] = result.current;
      executeResult = await actions.execute('arg1', 'arg2');
    });
    
    expect(asyncFn).toHaveBeenCalledWith('arg1', 'arg2');
    expect(executeResult).toEqual(mockData);
    
    const [state] = result.current;
    expect(state.isSuccess).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.data).toEqual(mockData);
    expect(state.error).toBeNull();
  });

  it('should handle errors properly', async () => {
    const mockError = new Error('Test error');
    const asyncFn = jest.fn().mockRejectedValue(mockError);
    const { result } = renderHook(() => useAsync(asyncFn));
    
    await act(async () => {
      const [, actions] = result.current;
      try {
        await actions.execute();
      } catch (error) {
        // Expected to throw
      }
    });
    
    const [state] = result.current;
    expect(state.isError).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.error).toEqual(mockError);
    expect(state.data).toBeNull();
  });

  it('should handle string errors', async () => {
    const asyncFn = jest.fn().mockRejectedValue('String error');
    const { result } = renderHook(() => useAsync(asyncFn));
    
    await act(async () => {
      const [, actions] = result.current;
      try {
        await actions.execute();
      } catch (error) {
        // Expected to throw
      }
    });
    
    const [state] = result.current;
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error?.message).toBe('String error');
  });

  it('should handle object errors with message', async () => {
    const asyncFn = jest.fn().mockRejectedValue({ message: 'Object error' });
    const { result } = renderHook(() => useAsync(asyncFn));
    
    await act(async () => {
      const [, actions] = result.current;
      try {
        await actions.execute();
      } catch (error) {
        // Expected to throw
      }
    });
    
    const [state] = result.current;
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error?.message).toBe('Object error');
  });

  it('should handle unknown errors', async () => {
    const asyncFn = jest.fn().mockRejectedValue(null);
    const { result } = renderHook(() => useAsync(asyncFn));
    
    await act(async () => {
      const [, actions] = result.current;
      try {
        await actions.execute();
      } catch (error) {
        // Expected to throw
      }
    });
    
    const [state] = result.current;
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error?.message).toBe('An unknown error occurred');
  });

  it('should reset state', async () => {
    const asyncFn = jest.fn().mockResolvedValue('data');
    const { result } = renderHook(() => useAsync(asyncFn));
    
    // Execute to change state
    await act(async () => {
      const [, actions] = result.current;
      await actions.execute();
    });
    
    // Reset
    act(() => {
      const [, actions] = result.current;
      actions.reset();
    });
    
    const [state] = result.current;
    expect(state.isIdle).toBe(true);
    expect(state.data).toBeNull();
    expect(state.error).toBeNull();
  });

  it('should set data manually', () => {
    const asyncFn = jest.fn();
    const { result } = renderHook(() => useAsync(asyncFn));
    const mockData = { test: 'manual data' };
    
    act(() => {
      const [, actions] = result.current;
      actions.setData(mockData);
    });
    
    const [state] = result.current;
    expect(state.isSuccess).toBe(true);
    expect(state.data).toEqual(mockData);
  });

  it('should set error manually', () => {
    const asyncFn = jest.fn();
    const { result } = renderHook(() => useAsync(asyncFn));
    const mockError = new Error('Manual error');
    
    act(() => {
      const [, actions] = result.current;
      actions.setError(mockError);
    });
    
    const [state] = result.current;
    expect(state.isError).toBe(true);
    expect(state.error).toEqual(mockError);
  });

  it('should execute immediately when immediate flag is true', async () => {
    const asyncFn = jest.fn().mockResolvedValue('immediate data');
    const { result } = renderHook(() => useAsync(asyncFn, true));
    
    // Wait for immediate execution
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    
    expect(asyncFn).toHaveBeenCalled();
    const [state] = result.current;
    expect(state.isSuccess).toBe(true);
    expect(state.data).toBe('immediate data');
  });

  it('should not update state after unmount', async () => {
    const asyncFn = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('data'), 100)));
    const { result, unmount } = renderHook(() => useAsync(asyncFn));
    
    act(() => {
      const [, actions] = result.current;
      actions.execute();
    });
    
    // Unmount before promise resolves
    unmount();
    
    // Wait for promise to resolve
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });
    
    // No error should be thrown
  });
});