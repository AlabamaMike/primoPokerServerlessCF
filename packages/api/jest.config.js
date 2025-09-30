module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  },
  moduleNameMapper: {
    '^cloudflare:workers$': '<rootDir>/src/__mocks__/cloudflare-workers.ts',
    '^@primo-poker/types$': '<rootDir>/../types/src',
    '^@primo-poker/shared$': '<rootDir>/../shared/src',
    '^@primo-poker/core$': '<rootDir>/../core/src',
    '^@primo-poker/security$': '<rootDir>/../security/src',
    '^@primo-poker/persistence$': '<rootDir>/../persistence/src',
    '^@primo-poker/profiles$': '<rootDir>/../profiles/src',
    '^@primo-poker/logging$': '<rootDir>/../logging/src',
  },
};