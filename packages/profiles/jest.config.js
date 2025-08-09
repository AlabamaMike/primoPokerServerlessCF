export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@primo-poker/shared$': '<rootDir>/../shared/src',
    '^@primo-poker/core$': '<rootDir>/../core/src',
  },
};