module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/components/Admin/__tests__/*.test.tsx',
    '**/hooks/__tests__/useAdminApi.test.ts',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/jest-setup.ts'],
  collectCoverageFrom: [
    'src/components/Admin/**/*.{ts,tsx}',
    'src/hooks/useAdminApi.ts',
    '!src/components/Admin/**/*.test.{ts,tsx}',
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