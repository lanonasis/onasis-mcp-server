/**
 * Unit tests for authentication middleware
 */

import request from 'supertest';
import express from 'express';
import { authenticateApiKey } from '../../../src/middleware/auth';

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
  })),
};

jest.mock('../../../src/config/environment', () => ({
  getSupabaseClient: () => mockSupabase,
}));

describe('Authentication Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    jest.clearAllMocks();
  });

  describe('authenticateApiKey', () => {
    it('should reject requests without API key', async () => {
      app.use('/test', authenticateApiKey);
      app.get('/test', (req, res) => res.json({ success: true }));

      const response = await request(app)
        .get('/test')
        .expect(401);

      expect(response.body).toEqual({
        error: 'Unauthorized - API key required'
      });
    });

    it('should reject requests with invalid API key format', async () => {
      app.use('/test', authenticateApiKey);
      app.get('/test', (req, res) => res.json({ success: true }));

      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer invalid-key')
        .expect(401);

      expect(response.body).toEqual({
        error: 'Unauthorized - Invalid API key format'
      });
    });

    it('should accept valid API key from Authorization header', async () => {
      // Mock valid API key lookup
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: 'key-123',
          organization_id: 'org-456',
          scopes: ['read', 'write'],
          expires_at: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
        },
        error: null,
      });

      app.use('/test', authenticateApiKey);
      app.get('/test', (req, res) => res.json({ 
        success: true, 
        orgId: req.organization?.id 
      }));

      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer sk_test_' + 'a'.repeat(64))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.orgId).toBe('org-456');
    });

    it('should accept valid API key from x-api-key header', async () => {
      // Mock valid API key lookup
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: 'key-123',
          organization_id: 'org-456',
          scopes: ['read', 'write'],
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
        error: null,
      });

      app.use('/test', authenticateApiKey);
      app.get('/test', (req, res) => res.json({ success: true }));

      const response = await request(app)
        .get('/test')
        .set('x-api-key', 'sk_test_' + 'a'.repeat(64))
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject expired API keys', async () => {
      // Mock expired API key
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          id: 'key-123',
          organization_id: 'org-456',
          scopes: ['read', 'write'],
          expires_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        },
        error: null,
      });

      app.use('/test', authenticateApiKey);
      app.get('/test', (req, res) => res.json({ success: true }));

      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer sk_test_' + 'a'.repeat(64))
        .expect(401);

      expect(response.body).toEqual({
        error: 'Unauthorized - API key expired'
      });
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      mockSupabase.from().select().eq().single.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      app.use('/test', authenticateApiKey);
      app.get('/test', (req, res) => res.json({ success: true }));

      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer sk_test_' + 'a'.repeat(64))
        .expect(500);

      expect(response.body.error).toBe('Authentication service unavailable');
    });
  });
});