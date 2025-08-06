/**
 * Jest Configuration for Phase 3B.2 Tests
 * 
 * Comprehensive test setup for BettingEngine, DeckManager, and GameTable integration
 */

module.exports = {
  // TypeScript support
  preset: 'ts-jest',
  
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.test.js'
  ],
  
  // File extensions to consider
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // TypeScript transformation
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  
  // Module name mapping for monorepo packages
  moduleNameMapper: {
    '^@primo-poker/shared$': '<rootDir>/packages/shared/src',
    '^@primo-poker/core$': '<rootDir>/packages/core/src',
    '^@primo-poker/persistence$': '<rootDir>/packages/persistence/src',
    '^@primo-poker/security$': '<rootDir>/packages/security/src',
    '^@primo-poker/api$': '<rootDir>/packages/api/src'
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/jest.setup.phase-3b2.ts',
    '<rootDir>/tests/jest.setup.phase-3b2.d.ts'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'packages/*/src/**/*.{ts,tsx}',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/*.test.{ts,tsx}',
    '!packages/*/src/**/index.ts'
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Coverage thresholds for Phase 3B.2 components
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './packages/core/src/betting-engine.ts': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './packages/core/src/deck-manager.ts': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  
  // Test timeout (increased for integration tests)
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Collect coverage from all files (only in CI to improve dev performance)
  collectCoverage: process.env.CI === 'true',
  
  // Verbose output for detailed test results
  verbose: true,
  
  // Test suites organization
  projects: [
    {
      displayName: 'Unit Tests',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      testEnvironment: 'node'
    },
    {
      displayName: 'Integration Tests', 
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      testEnvironment: 'node',
      testTimeout: 30000
    },
    {
      displayName: 'E2E Tests',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
      testEnvironment: 'node',
      testTimeout: 60000
    }
  ],
  
  // Global test variables
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  },
  
  // Test result processors
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './test-reports',
      filename: 'phase-3b2-test-report.html',
      expand: true,
      hideIcon: false
    }]
  ]
}
