/**
 * WebSocket Tests for Unified MCP Server
 */

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { LanonasisUnifiedMCPServer } from '../../../src/unified-mcp-server';

// Mock WebSocket and HTTP server
jest.mock('ws');
jest.mock('http');

describe('WebSocket Server', () => {
  let server: LanonasisUnifiedMCPServer;
  let mockWebSocketServer: any;
  let mockHttpServer: any;

  beforeEach(() => {
    server = new LanonasisUnifiedMCPServer();
    
    // Mock WebSocket server
    mockWebSocketServer = {
      on: jest.fn(),
    };
    
    // Mock HTTP server
    mockHttpServer = {
      listen: jest.fn((port, host, callback) => callback()),
    };
    
    (WebSocketServer as jest.Mock).mockReturnValue(mockWebSocketServer);
    (createServer as jest.Mock).mockReturnValue(mockHttpServer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('WebSocket Connection Handling', () => {
    it('should set up WebSocket server with correct configuration', async () => {
      await server.startWebSocketServer();
      
      expect(WebSocketServer).toHaveBeenCalledWith({ server: mockHttpServer });
      expect(mockWebSocketServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should handle new WebSocket connections', async () => {
      await server.startWebSocketServer();
      
      // Get the connection handler
      const connectionHandler = mockWebSocketServer.on.mock.calls.find(call => call[0] === 'connection')[1];
      expect(connectionHandler).toBeDefined();
      
      // Mock a WebSocket connection
      const mockWebSocket = {
        on: jest.fn(),
        send: jest.fn(),
      };
      
      const mockRequest = {
        headers: {
          'x-forwarded-for': '127.0.0.1',
        },
        socket: {
          remoteAddress: '127.0.0.1',
        },
      };
      
      connectionHandler(mockWebSocket, mockRequest);
      
      expect(mockWebSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWebSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should handle WebSocket messages', async () => {
      await server.startWebSocketServer();
      
      // Get the connection handler
      const connectionHandler = mockWebSocketServer.on.mock.calls.find(call => call[0] === 'connection')[1];
      
      // Mock a WebSocket connection
      const mockWebSocket = {
        on: jest.fn(),
        send: jest.fn(),
      };
      
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };
      
      connectionHandler(mockWebSocket, mockRequest);
      
      // Get the message handler
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      expect(messageHandler).toBeDefined();
      
      // Test tools/list message
      const listToolsMessage = JSON.stringify({
        method: 'tools/list',
        id: 'test-1',
      });
      
      await messageHandler(listToolsMessage);
      expect(mockWebSocket.send).toHaveBeenCalled();
      
      // Test tools/call message
      const callToolMessage = JSON.stringify({
        method: 'tools/call',
        id: 'test-2',
        params: {
          name: 'create_memory',
          arguments: { title: 'Test', content: 'Content' },
        },
      });
      
      await messageHandler(callToolMessage);
      expect(mockWebSocket.send).toHaveBeenCalled();
    });

    it('should handle unknown tool requests', async () => {
      await server.startWebSocketServer();
      
      // Get the connection handler
      const connectionHandler = mockWebSocketServer.on.mock.calls.find(call => call[0] === 'connection')[1];
      
      // Mock a WebSocket connection
      const mockWebSocket = {
        on: jest.fn(),
        send: jest.fn(),
      };
      
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };
      
      connectionHandler(mockWebSocket, mockRequest);
      
      // Get the message handler
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      
      // Test unknown tool message
      const unknownToolMessage = JSON.stringify({
        method: 'tools/call',
        id: 'test-3',
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      });
      
      await messageHandler(unknownToolMessage);
      
      // Should send error response
      expect(mockWebSocket.send).toHaveBeenCalledWith(expect.stringContaining('"error"'));
      expect(mockWebSocket.send).toHaveBeenCalledWith(expect.stringContaining('-32601'));
    });

    it('should handle message parsing errors', async () => {
      await server.startWebSocketServer();
      
      // Get the connection handler
      const connectionHandler = mockWebSocketServer.on.mock.calls.find(call => call[0] === 'connection')[1];
      
      // Mock a WebSocket connection
      const mockWebSocket = {
        on: jest.fn(),
        send: jest.fn(),
      };
      
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };
      
      connectionHandler(mockWebSocket, mockRequest);
      
      // Get the message handler
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      
      // Test invalid JSON message
      await messageHandler('invalid json');
      
      // Should send parse error response
      expect(mockWebSocket.send).toHaveBeenCalledWith(expect.stringContaining('"error"'));
      expect(mockWebSocket.send).toHaveBeenCalledWith(expect.stringContaining('-32700'));
    });
  });
});
