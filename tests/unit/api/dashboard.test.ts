/**
 * Unit tests for dashboard API routes
 */

import request from 'supertest';
import express from 'express';
import { dashboardRouter } from '../../../src/api/dashboard';
import { MemoryService } from '../../../src/services/memoryService';

// Mock MemoryService
jest.mock('../../../src/services/memoryService');

describe('Dashboard API Routes', () => {
  let app: express.Application;
  let mockMemoryService: jest.Mocked<MemoryService>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/dashboard', dashboardRouter);

    // Reset mocks
    jest.clearAllMocks();
    mockMemoryService = MemoryService.prototype as jest.Mocked<MemoryService>;
  });

  describe('GET /api/dashboard/overview', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/dashboard/overview')
        .expect(401);

      expect(response.body).toEqual({ error: 'API key required' });
    });

    it('should return overview data with valid API key', async () => {
      const mockStats = {
        total_memories: 1543,
        memories_by_type: {
          knowledge: 850,
          conversation: 450,
          context: 243,
          project: 0,
          reference: 0,
          personal: 0,
          workflow: 0
        },
        total_size_bytes: 52428800,
        avg_access_count: 3.7,
        recent_memories: []
      };

      mockMemoryService.getMemoryStats = jest.fn().mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/dashboard/overview')
        .set('Authorization', 'Bearer test-api-key')
        .expect(200);

      expect(response.body).toHaveProperty('memories');
      expect(response.body).toHaveProperty('queue');
      expect(response.body.memories).toHaveProperty('total', 1543);
      expect(response.body.memories).toHaveProperty('byType');
      expect(response.body.queue).toHaveProperty('pending');
      expect(response.body.queue).toHaveProperty('completed');
    });
  });

  describe('GET /api/dashboard/recent', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/dashboard/recent')
        .expect(401);

      expect(response.body).toEqual({ error: 'API key required' });
    });

    it('should return recent memories with pagination', async () => {
      const mockMemories = {
        memories: [
          {
            id: '123',
            title: 'Test Memory',
            content: 'Test content',
            memory_type: 'knowledge',
            tags: ['test'],
            user_id: 'user-1',
            organization_id: 'org-1',
            created_at: '2025-01-15T10:30:00Z',
            updated_at: '2025-01-15T10:30:00Z',
            access_count: 5
          }
        ],
        total: 1
      };

      mockMemoryService.listMemories = jest.fn().mockResolvedValue(mockMemories);

      const response = await request(app)
        .get('/api/dashboard/recent?page=1&limit=20')
        .set('Authorization', 'Bearer test-api-key')
        .expect(200);

      expect(response.body).toHaveProperty('memories');
      expect(response.body).toHaveProperty('total', 1);
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 20);
      expect(response.body.memories).toHaveLength(1);
    });

    it('should filter by userId when provided', async () => {
      const mockMemories = {
        memories: [],
        total: 0
      };

      mockMemoryService.listMemories = jest.fn().mockResolvedValue(mockMemories);

      await request(app)
        .get('/api/dashboard/recent?userId=user-123')
        .set('Authorization', 'Bearer test-api-key')
        .expect(200);

      expect(mockMemoryService.listMemories).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-123' }),
        expect.any(Object),
        'test-api-key'
      );
    });
  });

  describe('GET /api/dashboard/search-analytics', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/dashboard/search-analytics')
        .expect(401);

      expect(response.body).toEqual({ error: 'API key required' });
    });

    it('should return search analytics data', async () => {
      const response = await request(app)
        .get('/api/dashboard/search-analytics')
        .set('Authorization', 'Bearer test-api-key')
        .expect(200);

      expect(response.body).toHaveProperty('totalSearches');
      expect(response.body).toHaveProperty('averageSimilarity');
      expect(response.body).toHaveProperty('topQueries');
      expect(response.body).toHaveProperty('searchModes');
      expect(response.body.searchModes).toHaveProperty('semantic');
      expect(response.body.searchModes).toHaveProperty('keyword');
      expect(response.body.searchModes).toHaveProperty('hybrid');
    });
  });

  describe('GET /api/dashboard/queue/jobs', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/dashboard/queue/jobs')
        .expect(401);

      expect(response.body).toEqual({ error: 'API key required' });
    });

    it('should return queue jobs data', async () => {
      const response = await request(app)
        .get('/api/dashboard/queue/jobs')
        .set('Authorization', 'Bearer test-api-key')
        .expect(200);

      expect(response.body).toHaveProperty('jobs');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.jobs)).toBe(true);
    });
  });

  describe('GET /api/dashboard/tags', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/dashboard/tags')
        .expect(401);

      expect(response.body).toEqual({ error: 'API key required' });
    });

    it('should return tag cloud data', async () => {
      const mockMemories = {
        memories: [
          {
            id: '1',
            title: 'Memory 1',
            content: 'Content',
            memory_type: 'knowledge',
            tags: ['ai', 'ml'],
            user_id: 'user-1',
            organization_id: 'org-1',
            created_at: '2025-01-15T10:30:00Z',
            updated_at: '2025-01-15T10:30:00Z',
            access_count: 5
          },
          {
            id: '2',
            title: 'Memory 2',
            content: 'Content',
            memory_type: 'knowledge',
            tags: ['ai', 'neural-networks'],
            user_id: 'user-1',
            organization_id: 'org-1',
            created_at: '2025-01-15T10:30:00Z',
            updated_at: '2025-01-15T10:30:00Z',
            access_count: 3
          }
        ],
        total: 2
      };

      mockMemoryService.listMemories = jest.fn().mockResolvedValue(mockMemories);

      const response = await request(app)
        .get('/api/dashboard/tags')
        .set('Authorization', 'Bearer test-api-key')
        .expect(200);

      expect(response.body).toHaveProperty('tags');
      expect(Array.isArray(response.body.tags)).toBe(true);
      
      // Should have 'ai' tag with count 2
      const aiTag = response.body.tags.find((t: any) => t.tag === 'ai');
      expect(aiTag).toBeDefined();
      expect(aiTag.count).toBe(2);
    });

    it('should sort tags by frequency', async () => {
      const mockMemories = {
        memories: [
          {
            id: '1',
            title: 'Memory 1',
            content: 'Content',
            memory_type: 'knowledge',
            tags: ['popular', 'rare'],
            user_id: 'user-1',
            organization_id: 'org-1',
            created_at: '2025-01-15T10:30:00Z',
            updated_at: '2025-01-15T10:30:00Z',
            access_count: 5
          },
          {
            id: '2',
            title: 'Memory 2',
            content: 'Content',
            memory_type: 'knowledge',
            tags: ['popular'],
            user_id: 'user-1',
            organization_id: 'org-1',
            created_at: '2025-01-15T10:30:00Z',
            updated_at: '2025-01-15T10:30:00Z',
            access_count: 3
          }
        ],
        total: 2
      };

      mockMemoryService.listMemories = jest.fn().mockResolvedValue(mockMemories);

      const response = await request(app)
        .get('/api/dashboard/tags')
        .set('Authorization', 'Bearer test-api-key')
        .expect(200);

      expect(response.body.tags[0].tag).toBe('popular');
      expect(response.body.tags[0].count).toBe(2);
      expect(response.body.tags[1].tag).toBe('rare');
      expect(response.body.tags[1].count).toBe(1);
    });
  });
});
