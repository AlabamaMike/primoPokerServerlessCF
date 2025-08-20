import { StateCreator, StoreMutatorIdentifier } from 'zustand';

type Logger = <
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f: StateCreator<T, Mps, Mcs>,
  name?: string
) => StateCreator<T, Mps, Mcs>;

type LoggerImpl = <T extends object>(
  f: StateCreator<T, [], []>,
  name?: string
) => StateCreator<T, [], []>;

const loggerImpl: LoggerImpl = (f, name) => (set, get, api) => {
  const loggedSet: typeof set = (...args) => {
    const prevState = get();
    set(...args);
    const nextState = get();
    
    console.group(`🔷 ${name || 'Store'} Update`);
    console.log('Previous State:', prevState);
    console.log('Next State:', nextState);
    console.log('Changes:', args[0]);
    console.groupEnd();
  };

  const origApi = f(loggedSet, get, api);
  
  // Also log initialization
  if (name) {
    console.log(`🔷 ${name} Store Initialized:`, origApi);
  }
  
  return origApi;
};

export const logger = loggerImpl as unknown as Logger;