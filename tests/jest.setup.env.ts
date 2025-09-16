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

// 4. Provide minimal config object so utils/logger doesn\'t explode
jest.mock('../src/config/environment', () => ({
  config: {
    LOG_FORMAT: 'simple',
    LOG_LEVEL: 'error',
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    OPENAI_API_KEY: 'test-openai-key',
    JWT_SECRET: 'test-jwt-secret',
    API_KEY_ENCRYPTION_KEY: 'this_is_a_32_character_test_key!!',
  },
}));

// Extend jest timeout globally (some E2E suites spin up servers)
jest.setTimeout(15000);
