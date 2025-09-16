/**
 * System Tools Tests for Unified MCP Server
 */

import { LanonasisUnifiedMCPServer } from '../../../src/unified-mcp-server';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
jest.mock('@supabase/supabase-js');

// Mock process methods
const originalProcess = process;

describe('System Tools', () => {
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
            range: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
          })),
        })),
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ 
              data: { id: 'test-project-id', name: 'Test Project' }, 
              error: null 
            }),
          })),
        })),
      })),
      rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    
    server = new LanonasisUnifiedMCPServer();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getHealthStatusTool', () => {
    it('should return basic health status', async () => {
      const args = {};
      const result = await server.getHealthStatusTool(args);

      expect(result.status).toBe('healthy');
      expect(result.version).toBe('1.0.0');
      expect(result.server_info).toBeDefined();
      expect(result.services).toBeDefined();
    });

    it('should include metrics when requested', async () => {
      // Mock Supabase count responses
      mockSupabase.from.mockImplementation((table: string) => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(),
          })),
          count: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                count: jest.fn().mockResolvedValue({ count: table === 'memory_entries' ? 42 : 5, error: null }),
              })),
            })),
          })),
        })),
      }));

      const args = { include_metrics: true };
      const result = await server.getHealthStatusTool(args);

      expect(result.metrics).toBeDefined();
      expect(result.metrics?.total_memories).toBe(42);
      expect(result.metrics?.active_api_keys).toBe(5);
    });

    it('should handle metrics errors gracefully', async () => {
      // Mock Supabase error
      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(),
          })),
          count: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                count: jest.fn().mockResolvedValue({ count: null, error: new Error('Count failed') }),
              })),
            })),
          })),
        })),
      }));

      const args = { include_metrics: true };
      const result = await server.getHealthStatusTool(args);

      expect(result.metrics_error).toBeDefined();
    });
  });

  describe('getAuthStatusTool', () => {
    it('should return authentication status', async () => {
      const args = {};
      const result = await server.getAuthStatusTool(args);

      expect(result.status).toBe('authenticated');
      expect(result.server).toBe('lanonasis-mcp-server');
      expect(result.capabilities).toContain('memory_management');
      expect(result.capabilities).toContain('api_key_management');
    });
  });

  describe('getOrganizationInfoTool', () => {
    it('should return organization information', async () => {
      const args = {};
      const result = await server.getOrganizationInfoTool(args);

      expect(result.name).toBe('Lanonasis Organization');
      expect(result.plan).toBe('enterprise');
      expect(result.features).toContain('unlimited_memories');
    });

    it('should include usage statistics when requested', async () => {
      // Mock Supabase count responses
      mockSupabase.from.mockImplementation((table: string) => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(),
          })),
          count: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                count: jest.fn().mockResolvedValue({ count: table === 'memory_entries' ? 125 : 8, error: null }),
              })),
            })),
          })),
        })),
      }));

      // Mock getActiveApiKeyCount method
      (server as any).getActiveApiKeyCount = jest.fn().mockResolvedValue(8);

      const args = { include_usage: true };
      const result = await server.getOrganizationInfoTool(args);

      expect(result.usage).toBeDefined();
      expect(result.usage?.memories_used).toBe(125);
      expect(result.usage?.api_keys_active).toBe(8);
    });

    it('should handle usage errors gracefully', async () => {
      // Mock Supabase error
      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(),
          })),
          count: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                count: jest.fn().mockResolvedValue({ count: null, error: new Error('Usage query failed') }),
              })),
            })),
          })),
        })),
      }));

      const args = { include_usage: true };
      const result = await server.getOrganizationInfoTool(args);

      expect(result.usage_error).toBeDefined();
    });
  });

  describe('createProjectTool', () => {
    it('should create a new project', async () => {
      const args = {
        name: 'Test Project',
        description: 'A test project for unit testing',
      };

      const result = await server.createProjectTool(args);

      expect(result.success).toBe(true);
      expect(result.project).toBeDefined();
      expect(result.project?.name).toBe(args.name);
      expect(result.message).toBe('Project created successfully');
    });

    it('should handle project creation errors', async () => {
      mockSupabase.from.mockImplementation(() => ({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ 
              data: null, 
              error: new Error('Project creation failed') 
            }),
          })),
        })),
      }));

      const args = {
        name: 'Test Project',
      };

      const result = await server.createProjectTool(args);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('listProjectsTool', () => {
    it('should list active projects', async () => {
      const mockProjects = [
        { id: 'project-1', name: 'Project 1', description: 'First project', status: 'active' },
        { id: 'project-2', name: 'Project 2', description: 'Second project', status: 'active' },
      ];

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              range: jest.fn().mockResolvedValue({ data: mockProjects, error: null }),
            })),
          })),
        })),
      }));

      const args = {};
      const result = await server.listProjectsTool(args);

      expect(result.success).toBe(true);
      expect(result.projects).toEqual(mockProjects);
      expect(result.count).toBe(2);
    });

    it('should filter projects by organization ID', async () => {
      const mockProjects = [
        { id: 'project-1', name: 'Org Project 1', organization_id: 'org-123' },
        { id: 'project-2', name: 'Org Project 2', organization_id: 'org-123' },
      ];

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => jest.fn(() => ({
            order: jest.fn(() => ({
              range: jest.fn().mockResolvedValue({ data: mockProjects, error: null }),
            })),
          }))),
        })),
      }));

      const args = { organization_id: 'org-123' };
      const result = await server.listProjectsTool(args);

      expect(result.success).toBe(true);
      expect(result.projects).toHaveLength(2);
      expect(result.projects.every(p => p.organization_id === 'org-123')).toBe(true);
    });
  });

  describe('getConfigTool', () => {
    it('should return full configuration', async () => {
      const args = {};
      const result = await server.getConfigTool(args);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config?.server).toBeDefined();
      expect(result.config?.features).toBeDefined();
    });

    it('should return specific configuration key', async () => {
      const args = { key: 'server.version' };
      const result = await server.getConfigTool(args);

      expect(result.success).toBe(true);
      expect(result.key).toBe('server.version');
      expect(result.value).toBe('1.0.0');
    });

    it('should return configuration section', async () => {
      const args = { section: 'features' };
      const result = await server.getConfigTool(args);

      expect(result.success).toBe(true);
      expect(result.section).toBe('features');
      expect(result.config).toBeDefined();
    });

    it('should handle unknown configuration key', async () => {
      const args = { key: 'unknown.key' };
      const result = await server.getConfigTool(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle unknown configuration section', async () => {
      const args = { section: 'unknown_section' };
      const result = await server.getConfigTool(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('setConfigTool', () => {
    it('should reject unauthorized configuration changes', async () => {
      const args = {
        key: 'unauthorized_config',
        value: 'test_value',
      };

      const result = await server.setConfigTool(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not modifiable');
    });

    it('should allow authorized configuration changes', async () => {
      const args = {
        key: 'rate_limit',
        value: '200',
      };

      const result = await server.setConfigTool(args);

      expect(result.success).toBe(true);
      expect(result.message).toContain('would be set');
    });

    it('should handle max_connections configuration changes', async () => {
      const args = {
        key: 'max_connections',
        value: '500',
      };

      const result = await server.setConfigTool(args);

      expect(result.success).toBe(true);
      expect(result.message).toContain('would be set');
    });
  });
});
