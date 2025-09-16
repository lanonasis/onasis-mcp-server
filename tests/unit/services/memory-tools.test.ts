/**
 * Memory Management Tools Tests for Unified MCP Server
 */

import { LanonasisUnifiedMCPServer } from '../../../src/unified-mcp-server';
import { createClient } from '@supabase/supabase-js';

// Mock fetch for OpenAI API calls
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Mock Supabase client
jest.mock('@supabase/supabase-js');

describe('Memory Management Tools', () => {
  let server: LanonasisUnifiedMCPServer;
  let mockSupabase: any;

  beforeEach(() => {
    // Mock Supabase client methods
    mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          })),
          contains: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => ({
                range: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
              })),
            })),
          }),
          order: jest.fn(() => ({
            range: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
          })),
        })),
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ 
              data: { id: 'test-memory-id', title: 'Test Memory' }, 
              error: null 
            }),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ 
                data: { id: 'test-memory-id', title: 'Updated Memory' }, 
                error: null 
              }),
            })),
          })),
        })),
      })),
      rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    
    server = new LanonasisUnifiedMCPServer();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createMemoryTool', () => {
    it('should create memory with proper embedding', async () => {
      // Mock successful OpenAI embedding response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
      });

      const args = {
        title: 'Test Memory',
        content: 'This is a test memory content for embedding',
        memory_type: 'knowledge',
        tags: ['test', 'memory'],
        topic_id: 'test-topic-123',
      };

      const result = await server.createMemoryTool(args);

      expect(result.success).toBe(true);
      expect(result.memory).toBeDefined();
      expect(result.message).toBe('Memory created successfully');
      expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/embeddings', expect.any(Object));
    });

    it('should handle OpenAI API errors', async () => {
      // Mock failed OpenAI embedding response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      const args = {
        title: 'Test Memory',
        content: 'This is a test memory content',
      };

      const result = await server.createMemoryTool(args);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to generate embedding');
    });

    it('should handle Supabase database errors', async () => {
      // Mock successful OpenAI embedding response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
      });

      // Mock Supabase error
      mockSupabase.from.mockImplementation(() => ({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ 
              data: null, 
              error: new Error('Database error') 
            }),
          })),
        })),
      }));

      const args = {
        title: 'Test Memory',
        content: 'This is a test memory content',
      };

      const result = await server.createMemoryTool(args);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('searchMemoriesTool', () => {
    it('should search memories with embedding similarity', async () => {
      // Mock successful OpenAI embedding response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
      });

      // Mock successful Supabase RPC response
      mockSupabase.rpc.mockResolvedValue({
        data: [
          { id: 'memory-1', title: 'Test Memory 1', content: 'Content 1' },
          { id: 'memory-2', title: 'Test Memory 2', content: 'Content 2' },
        ],
        error: null,
      });

      const args = {
        query: 'test search query',
        limit: 10,
        threshold: 0.7,
      };

      const result = await server.searchMemoriesTool(args);

      expect(result.success).toBe(true);
      expect(result.memories).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.query).toBe(args.query);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('match_memories', expect.any(Object));
    });

    it('should filter memories by type', async () => {
      // Mock successful OpenAI embedding response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
      });

      // Mock Supabase RPC response with type-filtered memories
      mockSupabase.rpc.mockResolvedValue({
        data: [
          { id: 'memory-1', title: 'Knowledge Memory 1', content: 'Content 1', memory_type: 'knowledge' },
          { id: 'memory-2', title: 'Knowledge Memory 2', content: 'Content 2', memory_type: 'knowledge' },
        ],
        error: null,
      });

      const args = {
        query: 'test search query',
        memory_type: 'knowledge',
      };

      const result = await server.searchMemoriesTool(args);

      expect(result.success).toBe(true);
      expect(result.memories).toHaveLength(2);
    });

    it('should handle search errors gracefully', async () => {
      // Mock failed OpenAI embedding response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      const args = {
        query: 'test search query',
      };

      const result = await server.searchMemoriesTool(args);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to generate embedding for search');
    });
  });

  describe('getMemoryTool', () => {
    it('should retrieve memory by ID', async () => {
      const mockMemory = {
        id: 'test-memory-id',
        title: 'Test Memory',
        content: 'Test content',
        memory_type: 'knowledge',
        tags: ['test'],
      };

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: mockMemory, error: null }),
          })),
        })),
      }));

      const args = { id: 'test-memory-id' };
      const result = await server.getMemoryTool(args);

      expect(result.success).toBe(true);
      expect(result.memory).toEqual(mockMemory);
    });

    it('should handle memory not found', async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: null, error: new Error('Memory not found') }),
          })),
        })),
      }));

      const args = { id: 'non-existent-id' };
      const result = await server.getMemoryTool(args);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('updateMemoryTool', () => {
    it('should update memory without regenerating embedding', async () => {
      const mockUpdatedMemory = {
        id: 'test-memory-id',
        title: 'Updated Test Memory',
        content: 'Original content',
        updated_at: new Date().toISOString(),
      };

      mockSupabase.from.mockImplementation(() => ({
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: mockUpdatedMemory, error: null }),
            })),
          })),
        })),
      }));

      const args = {
        id: 'test-memory-id',
        title: 'Updated Test Memory',
      };

      const result = await server.updateMemoryTool(args);

      expect(result.success).toBe(true);
      expect(result.memory).toEqual(mockUpdatedMemory);
      expect(result.message).toBe('Memory updated successfully');
      expect(global.fetch).not.toHaveBeenCalled(); // No embedding regeneration
    });

    it('should update memory and regenerate embedding when content changes', async () => {
      // Mock successful OpenAI embedding response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ embedding: [0.4, 0.5, 0.6] }],
        }),
      });

      const mockUpdatedMemory = {
        id: 'test-memory-id',
        title: 'Test Memory',
        content: 'Updated content',
        memory_type: 'knowledge',
        updated_at: new Date().toISOString(),
      };

      mockSupabase.from.mockImplementation(() => ({
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: mockUpdatedMemory, error: null }),
            })),
          })),
        })),
      }));

      const args = {
        id: 'test-memory-id',
        content: 'Updated content',
      };

      const result = await server.updateMemoryTool(args);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/embeddings', expect.any(Object));
    });
  });

  describe('deleteMemoryTool', () => {
    it('should mark memory as deleted', async () => {
      const mockDeletedMemory = {
        id: 'test-memory-id',
        title: 'Test Memory',
        status: 'deleted',
      };

      mockSupabase.from.mockImplementation(() => ({
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: mockDeletedMemory, error: null }),
            })),
          })),
        })),
      }));

      const args = { id: 'test-memory-id' };
      const result = await server.deleteMemoryTool(args);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Memory deleted successfully');
      expect(result.deleted_id).toBe(args.id);
    });
  });

  describe('listMemoriesTool', () => {
    it('should list memories with pagination', async () => {
      const mockMemories = [
        { id: 'memory-1', title: 'Memory 1', memory_type: 'knowledge' },
        { id: 'memory-2', title: 'Memory 2', memory_type: 'project' },
      ];

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              range: jest.fn().mockResolvedValue({ data: mockMemories, error: null, count: 2 }),
            })),
          })),
        })),
      }));

      const args = {
        limit: 20,
        offset: 0,
        sort: 'updated_at',
        order: 'desc',
      };

      const result = await server.listMemoriesTool(args);

      expect(result.success).toBe(true);
      expect(result.memories).toEqual(mockMemories);
      expect(result.count).toBe(2);
    });

    it('should filter memories by type', async () => {
      const mockMemories = [
        { id: 'memory-1', title: 'Knowledge Memory 1', memory_type: 'knowledge' },
        { id: 'memory-2', title: 'Knowledge Memory 2', memory_type: 'knowledge' },
      ];

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => jest.fn(() => ({
            order: jest.fn(() => ({
              range: jest.fn().mockResolvedValue({ data: mockMemories, error: null, count: 2 }),
            })),
          }))),
        })),
      }));

      const args = {
        memory_type: 'knowledge',
      };

      const result = await server.listMemoriesTool(args);

      expect(result.success).toBe(true);
      expect(result.memories).toHaveLength(2);
      expect(result.memories.every(m => m.memory_type === 'knowledge')).toBe(true);
    });

    it('should filter memories by tags', async () => {
      const mockMemories = [
        { id: 'memory-1', title: 'Tagged Memory 1', tags: ['test', 'important'] },
        { id: 'memory-2', title: 'Tagged Memory 2', tags: ['test', 'documentation'] },
      ];

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            contains: jest.fn(() => ({
              order: jest.fn(() => ({
                range: jest.fn().mockResolvedValue({ data: mockMemories, error: null, count: 2 }),
              })),
            })),
          })),
        })),
      }));

      const args = {
        tags: ['test'],
      };

      const result = await server.listMemoriesTool(args);

      expect(result.success).toBe(true);
      expect(result.memories).toHaveLength(2);
    });
  });
});
