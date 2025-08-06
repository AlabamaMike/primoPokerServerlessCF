/**
 * Jest configuration for comprehensive test suite
 * Includes parallel execution optimization for faster CI/CD
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.test.js'
  ],
  moduleNameMapper: {
    '^@primo-poker/shared$': '<rootDir>/packages/shared/src',
    '^@primo-poker/core$': '<rootDir>/packages/core/src',
    '^@primo-poker/persistence$': '<rootDir>/packages/persistence/src',
    '^@primo-poker/security$': '<rootDir>/packages/security/src',
    '^@primo-poker/api$': '<rootDir>/packages/api/src'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  collectCoverageFrom: [
    'packages/*/src/**/*.{ts,tsx}',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/*.test.{ts,tsx}',
    '!packages/*/src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  testTimeout: 30000,
  clearMocks: true,
  verbose: true,
  // Parallel execution configuration
  maxWorkers: process.env.CI ? 2 : '50%', // 2 workers in CI, 50% of CPUs locally
  maxConcurrency: 5, // Limit concurrent tests per worker
  // Test isolation for reliable parallel execution
  resetMocks: true,
  restoreMocks: true,
  // Fail fast in CI to save resources
  bail: process.env.CI ? 1 : 0
};