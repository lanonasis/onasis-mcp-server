/**
 * Unit tests for emergency admin routes
 */

import request from 'supertest';
import express from 'express';
import emergencyRouter from '../../../src/routes/emergency-admin';
import crypto from 'crypto';

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

// Mock Supabase (defer initialization to avoid TDZ under ESM/jest)
let mockSupabase: any;
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe('Emergency Admin Routes', () => {
  let app: express.Application;
  const TEST_EMERGENCY_TOKEN = 'test-emergency-token';

  beforeEach(() => {
    // Initialize Supabase mock per test
    mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(),
          })),
        })),
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(),
          })),
        })),
        upsert: jest.fn(),
      })),
      rpc: jest.fn(),
    };
    app = express();
    app.use(express.json());
    app.use('/api/v1', emergencyRouter);
    
    // Set environment variable for test
    process.env.EMERGENCY_BOOTSTRAP_TOKEN = TEST_EMERGENCY_TOKEN;
    
    jest.clearAllMocks();
  });

  describe('POST /api/v1/emergency/bootstrap-admin', () => {
    it('should reject requests without emergency token', async () => {
      const response = await request(app)
        .post('/api/v1/emergency/bootstrap-admin')
        .send({
          email: 'admin@test.com',
          organizationName: 'Test Org'
        })
        .expect(403);

      expect(response.body).toEqual({
        error: 'Forbidden'
      });
    });

    it('should reject requests with invalid emergency token', async () => {
      const response = await request(app)
        .post('/api/v1/emergency/bootstrap-admin')
        .set('x-emergency-token', 'invalid-token')
        .send({
          email: 'admin@test.com',
          organizationName: 'Test Org'
        })
        .expect(403);

      expect(response.body).toEqual({
        error: 'Forbidden'
      });
    });

    it('should reject requests with missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/emergency/bootstrap-admin')
        .set('x-emergency-token', TEST_EMERGENCY_TOKEN)
        .send({
          email: 'admin@test.com'
          // Missing organizationName
        })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing required fields: email, organizationName'
      });
    });

    it('should create bootstrap admin successfully with new user and organization', async () => {
      // Mock user doesn't exist
      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // User not found
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }); // Org not found

      // Mock successful user creation
      mockSupabase.from().insert().select().single.mockResolvedValueOnce({
        data: { id: 'user-123' },
        error: null,
      });

      // Mock successful organization creation
      mockSupabase.from().insert().select().single.mockResolvedValueOnce({
        data: { id: 'org-456' },
        error: null,
      });

      // Mock successful user-org link
      mockSupabase.from().upsert.mockResolvedValueOnce({ error: null });

      // Mock successful API key creation
      mockSupabase.from().insert().select().single.mockResolvedValueOnce({
        data: {
          id: 'key-789',
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        },
        error: null,
      });

      // Mock logging (optional)
      mockSupabase.rpc.mockResolvedValueOnce({ error: null });

      const response = await request(app)
        .post('/api/v1/emergency/bootstrap-admin')
        .set('x-emergency-token', TEST_EMERGENCY_TOKEN)
        .send({
          email: 'admin@test.com',
          organizationName: 'Test Org'
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Emergency admin API key created successfully',
        data: {
          api_key: expect.stringMatching(/^sk_test_[a-f0-9]{64}$/),
          key_id: 'key-789',
          organization_id: 'org-456',
          user_id: 'user-123',
          expires_at: expect.any(String),
        },
        warning: 'SAVE THIS API KEY - IT WILL NOT BE SHOWN AGAIN',
        next_steps: [
          '1. Save the API key securely',
          '2. Use it to authenticate and fix the main auth system',
          '3. Delete this emergency route file after fixing auth',
          '4. Regenerate production keys through proper auth flow'
        ]
      });

      // Verify API key format
      expect(response.body.data.api_key).toMatch(/^sk_test_[a-f0-9]{64}$/);
    });

    it('should handle existing user and organization', async () => {
      // Mock user exists
      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: { id: 'existing-user' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'existing-org' }, error: null });

      // Mock successful user-org link
      mockSupabase.from().upsert.mockResolvedValueOnce({ error: null });

      // Mock successful API key creation
      mockSupabase.from().insert().select().single.mockResolvedValueOnce({
        data: {
          id: 'key-789',
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        },
        error: null,
      });

      const response = await request(app)
        .post('/api/v1/emergency/bootstrap-admin')
        .set('x-emergency-token', TEST_EMERGENCY_TOKEN)
        .send({
          email: 'existing@test.com',
          organizationName: 'Existing Org'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user_id).toBe('existing-user');
      expect(response.body.data.organization_id).toBe('existing-org');
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      mockSupabase.from().select().eq().single.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .post('/api/v1/emergency/bootstrap-admin')
        .set('x-emergency-token', TEST_EMERGENCY_TOKEN)
        .send({
          email: 'admin@test.com',
          organizationName: 'Test Org'
        })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Emergency bootstrap failed',
        details: 'Database connection failed'
      });
    });

    it('should generate production keys in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Mock successful flow
      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: { id: 'user-123' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'org-456' }, error: null });
      
      mockSupabase.from().upsert.mockResolvedValueOnce({ error: null });
      mockSupabase.from().insert().select().single.mockResolvedValueOnce({
        data: { id: 'key-789', expires_at: new Date().toISOString() },
        error: null,
      });

      const response = await request(app)
        .post('/api/v1/emergency/bootstrap-admin')
        .set('x-emergency-token', TEST_EMERGENCY_TOKEN)
        .send({
          email: 'admin@test.com',
          organizationName: 'Test Org'
        })
        .expect(200);

      expect(response.body.data.api_key).toMatch(/^sk_live_[a-f0-9]{64}$/);

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('GET /api/v1/emergency/status', () => {
    it('should return emergency route status', async () => {
      const response = await request(app)
        .get('/api/v1/emergency/status')
        .expect(200);

      expect(response.body).toEqual({
        status: 'active',
        warning: 'Emergency route is active - remove after initial setup',
        environment: process.env.NODE_ENV || 'unknown'
      });
    });
  });
});