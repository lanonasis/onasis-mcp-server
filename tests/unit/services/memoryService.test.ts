/**
 * Unit tests for memory service
 */

import { MemoryService } from '../../../src/services/memoryService';
import type { Memory, MemorySearchOptions } from '../../../src/types/memory';

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(() => ({
          limit: jest.fn(() => ({
            single: jest.fn(),
          })),
          range: jest.fn(),
        })),
        limit: jest.fn(),
        range: jest.fn(),
        single: jest.fn(),
      })),
      in: jest.fn(() => ({
        order: jest.fn(() => ({
          limit: jest.fn(),
          range: jest.fn(),
        })),
      })),
      textSearch: jest.fn(() => ({
        order: jest.fn(() => ({
          limit: jest.fn(),
          range: jest.fn(),
        })),
      })),
      order: jest.fn(() => ({
        limit: jest.fn(),
        range: jest.fn(),
      })),
      limit: jest.fn(),
      range: jest.fn(),
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
    })),
    delete: jest.fn(() => ({
      eq: jest.fn(),
    })),
  })),
  rpc: jest.fn(),
};

// Mock OpenAI
const mockOpenAI = {
  embeddings: {
    create: jest.fn(),
  },
};

jest.mock('../../../src/config/environment', () => ({
  getSupabaseClient: () => mockSupabase,
}));

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => mockOpenAI),
}));

describe('MemoryService', () => {
  let memoryService: MemoryService;
  const mockAuthContext = {
    organizationId: 'org-123',
    userId: 'user-456',
    scopes: ['read', 'write'],
  };

  beforeEach(() => {
    memoryService = new MemoryService();
    jest.clearAllMocks();
  });

  describe('createMemory', () => {
    it('should create memory with embedding successfully', async () => {
      const mockEmbedding = Array(1536).fill(0.1); // Mock OpenAI embedding
      mockOpenAI.embeddings.create.mockResolvedValueOnce({
        data: [{ embedding: mockEmbedding }],
      });

      const mockMemoryData = {
        id: 'memory-123',
        title: 'Test Memory',
        content: 'Test content',
        memory_type: 'knowledge',
        tags: ['test'],
        organization_id: 'org-123',
        created_by: 'user-456',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabase.from().insert().select().single.mockResolvedValueOnce({
        data: mockMemoryData,
        error: null,
      });

      const result = await memoryService.createMemory(
        {
          title: 'Test Memory',
          content: 'Test content',
          memory_type: 'knowledge',
          tags: ['test'],
        },
        mockAuthContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMemoryData);
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'Test Memory\n\nTest content',
        encoding_format: 'float',
      });
    });

    it('should handle embedding generation failure', async () => {
      mockOpenAI.embeddings.create.mockRejectedValueOnce(
        new Error('OpenAI API error')
      );

      const result = await memoryService.createMemory(
        {
          title: 'Test Memory',
          content: 'Test content',
          memory_type: 'knowledge',
        },
        mockAuthContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to generate embedding: OpenAI API error');
    });

    it('should handle database insertion failure', async () => {
      const mockEmbedding = Array(1536).fill(0.1);
      mockOpenAI.embeddings.create.mockResolvedValueOnce({
        data: [{ embedding: mockEmbedding }],
      });

      mockSupabase.from().insert().select().single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await memoryService.createMemory(
        {
          title: 'Test Memory',
          content: 'Test content',
          memory_type: 'knowledge',
        },
        mockAuthContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create memory: Database error');
    });

    it('should validate required fields', async () => {
      const result = await memoryService.createMemory(
        {
          title: '',
          content: 'Test content',
          memory_type: 'knowledge',
        },
        mockAuthContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Title and content are required');
    });
  });

  describe('searchMemories', () => {
    it('should search memories with semantic similarity', async () => {
      const mockEmbedding = Array(1536).fill(0.2);
      mockOpenAI.embeddings.create.mockResolvedValueOnce({
        data: [{ embedding: mockEmbedding }],
      });

      const mockSearchResults = [
        {
          id: 'memory-1',
          title: 'Result 1',
          content: 'Content 1',
          similarity: 0.85,
        },
        {
          id: 'memory-2',
          title: 'Result 2',
          content: 'Content 2',
          similarity: 0.75,
        },
      ];

      mockSupabase.rpc.mockResolvedValueOnce({
        data: mockSearchResults,
        error: null,
      });

      const searchOptions: MemorySearchOptions = {
        query: 'test search',
        limit: 10,
        threshold: 0.7,
      };

      const result = await memoryService.searchMemories(searchOptions, mockAuthContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSearchResults);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('search_memories_by_embedding', {
        query_embedding: mockEmbedding,
        organization_id: 'org-123',
        similarity_threshold: 0.7,
        max_results: 10,
      });
    });

    it('should fall back to text search when embedding fails', async () => {
      mockOpenAI.embeddings.create.mockRejectedValueOnce(
        new Error('OpenAI API error')
      );

      const mockTextResults = [
        {
          id: 'memory-1',
          title: 'Text Result 1',
          content: 'Content 1',
        },
      ];

      mockSupabase.from().select().textSearch().order().limit.mockResolvedValueOnce({
        data: mockTextResults,
        error: null,
      });

      const searchOptions: MemorySearchOptions = {
        query: 'test search',
        limit: 10,
      };

      const result = await memoryService.searchMemories(searchOptions, mockAuthContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTextResults);
    });

    it('should filter by memory type and tags', async () => {
      const mockEmbedding = Array(1536).fill(0.2);
      mockOpenAI.embeddings.create.mockResolvedValueOnce({
        data: [{ embedding: mockEmbedding }],
      });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const searchOptions: MemorySearchOptions = {
        query: 'test search',
        memory_type: 'knowledge',
        tags: ['important'],
      };

      await memoryService.searchMemories(searchOptions, mockAuthContext);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('search_memories_by_embedding', {
        query_embedding: mockEmbedding,
        organization_id: 'org-123',
        similarity_threshold: 0.7,
        max_results: 10,
        memory_type_filter: 'knowledge',
        tags_filter: ['important'],
      });
    });
  });

  describe('getMemory', () => {
    it('should retrieve memory by ID successfully', async () => {
      const mockMemory = {
        id: 'memory-123',
        title: 'Test Memory',
        content: 'Test content',
        organization_id: 'org-123',
      };

      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: mockMemory,
        error: null,
      });

      const result = await memoryService.getMemory('memory-123', mockAuthContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMemory);
    });

    it('should handle memory not found', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }, // Not found
      });

      const result = await memoryService.getMemory('nonexistent', mockAuthContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Memory not found');
    });
  });

  describe('listMemories', () => {
    it('should list memories with pagination', async () => {
      const mockMemories = [
        { id: 'memory-1', title: 'Memory 1' },
        { id: 'memory-2', title: 'Memory 2' },
      ];

      mockSupabase.from().select().eq().order().range.mockResolvedValueOnce({
        data: mockMemories,
        error: null,
      });

      const result = await memoryService.listMemories(
        { offset: 0, limit: 20 },
        mockAuthContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMemories);
    });

    it('should filter by memory type and tags', async () => {
      const mockMemories = [{ id: 'memory-1', title: 'Filtered Memory' }];

      mockSupabase.from().select().eq().order().range.mockResolvedValueOnce({
        data: mockMemories,
        error: null,
      });

      const result = await memoryService.listMemories(
        {
          offset: 0,
          limit: 20,
          memory_type: 'knowledge',
          tags: ['important'],
        },
        mockAuthContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMemories);
    });
  });

  describe('updateMemory', () => {
    it('should update memory successfully', async () => {
      const mockEmbedding = Array(1536).fill(0.3);
      mockOpenAI.embeddings.create.mockResolvedValueOnce({
        data: [{ embedding: mockEmbedding }],
      });

      const mockUpdatedMemory = {
        id: 'memory-123',
        title: 'Updated Memory',
        content: 'Updated content',
      };

      mockSupabase.from().update().eq().select().single.mockResolvedValueOnce({
        data: mockUpdatedMemory,
        error: null,
      });

      const result = await memoryService.updateMemory(
        'memory-123',
        {
          title: 'Updated Memory',
          content: 'Updated content',
        },
        mockAuthContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockUpdatedMemory);
    });
  });

  describe('deleteMemory', () => {
    it('should delete memory successfully', async () => {
      mockSupabase.from().delete().eq.mockResolvedValueOnce({
        error: null,
      });

      const result = await memoryService.deleteMemory('memory-123', mockAuthContext);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Memory deleted successfully');
    });

    it('should handle deletion failure', async () => {
      mockSupabase.from().delete().eq.mockResolvedValueOnce({
        error: { message: 'Delete failed' },
      });

      const result = await memoryService.deleteMemory('memory-123', mockAuthContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete memory: Delete failed');
    });
  });
});