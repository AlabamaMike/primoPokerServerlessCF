import { useState, useCallback } from 'react';

/**
 * A custom hook for managing boolean toggle state
 * @param initialState - Initial state of the toggle (default: false)
 * @returns A tuple containing the current state and functions to manipulate it
 */
export function useToggle(initialState: boolean = false) {
  const [state, setState] = useState(initialState);

  const toggle = useCallback(() => {
    setState(prev => !prev);
  }, []);

  const setTrue = useCallback(() => {
    setState(true);
  }, []);

  const setFalse = useCallback(() => {
    setState(false);
  }, []);

  return [state, { toggle, setTrue, setFalse, setState }] as const;
}