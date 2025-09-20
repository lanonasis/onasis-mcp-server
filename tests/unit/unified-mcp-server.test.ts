/**
 * Unit tests for Lanonasis Unified MCP Server
 * Tests all protocols and tools implementations
 */

import { LanonasisUnifiedMCPServer } from '../../src/unified-mcp-server';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createClient } from '@supabase/supabase-js';

// Mock external dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('@supabase/supabase-js');
jest.mock('express');
jest.mock('ws');
jest.mock('http');

describe('LanonasisUnifiedMCPServer', () => {
  let server: LanonasisUnifiedMCPServer;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create server instance
    server = new LanonasisUnifiedMCPServer();
  });

  afterEach(() => {
    // Clean up any resources
    jest.restoreAllMocks();
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      expect(server.config.httpPort).toBe(3001);
      expect(server.config.wsPort).toBe(3002);
      expect(server.config.ssePort).toBe(3003);
      expect(server.config.host).toBe('0.0.0.0');
    });

    it('should respect environment variables for configuration', () => {
      process.env.PORT = '4000';
      process.env.MCP_WS_PORT = '4001';
      process.env.MCP_SSE_PORT = '4002';
      process.env.MCP_HOST = '127.0.0.1';
      
      const newServer = new LanonasisUnifiedMCPServer();
      
      expect(newServer.config.httpPort).toBe(4000);
      expect(newServer.config.wsPort).toBe(4001);
      expect(newServer.config.ssePort).toBe(4002);
      expect(newServer.config.host).toBe('127.0.0.1');
    });

    it('should initialize Supabase client', () => {
      expect(createClient).toHaveBeenCalledWith(
        server.config.supabaseUrl,
        server.config.supabaseKey
      );
    });
  });

  describe('Tool Initialization', () => {
    it('should initialize all 17+ tools', () => {
      const tools = server.initializeTools();
      expect(Object.keys(tools)).toHaveLength(17);
      
      // Memory Management Tools
      expect(tools.create_memory).toBeDefined();
      expect(tools.search_memories).toBeDefined();
      expect(tools.get_memory).toBeDefined();
      expect(tools.update_memory).toBeDefined();
      expect(tools.delete_memory).toBeDefined();
      expect(tools.list_memories).toBeDefined();
      
      // API Key Management Tools
      expect(tools.create_api_key).toBeDefined();
      expect(tools.list_api_keys).toBeDefined();
      expect(tools.rotate_api_key).toBeDefined();
      expect(tools.delete_api_key).toBeDefined();
      
      // System & Organization Tools
      expect(tools.get_health_status).toBeDefined();
      expect(tools.get_auth_status).toBeDefined();
      expect(tools.get_organization_info).toBeDefined();
      expect(tools.create_project).toBeDefined();
      expect(tools.list_projects).toBeDefined();
      expect(tools.get_config).toBeDefined();
      expect(tools.set_config).toBeDefined();
    });

    it('should have correct tool definitions', () => {
      const toolDefinitions = server.getToolDefinitions();
      expect(toolDefinitions).toHaveLength(17);
      
      // Check that all tools have proper definitions
      const toolNames = toolDefinitions.map(tool => tool.name);
      expect(toolNames).toContain('create_memory');
      expect(toolNames).toContain('search_memories');
      expect(toolNames).toContain('get_memory');
      expect(toolNames).toContain('update_memory');
      expect(toolNames).toContain('delete_memory');
      expect(toolNames).toContain('list_memories');
      expect(toolNames).toContain('create_api_key');
      expect(toolNames).toContain('list_api_keys');
      expect(toolNames).toContain('rotate_api_key');
      expect(toolNames).toContain('delete_api_key');
      expect(toolNames).toContain('get_health_status');
      expect(toolNames).toContain('get_auth_status');
      expect(toolNames).toContain('get_organization_info');
      expect(toolNames).toContain('create_project');
      expect(toolNames).toContain('list_projects');
      expect(toolNames).toContain('get_config');
      expect(toolNames).toContain('set_config');
    });
  });

  describe('Stdio Server', () => {
    it('should create MCP server instance', async () => {
      await server.startStdioServer();
      expect(Server).toHaveBeenCalled();
    });

    it('should set up request handlers', async () => {
      await server.startStdioServer();
      expect(server.mcpServer?.setRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('HTTP Server', () => {
    it('should set up express middleware', async () => {
      await server.startHttpServer();
      // Add assertions for middleware setup
    });

    it('should set up health endpoint', async () => {
      await server.startHttpServer();
      // Add assertions for health endpoint
    });

    it('should set up tools endpoints', async () => {
      await server.startHttpServer();
      // Add assertions for tools endpoints
    });
  });

  describe('WebSocket Server', () => {
    it('should create WebSocket server', async () => {
      await server.startWebSocketServer();
      // Add assertions for WebSocket server creation
    });

    it('should handle WebSocket connections', async () => {
      await server.startWebSocketServer();
      // Add assertions for connection handling
    });
  });

  describe('SSE Server', () => {
    it('should create SSE server', async () => {
      await server.startSSEServer();
      // Add assertions for SSE server creation
    });

    it('should handle SSE connections', async () => {
      await server.startSSEServer();
      // Add assertions for connection handling
    });
  });

  describe('Unified Server Startup', () => {
    it('should start all enabled protocols by default', async () => {
      await server.startUnifiedServer();
      // Add assertions for all protocols starting
    });

    it('should respect configuration for protocol startup', async () => {
      server.config.enableHttp = false;
      server.config.enableWebSocket = false;
      server.config.enableSSE = false;
      
      await server.startUnifiedServer();
      // Add assertions for only stdio starting
    });
  });

  describe('Memory Management Tools', () => {
    describe('createMemoryTool', () => {
      it('should create memory with embedding', async () => {
        const args = {
          title: 'Test Memory',
          content: 'This is a test memory content',
          memory_type: 'knowledge',
          tags: ['test', 'memory'],
          topic_id: 'test-topic-123'
        };
        
        const result = await server.createMemoryTool(args);
        expect(result.success).toBe(true);
      });

      it('should handle errors gracefully', async () => {
        const args = {
          title: 'Test Memory',
          content: 'This is a test memory content'
        };
        
        // Mock error response
        (server.supabase.from as jest.Mock).mockImplementation(() => ({
          insert: jest.fn().mockResolvedValue({ error: new Error('Database error') })
        }));
        
        const result = await server.createMemoryTool(args);
        expect(result.success).toBe(false);
      });
    });

    describe('searchMemoriesTool', () => {
      it('should search memories with embedding', async () => {
        const args = {
          query: 'test search query',
          limit: 10,
          threshold: 0.7
        };
        
        const result = await server.searchMemoriesTool(args);
        expect(result.success).toBe(true);
      });
    });

    describe('getMemoryTool', () => {
      it('should retrieve memory by ID', async () => {
        const args = { id: 'memory-123' };
        const result = await server.getMemoryTool(args);
        expect(result.success).toBe(true);
      });
    });

    describe('updateMemoryTool', () => {
      it('should update memory by ID', async () => {
        const args = {
          id: 'memory-123',
          title: 'Updated Memory Title'
        };
        
        const result = await server.updateMemoryTool(args);
        expect(result.success).toBe(true);
      });
    });

    describe('deleteMemoryTool', () => {
      it('should delete memory by ID', async () => {
        const args = { id: 'memory-123' };
        const result = await server.deleteMemoryTool(args);
        expect(result.success).toBe(true);
      });
    });

    describe('listMemoriesTool', () => {
      it('should list memories with pagination', async () => {
        const args = {
          limit: 20,
          offset: 0
        };
        
        const result = await server.listMemoriesTool(args);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('API Key Management Tools', () => {
    describe('createApiKeyTool', () => {
      it('should create new API key', async () => {
        const args = {
          name: 'Test API Key',
          description: 'API key for testing',
          access_level: 'authenticated'
        };
        
        const result = await server.createApiKeyTool(args);
        expect(result.success).toBe(true);
      });
    });

    describe('listApiKeysTool', () => {
      it('should list API keys', async () => {
        const args = { active_only: true };
        const result = await server.listApiKeysTool(args);
        expect(result.success).toBe(true);
      });
    });

    describe('rotateApiKeyTool', () => {
      it('should rotate API key secret', async () => {
        const args = { key_id: 'api-key-123' };
        const result = await server.rotateApiKeyTool(args);
        expect(result.success).toBe(true);
      });
    });

    describe('deleteApiKeyTool', () => {
      it('should delete API key', async () => {
        const args = { key_id: 'api-key-123' };
        const result = await server.deleteApiKeyTool(args);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('System Tools', () => {
    describe('getHealthStatusTool', () => {
      it('should return health status', async () => {
        const args = {};
        const result = await server.getHealthStatusTool(args);
        expect(result.status).toBe('healthy');
      });

      it('should include metrics when requested', async () => {
        const args = { include_metrics: true };
        const result = await server.getHealthStatusTool(args);
        expect(result.metrics).toBeDefined();
      });
    });

    describe('getAuthStatusTool', () => {
      it('should return authentication status', async () => {
        const args = {};
        const result = await server.getAuthStatusTool(args);
        expect(result.status).toBe('authenticated');
      });
    });

    describe('getOrganizationInfoTool', () => {
      it('should return organization information', async () => {
        const args = {};
        const result = await server.getOrganizationInfoTool(args);
        expect(result.name).toBe('Lanonasis Organization');
      });

      it('should include usage when requested', async () => {
        const args = { include_usage: true };
        const result = await server.getOrganizationInfoTool(args);
        expect(result.usage).toBeDefined();
      });
    });

    describe('createProjectTool', () => {
      it('should create new project', async () => {
        const args = {
          name: 'Test Project',
          description: 'Project for testing'
        };
        
        const result = await server.createProjectTool(args);
        expect(result.success).toBe(true);
      });
    });

    describe('listProjectsTool', () => {
      it('should list projects', async () => {
        const args = {};
        const result = await server.listProjectsTool(args);
        expect(result.success).toBe(true);
      });
    });

    describe('getConfigTool', () => {
      it('should return configuration', async () => {
        const args = {};
        const result = await server.getConfigTool(args);
        expect(result.success).toBe(true);
      });

      it('should return specific config key when requested', async () => {
        const args = { key: 'server.version' };
        const result = await server.getConfigTool(args);
        expect(result.success).toBe(true);
      });

      it('should return config section when requested', async () => {
        const args = { section: 'features' };
        const result = await server.getConfigTool(args);
        expect(result.success).toBe(true);
      });
    });

    describe('setConfigTool', () => {
      it('should reject unauthorized config changes', async () => {
        const args = {
          key: 'unauthorized_key',
          value: 'test_value'
        };
        
        const result = await server.setConfigTool(args);
        expect(result.success).toBe(false);
      });

      it('should allow authorized config changes', async () => {
        const args = {
          key: 'rate_limit',
          value: '200'
        };
        
        const result = await server.setConfigTool(args);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Shutdown', () => {
    it('should gracefully shutdown all servers', async () => {
      await server.startUnifiedServer();
      await server.shutdown();
      // Add assertions for proper shutdown
    });
  });
});
