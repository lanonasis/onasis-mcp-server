/**
 * Stdio Transport Tests for Unified MCP Server
 */

import { LanonasisUnifiedMCPServer } from '../../../src/unified-mcp-server';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Mock MCP SDK components
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

describe('Stdio Transport', () => {
  let server: LanonasisUnifiedMCPServer;
  let mockMcpServer: any;
  let mockStdioTransport: any;

  beforeEach(() => {
    // Mock MCP server methods
    mockMcpServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn(),
    };

    // Mock stdio transport
    mockStdioTransport = {
      // Add any necessary mock properties
    };

    (Server as jest.Mock).mockReturnValue(mockMcpServer);
    (StdioServerTransport as jest.Mock).mockReturnValue(mockStdioTransport);

    server = new LanonasisUnifiedMCPServer();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startStdioServer', () => {
    it('should create MCP server with correct configuration', async () => {
      await server.startStdioServer();

      expect(Server).toHaveBeenCalledWith(
        {
          name: 'lanonasis-mcp-server',
          version: '1.0.0',
          description: 'Lanonasis MCP Server - Enterprise Memory as a Service with 17+ tools',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );
    });

    it('should set up request handlers for tools', async () => {
      await server.startStdioServer();

      expect(mockMcpServer.setRequestHandler).toHaveBeenCalledWith(
        ListToolsRequestSchema,
        expect.any(Function)
      );
      
      expect(mockMcpServer.setRequestHandler).toHaveBeenCalledWith(
        CallToolRequestSchema,
        expect.any(Function)
      );
    });

    it('should connect stdio transport when not in HTTP mode', async () => {
      // Mock process.argv to not include --http
      const originalArgv = process.argv;
      process.argv = ['node', 'server.js'];
      
      await server.startStdioServer();
      
      expect(mockMcpServer.connect).toHaveBeenCalledWith(mockStdioTransport);
      
      // Restore original argv
      process.argv = originalArgv;
    });

    it('should not connect stdio transport when in HTTP mode', async () => {
      // Mock process.argv to include --http
      const originalArgv = process.argv;
      process.argv = ['node', 'server.js', '--http'];
      
      await server.startStdioServer();
      
      expect(mockMcpServer.connect).not.toHaveBeenCalled();
      
      // Restore original argv
      process.argv = originalArgv;
    });
  });

  describe('List Tools Handler', () => {
    it('should return tool definitions', async () => {
      await server.startStdioServer();
      
      // Get the list tools handler
      const listToolsHandler = mockMcpServer.setRequestHandler.mock.calls.find(
        call => call[0] === ListToolsRequestSchema
      )[1];
      
      const result = await listToolsHandler();
      
      expect(result.tools).toHaveLength(17);
    });
  });

  describe('Call Tool Handler', () => {
    it('should execute valid tool and return result', async () => {
      await server.startStdioServer();
      
      // Mock a tool method
      const mockToolResult = { success: true, data: 'test result' };
      (server as any).tools.create_memory = jest.fn().mockResolvedValue(mockToolResult);
      
      // Get the call tool handler
      const callToolHandler = mockMcpServer.setRequestHandler.mock.calls.find(
        call => call[0] === CallToolRequestSchema
      )[1];
      
      const mockRequest = {
        params: {
          name: 'create_memory',
          arguments: { title: 'Test', content: 'Content' },
        },
      };
      
      const result = await callToolHandler(mockRequest);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('test result');
    });

    it('should throw error for unknown tool', async () => {
      await server.startStdioServer();
      
      // Get the call tool handler
      const callToolHandler = mockMcpServer.setRequestHandler.mock.calls.find(
        call => call[0] === CallToolRequestSchema
      )[1];
      
      const mockRequest = {
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      };
      
      await expect(callToolHandler(mockRequest)).rejects.toThrow('Unknown tool: unknown_tool');
    });

    it('should handle tool execution errors', async () => {
      await server.startStdioServer();
      
      // Mock a tool method to throw error
      (server as any).tools.create_memory = jest.fn().mockRejectedValue(new Error('Tool execution failed'));
      
      // Get the call tool handler
      const callToolHandler = mockMcpServer.setRequestHandler.mock.calls.find(
        call => call[0] === CallToolRequestSchema
      )[1];
      
      const mockRequest = {
        params: {
          name: 'create_memory',
          arguments: { title: 'Test' },
        },
      };
      
      await expect(callToolHandler(mockRequest)).rejects.toThrow('Tool execution failed');
    });
  });
});
