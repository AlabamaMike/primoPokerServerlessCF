module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    '../packages/*/src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapping: {
    '^@primo-poker/shared$': '<rootDir>/../packages/shared/src',
    '^@primo-poker/core$': '<rootDir>/../packages/core/src',
    '^@primo-poker/security$': '<rootDir>/../packages/security/src',
    '^@primo-poker/persistence$': '<rootDir>/../packages/persistence/src',
    '^@primo-poker/api$': '<rootDir>/../packages/api/src',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
