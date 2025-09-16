import dotenv from 'dotenv';

// Load test env vars
dotenv.config({ path: '.env.test' });

// Generic mocks that many suites rely on ---------------------------------

// 1. Supabase client – provide a very permissive stub so tests can chain
//    .from().select().eq() ... without throwing.
import { jest } from '@jest/globals';

const supabaseStub = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(() => ({
          range: jest.fn(),
          limit: jest.fn(),
          single: jest.fn(),
        })),
        single: jest.fn(),
      })),
      in: jest.fn(),
      contains: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
      range: jest.fn(),
      textSearch: jest.fn(),
    })),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })),
  rpc: jest.fn(),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseStub,
}));

// 2. OpenAI – provide an embeddings.create stub
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    embeddings: { create: jest.fn() },
  })),
}));

// 3. Fetch – many tools rely on global.fetch
if (!global.fetch) {
  global.fetch = jest.fn() as any;
}

// 4. Provide complete config object for tests
jest.mock('../src/config/environment', () => ({
  config: {
    NODE_ENV: 'test',
    PORT: 3000,
    HOST: 'localhost',
    ONASIS_CORE_URL: 'https://api.lanonasis.com',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_KEY: 'test-anon-key',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    JWT_SECRET: 'test-jwt-secret-for-testing-only',
    JWT_EXPIRES_IN: '24h',
    API_KEY_ENCRYPTION_KEY: 'this_is_a_32_character_test_key!!',
    API_KEY_PREFIX_DEVELOPMENT: 'sk_test_',
    API_KEY_PREFIX_PRODUCTION: 'sk_live_',
    API_KEY_DEFAULT_EXPIRY_DAYS: 365,
    MCP_ENABLED: true,
    MCP_ACCESS_REQUEST_EXPIRY_HOURS: 24,
    MCP_SESSION_TIMEOUT_HOURS: 8,
    MCP_MAX_TOOLS_PER_KEY: 10,
    OPENAI_API_KEY: 'test-openai-key',
    REDIS_URL: 'redis://localhost:6379',
    REDIS_PASSWORD: undefined,
    REDIS_KEY_PREFIX: 'maas:test:',
    REDIS_API_KEY_TTL: 300,
    REDIS_SESSION_TTL: 28800,
    LOG_LEVEL: 'error',
    LOG_FORMAT: 'simple',
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 100,
    API_VERSION: 'v1',
    API_PREFIX: '/api',
    SECURITY_ALERT_ENABLED: true,
    SECURITY_ALERT_THRESHOLD_CRITICAL: 5,
    SECURITY_ALERT_THRESHOLD_HIGH: 10,
    ANOMALY_DETECTION_ENABLED: true,
    ANOMALY_DETECTION_SENSITIVITY: 0.85,
    AUTO_SUSPEND_FAILED_AUTH_ATTEMPTS: 10,
    AUTO_SUSPEND_RATE_LIMIT_VIOLATIONS: 50,
    AUTO_SUSPEND_ANOMALY_SCORE: 0.95,
    HSM_ENABLED: false,
    PROXY_TOKEN_ENABLED: true,
    PROXY_TOKEN_EXPIRY_HOURS: 1,
    PROXY_TOKEN_MAX_USES: 100,
    BACKUP_ENABLED: true,
    BACKUP_RETENTION_DAYS: 30,
    BACKUP_ENCRYPTION_ENABLED: true,
    KEY_ROTATION_REMINDER_DAYS: 30,
    KEY_ROTATION_ENFORCE_DAYS: 90,
    ANALYTICS_ENABLED: true,
    USAGE_TRACKING: true,
    ANALYTICS_BATCH_SIZE: 100,
    ANALYTICS_FLUSH_INTERVAL_MS: 60000,
    METRICS_RETENTION_DAYS: 90,
    METRICS_AGGREGATION_ENABLED: true,
    METRICS_AGGREGATION_INTERVALS: 'hour,day,week,month',
    ENABLE_METRICS: true,
    METRICS_PORT: 9090,
    CORS_ORIGIN: 'http://localhost:3000,http://localhost:3001',
    CORS_CREDENTIALS: true,
  },
  isDevelopment: false,
  isProduction: false,
  isTest: true,
  getCurrentApiKeyPrefix: jest.fn(() => 'sk_test_'),
  getAggregationIntervals: jest.fn(() => ['hour', 'day', 'week', 'month']),
  getCorsOrigins: jest.fn(() => ['http://localhost:3000', 'http://localhost:3001']),
}));

// 5. Mock url module to handle import.meta.url
jest.mock('url', () => ({
  fileURLToPath: jest.fn(() => '/mocked/file/path.ts'),
}));

// 7. Mock the unified MCP server to prevent ES module import issues
jest.mock('../src/unified-mcp-server', () => ({
  LanonasisUnifiedMCPServer: jest.fn().mockImplementation(() => ({
    app: {
      listen: jest.fn((port, callback) => {
        if (callback) callback();
        return { close: jest.fn() };
      }),
      use: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
    },
    server: {
      setRequestHandler: jest.fn(),
      close: jest.fn(),
    },
    httpServer: {
      listen: jest.fn(),
      close: jest.fn(),
    },
    wsServer: {
      on: jest.fn(),
      close: jest.fn(),
    },
    // Methods that tests expect
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    startWebSocketServer: jest.fn().mockResolvedValue(undefined),
    startSSEServer: jest.fn().mockResolvedValue(undefined),
    startHTTPServer: jest.fn().mockResolvedValue(undefined),
    handleRequest: jest.fn().mockResolvedValue({ result: 'mocked' }),
    setupToolHandlers: jest.fn(),
    validateApiKey: jest.fn().mockResolvedValue(true),
    authenticateRequest: jest.fn().mockResolvedValue({ user: { id: 'test-user' } }),
    // Tool handler methods
    createMemory: jest.fn().mockResolvedValue({ id: 'test-memory' }),
    searchMemories: jest.fn().mockResolvedValue([]),
    getMemory: jest.fn().mockResolvedValue({ id: 'test-memory' }),
    updateMemory: jest.fn().mockResolvedValue({ id: 'test-memory' }),
    deleteMemory: jest.fn().mockResolvedValue(undefined),
    listMemories: jest.fn().mockResolvedValue([]),
    getHealthStatus: jest.fn().mockResolvedValue({ status: 'healthy' }),
    getAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
    getOrganizationInfo: jest.fn().mockResolvedValue({ id: 'test-org' }),
    createApiKey: jest.fn().mockResolvedValue({ id: 'test-key' }),
    listApiKeys: jest.fn().mockResolvedValue([]),
    rotateApiKey: jest.fn().mockResolvedValue({ id: 'test-key' }),
    deleteApiKey: jest.fn().mockResolvedValue(undefined),
    createProject: jest.fn().mockResolvedValue({ id: 'test-project' }),
    listProjects: jest.fn().mockResolvedValue([]),
    getConfig: jest.fn().mockResolvedValue({}),
    setConfig: jest.fn().mockResolvedValue(undefined),
  })),
}));

// 8. Mock child_process and cross-spawn for integration tests
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn(), pipe: jest.fn() },
    stderr: { on: jest.fn(), pipe: jest.fn() },
    on: jest.fn(),
    kill: jest.fn(),
  })),
}));

jest.mock('cross-spawn', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    stdout: { on: jest.fn(), pipe: jest.fn() },
    stderr: { on: jest.fn(), pipe: jest.fn() },
    on: jest.fn(),
    kill: jest.fn(),
  })),
}));

// 9. Mock WebSocket Server and HTTP modules
jest.mock('ws', () => ({
  WebSocketServer: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
    clients: new Set(),
  })),
  WebSocket: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1,
  })),
}));

jest.mock('http', () => ({
  createServer: jest.fn(() => ({
    listen: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
  })),
}));

// Mock express more carefully to maintain compatibility
const originalExpress = jest.requireActual('express');
jest.mock('express', () => {
  const mockExpress = () => {
    const app = originalExpress();
    // Add missing properties for supertest
    app.address = jest.fn(() => ({ port: 3000 }));
    return app;
  };
  // Copy over all the static methods from original express
  Object.setPrototypeOf(mockExpress, originalExpress);
  Object.assign(mockExpress, originalExpress);
  return mockExpress;
});

// 10. Mock winston logger to prevent file system operations in tests
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    level: 'info',
  })),
  format: {
    combine: jest.fn(() => ({})),
    timestamp: jest.fn(() => ({})),
    errors: jest.fn(() => ({})),
    json: jest.fn(() => ({})),
    colorize: jest.fn(() => ({})),
    simple: jest.fn(() => ({})),
    printf: jest.fn(() => ({})),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

// Extend jest timeout globally (some E2E suites spin up servers)
jest.setTimeout(15000);

// CRITICAL: Ensure NODE_ENV is properly set for process.env checks in health routes
process.env.NODE_ENV = 'test';

// Ensure NODE_ENV stays 'test' throughout the test execution
Object.defineProperty(process.env, 'NODE_ENV', {
  value: 'test',
  writable: false,
  enumerable: true,
  configurable: false
});
