import { useState, useCallback, useRef, useEffect } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  isIdle: boolean;
}

export interface AsyncActions<T> {
  execute: (...args: any[]) => Promise<T>;
  reset: () => void;
  setData: (data: T) => void;
  setError: (error: Error) => void;
}

/**
 * A custom hook for managing async operations with loading, error, and success states
 * @param asyncFunction - The async function to execute
 * @param immediate - Whether to execute immediately on mount (default: false)
 * @returns A tuple containing the async state and actions
 */
export function useAsync<T>(
  asyncFunction: (...args: any[]) => Promise<T>,
  immediate = false
): [AsyncState<T>, AsyncActions<T>] {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (...args: any[]) => {
      setState({
        data: null,
        error: null,
        isLoading: true,
        isError: false,
        isSuccess: false,
        isIdle: false,
      });

      try {
        const data = await asyncFunction(...args);
        
        if (mountedRef.current) {
          setState({
            data,
            error: null,
            isLoading: false,
            isError: false,
            isSuccess: true,
            isIdle: false,
          });
        }
        
        return data;
      } catch (error) {
        if (mountedRef.current) {
          // Properly handle different error types
          let errorObj: Error;
          
          if (error instanceof Error) {
            errorObj = error;
          } else if (typeof error === 'string') {
            errorObj = new Error(error);
          } else if (error && typeof error === 'object' && 'message' in error) {
            errorObj = new Error(String(error.message));
          } else {
            errorObj = new Error('An unknown error occurred');
          }
          
          setState({
            data: null,
            error: errorObj,
            isLoading: false,
            isError: true,
            isSuccess: false,
            isIdle: false,
          });
        }
        throw error;
      }
    },
    [asyncFunction]
  );

  const reset = useCallback(() => {
    setState({
      data: null,
      error: null,
      isLoading: false,
      isError: false,
      isSuccess: false,
      isIdle: true,
    });
  }, []);

  const setData = useCallback((data: T) => {
    setState({
      data,
      error: null,
      isLoading: false,
      isError: false,
      isSuccess: true,
      isIdle: false,
    });
  }, []);

  const setError = useCallback((error: Error) => {
    setState({
      data: null,
      error,
      isLoading: false,
      isError: true,
      isSuccess: false,
      isIdle: false,
    });
  }, []);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, execute]);

  return [state, { execute, reset, setData, setError }];
}