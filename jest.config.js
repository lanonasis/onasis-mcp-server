export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '<rootDir>/tests/**/*.(test|spec).(ts|js)'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/.next/'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'esnext',
        target: 'es2020',
        moduleResolution: 'node'
      }
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol|chalk|ora)/)'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/index.js',
    '!src/types/**/*',
    '!src/netlify/**/*',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
  setupFilesAfterEnv: [
    '<rootDir>/tests/jest.setup.env.ts'
  ],
  testTimeout: 10000,
  verbose: true,
  // Handle ES modules and path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
};