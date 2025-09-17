/**
 * Server-Sent Events Tests for Unified MCP Server
 */

import express from 'express';
import { LanonasisUnifiedMCPServer } from '../../../src/unified-mcp-server';

// Mock express
jest.mock('express', () => {
  const mockExpress = jest.fn(() => ({
    use: jest.fn(),
    get: jest.fn(),
    listen: jest.fn((port, host, callback) => {
      callback();
      return { close: jest.fn() };
    }),
  }));
  return mockExpress;
});

describe('Server-Sent Events Server', () => {
  let server: LanonasisUnifiedMCPServer;
  let mockApp: any;

  beforeEach(() => {
    server = new LanonasisUnifiedMCPServer();
    mockApp = express();
    (server as any).sseClients = new Set();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('SSE Connection Handling', () => {
    it('should set up SSE endpoint', async () => {
      await server.startSSEServer();
      
      // Check that the SSE endpoint was set up
      expect(mockApp.get).toHaveBeenCalledWith('/sse', expect.any(Function));
    });

    it('should handle new SSE connections', async () => {
      await server.startSSEServer();
      
      // Get the SSE connection handler
      const sseHandler = mockApp.get.mock.calls.find(call => call[0] === '/sse')[1];
      expect(sseHandler).toBeDefined();
      
      // Mock response object
      const mockResponse = {
        writeHead: jest.fn(),
        write: jest.fn(),
        on: jest.fn(),
      };
      
      // Mock request object
      const mockRequest = {
        on: jest.fn(),
      };
      
      sseHandler(mockRequest, mockResponse);
      
      // Should add client to sseClients set
      expect((server as any).sseClients.size).toBe(1);
      
      // Should send connection message
      expect(mockResponse.write).toHaveBeenCalledWith(expect.stringContaining('event: connected'));
      
      // Should send tools message
      expect(mockResponse.write).toHaveBeenCalledWith(expect.stringContaining('event: tools'));
    });

    it('should handle SSE client disconnections', async () => {
      await server.startSSEServer();
      
      // Get the SSE connection handler
      const sseHandler = mockApp.get.mock.calls.find(call => call[0] === '/sse')[1];
      
      // Mock response object
      const mockResponse = {
        writeHead: jest.fn(),
        write: jest.fn(),
        on: jest.fn(),
      };
      
      // Mock request object
      const mockRequest = {
        on: jest.fn(),
      };
      
      sseHandler(mockRequest, mockResponse);
      
      // Get the close handler
      const closeHandler = mockRequest.on.mock.calls.find(call => call[0] === 'close')[1];
      expect(closeHandler).toBeDefined();
      
      // Simulate client disconnect
      closeHandler();
      
      // Should remove client from sseClients set
      expect((server as any).sseClients.size).toBe(0);
    });
  });

  describe('SSE Tool Execution', () => {
    it('should set up tool execution endpoints', async () => {
      await server.startSSEServer();
      
      // Check that tool execution endpoints were set up
      expect(mockApp.get).toHaveBeenCalledWith('/sse/tool/:toolName', expect.any(Function));
    });

    it('should execute tools via SSE', async () => {
      await server.startSSEServer();
      
      // Get the tool execution handler
      const toolHandler = mockApp.get.mock.calls.find(call => call[0] === '/sse/tool/:toolName')[1];
      expect(toolHandler).toBeDefined();
      
      // Mock request and response
      const mockRequest = {
        params: { toolName: 'create_memory' },
        query: { title: 'Test', content: 'Content' },
      };
      
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      
      // Mock the tool method
      (server as any).tools.create_memory = jest.fn().mockResolvedValue({ 
        success: true, 
        message: 'Memory created' 
      });
      
      await toolHandler(mockRequest, mockResponse);
      
      expect(mockResponse.json).toHaveBeenCalledWith({ 
        success: true, 
        result: expect.any(Object) 
      });
    });

    it('should handle unknown tool requests', async () => {
      await server.startSSEServer();
      
      // Get the tool execution handler
      const toolHandler = mockApp.get.mock.calls.find(call => call[0] === '/sse/tool/:toolName')[1];
      
      // Mock request and response
      const mockRequest = {
        params: { toolName: 'unknown_tool' },
        query: {},
      };
      
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      
      await toolHandler(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ 
        error: expect.stringContaining('not found') 
      });
    });

    it('should handle tool execution errors', async () => {
      await server.startSSEServer();
      
      // Get the tool execution handler
      const toolHandler = mockApp.get.mock.calls.find(call => call[0] === '/sse/tool/:toolName')[1];
      
      // Mock request and response
      const mockRequest = {
        params: { toolName: 'create_memory' },
        query: { title: 'Test' },
      };
      
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      
      // Mock tool method to throw error
      (server as any).tools.create_memory = jest.fn().mockRejectedValue(new Error('Tool failed'));
      
      await toolHandler(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ 
        error: expect.any(String) 
      });
    });
  });

  describe('SSE Broadcasting', () => {
    it('should broadcast messages to all connected clients', () => {
      // Mock response objects
      const mockResponse1 = {
        write: jest.fn(),
      };
      
      const mockResponse2 = {
        write: jest.fn(),
      };
      
      // Add mock responses to sseClients set
      (server as any).sseClients.add(mockResponse1);
      (server as any).sseClients.add(mockResponse2);
      
      // Broadcast a message
      server.broadcastToSSE('test_event', { data: 'test' });
      
      // Both clients should receive the message
      expect(mockResponse1.write).toHaveBeenCalledWith(expect.stringContaining('event: test_event'));
      expect(mockResponse2.write).toHaveBeenCalledWith(expect.stringContaining('event: test_event'));
    });

    it('should handle client write errors during broadcasting', () => {
      // Mock response objects
      const mockResponse1 = {
        write: jest.fn(() => { throw new Error('Write error'); }),
      };
      
      const mockResponse2 = {
        write: jest.fn(),
      };
      
      // Add mock responses to sseClients set
      (server as any).sseClients.add(mockResponse1);
      (server as any).sseClients.add(mockResponse2);
      
      // Broadcast a message
      server.broadcastToSSE('test_event', { data: 'test' });
      
      // Client with error should be removed from set
      expect((server as any).sseClients.size).toBe(1);
      expect(mockResponse2.write).toHaveBeenCalledWith(expect.stringContaining('event: test_event'));
    });
  });
});
