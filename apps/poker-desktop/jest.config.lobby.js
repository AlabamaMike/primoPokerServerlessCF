module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/stores/__tests__/lobby-store.test.ts',
    '**/components/LobbyV2/__tests__/*.test.tsx',
    '**/hooks/__tests__/useLobbyWebSocket.test.ts'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  collectCoverageFrom: [
    'src/stores/lobby-store.ts',
    'src/components/LobbyV2/**/*.{ts,tsx}',
    'src/hooks/useLobbyWebSocket.ts',
    '!src/components/LobbyV2/**/*.test.{ts,tsx}',
    '!src/components/LobbyV2/PrimoLobbyMockup.tsx',
    '!src/components/LobbyV2/LobbyMockup.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};