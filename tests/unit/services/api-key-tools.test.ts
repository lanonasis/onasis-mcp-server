/**
 * API Key Management Tools Tests for Unified MCP Server
 */

import { LanonasisUnifiedMCPServer } from '../../../src/unified-mcp-server';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
jest.mock('@supabase/supabase-js');

describe('API Key Management Tools', () => {
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
          order: jest.fn(() => ({
            range: jest.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ 
              data: { id: 'test-api-key-id', name: 'Test API Key', key_secret: 'secret-123' }, 
              error: null 
            }),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ 
                data: { id: 'test-api-key-id', name: 'Test API Key', key_secret: 'new-secret-456' }, 
                error: null 
              }),
            })),
          })),
        })),
      })),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    
    server = new LanonasisUnifiedMCPServer();
    
    // Mock the generateApiKey method
    (server as any).generateApiKey = jest.fn().mockReturnValue('generated-api-key-secret');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createApiKeyTool', () => {
    it('should create a new API key', async () => {
      const args = {
        name: 'Test API Key',
        description: 'API key for testing purposes',
        access_level: 'authenticated',
      };

      const result = await server.createApiKeyTool(args);

      expect(result.success).toBe(true);
      // narrow before dereferencing
      if (!result.success) throw new Error('Expected success');
      expect(result.api_key).toBeDefined();
      expect(result.api_key!.name).toBe(args.name);
      expect(result.message).toBe('API key created successfully');
    });

    it('should create API key with default access level', async () => {
      const args = {
        name: 'Test API Key',
      };

      const result = await server.createApiKeyTool(args);

      expect(result.success).toBe(true);
    });

    it('should handle API key creation errors', async () => {
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
        name: 'Test API Key',
      };

      const result = await server.createApiKeyTool(args);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('listApiKeysTool', () => {
    it('should list active API keys by default', async () => {
      const mockApiKeys = [
        { id: 'key-1', name: 'API Key 1', key_prefix: 'onasis_', access_level: 'authenticated' },
        { id: 'key-2', name: 'API Key 2', key_prefix: 'onasis_', access_level: 'admin' },
      ];

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              range: jest.fn().mockResolvedValue({ data: mockApiKeys, error: null }),
            })),
          })),
        })),
      }));

      const args = {};
      const result = await server.listApiKeysTool(args);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.api_keys).toEqual(mockApiKeys);
      expect(result.count).toBe(2);
    });

    it('should list all API keys when active_only is false', async () => {
      const mockApiKeys = [
        { id: 'key-1', name: 'Active Key', is_active: true },
        { id: 'key-2', name: 'Inactive Key', is_active: false },
      ];

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          order: jest.fn(() => ({
            range: jest.fn().mockResolvedValue({ data: mockApiKeys, error: null }),
          })),
        })),
      }));

      const args = { active_only: false };
      const result = await server.listApiKeysTool(args);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.api_keys).toHaveLength(2);
    });

    it('should filter API keys by project ID', async () => {
      const mockApiKeys = [
        { id: 'key-1', name: 'Project Key 1', project_id: 'project-123' },
        { id: 'key-2', name: 'Project Key 2', project_id: 'project-123' },
      ];

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => jest.fn(() => ({
            order: jest.fn(() => ({
              range: jest.fn().mockResolvedValue({ data: mockApiKeys, error: null }),
            })),
          }))),
        })),
      }));

      const args = { project_id: 'project-123' };
      const result = await server.listApiKeysTool(args);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.api_keys).toHaveLength(2);
      // cast for compatibility with test shape
      expect((result.api_keys as any[]).every((key) => (key as any).project_id === 'project-123')).toBe(true);
    });
  });

  describe('rotateApiKeyTool', () => {
    it('should rotate API key secret', async () => {
      const mockRotatedKey = {
        id: 'test-api-key-id',
        name: 'Test API Key',
        key_prefix: 'onasis_',
        key_secret: 'new-rotated-secret',
      };

      mockSupabase.from.mockImplementation(() => ({
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: mockRotatedKey, error: null }),
            })),
          })),
        })),
      }));

      const args = { key_id: 'test-api-key-id' };
      const result = await server.rotateApiKeyTool(args);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.api_key).toEqual(mockRotatedKey as any);
      expect(result.message).toBe('API key rotated successfully');
      expect((server as any).generateApiKey).toHaveBeenCalled();
    });

    it('should handle API key rotation errors', async () => {
      mockSupabase.from.mockImplementation(() => ({
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ 
                data: null, 
                error: new Error('Key not found') 
              }),
            })),
          })),
        })),
      }));

      const args = { key_id: 'non-existent-key-id' };
      const result = await server.rotateApiKeyTool(args);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('deleteApiKeyTool', () => {
    it('should mark API key as inactive', async () => {
      const mockDeletedKey = {
        id: 'test-api-key-id',
        name: 'Test API Key',
      };

      mockSupabase.from.mockImplementation(() => ({
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: mockDeletedKey, error: null }),
            })),
          })),
        })),
      }));

      const args = { key_id: 'test-api-key-id' };
      const result = await server.deleteApiKeyTool(args);

      expect(result.success).toBe(true);
      expect(result.message).toContain('deleted successfully');
      expect(result.deleted_id).toBe(args.key_id);
    });

    it('should handle API key deletion errors', async () => {
      mockSupabase.from.mockImplementation(() => ({
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ 
                data: null, 
                error: new Error('Key not found') 
              }),
            })),
          })),
        })),
      }));

      const args = { key_id: 'non-existent-key-id' };
      const result = await server.deleteApiKeyTool(args);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
