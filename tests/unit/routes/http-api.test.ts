/**
 * HTTP API Endpoint Tests for Unified MCP Server
 */

import request from 'supertest';
import express from 'express';
import { LanonasisUnifiedMCPServer } from '../../../src/unified-mcp-server';

// Mock the server methods to avoid actual Supabase calls
jest.mock('../../src/unified-mcp-server');

describe('HTTP API Endpoints', () => {
  let app: express.Application;
  let server: jest.Mocked<LanonasisUnifiedMCPServer>;

  beforeEach(() => {
    server = new LanonasisUnifiedMCPServer() as jest.Mocked<LanonasisUnifiedMCPServer>;
    app = express();
    app.use(express.json());
    
    // Mock the tool methods to return predictable results
    server.tools = {
      create_memory: jest.fn().mockResolvedValue({ success: true, message: 'Memory created' }),
      search_memories: jest.fn().mockResolvedValue({ success: true, memories: [] }),
      get_memory: jest.fn().mockResolvedValue({ success: true, memory: { id: 'test' } }),
      // Add other tools as needed
    } as any;
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      (server.getHealthStatusTool as jest.Mock).mockResolvedValue({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.version).toBe('1.0.0');
    });

    it('should handle health check errors', async () => {
      (server.getHealthStatusTool as jest.Mock).mockRejectedValue(new Error('Health check failed'));

      const response = await request(app)
        .get('/health')
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/v1/tools', () => {
    it('should list all available tools', async () => {
      const mockTools = [
        { name: 'create_memory', description: 'Create memory' },
        { name: 'search_memories', description: 'Search memories' }
      ];
      
      (server.getToolDefinitions as jest.Mock).mockReturnValue(mockTools);

      const response = await request(app)
        .get('/api/v1/tools')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.tools).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });
  });

  describe('POST /api/v1/tools/:toolName', () => {
    it('should execute valid tool', async () => {
      const toolArgs = { title: 'Test', content: 'Content' };
      
      const response = await request(app)
        .post('/api/v1/tools/create_memory')
        .send(toolArgs)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect((server as any).tools.create_memory).toHaveBeenCalledWith(toolArgs);
    });

    it('should return 404 for unknown tool', async () => {
      (server as any).tools.unknown_tool = undefined;

      const response = await request(app)
        .post('/api/v1/tools/unknown_tool')
        .send({})
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    it('should handle tool execution errors', async () => {
      (server as any).tools.create_memory = jest.fn().mockRejectedValue(new Error('Tool failed'));

      const response = await request(app)
        .post('/api/v1/tools/create_memory')
        .send({ title: 'Test' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Tool failed');
    });
  });

  describe('POST /api/v1/mcp/message', () => {
    it('should handle tools/list request', async () => {
      const mockTools = [
        { name: 'create_memory', description: 'Create memory' },
        { name: 'search_memories', description: 'Search memories' }
      ];
      
      (server.getToolDefinitions as jest.Mock).mockReturnValue(mockTools);

      const response = await request(app)
        .post('/api/v1/mcp/message')
        .send({
          method: 'tools/list',
          id: 'test-request-1'
        })
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe('test-request-1');
      expect(response.body.result.tools).toHaveLength(2);
    });

    it('should handle tools/call request', async () => {
      const toolArgs = { title: 'Test Memory', content: 'Test Content' };
      
      const response = await request(app)
        .post('/api/v1/mcp/message')
        .send({
          method: 'tools/call',
          id: 'test-request-2',
          params: {
            name: 'create_memory',
            arguments: toolArgs
          }
        })
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe('test-request-2');
      expect(response.body.result.content[0].type).toBe('text');
    });

    it('should return error for unknown tool in tools/call', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/message')
        .send({
          method: 'tools/call',
          id: 'test-request-3',
          params: {
            name: 'unknown_tool',
            arguments: {}
          }
        })
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe('test-request-3');
      expect(response.body.error.code).toBe(-32601);
    });

    it('should return 400 for invalid method', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/message')
        .send({
          method: 'invalid_method',
          id: 'test-request-4'
        })
        .expect(400);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.error.code).toBe(-32600);
    });
  });
});
