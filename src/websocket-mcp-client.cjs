#!/usr/bin/env node

/**
 * WebSocket MCP Client for VPS Connection
 * Connects to MCP-Core server via WebSocket for real-time communication
 * Endpoint: wss://mcp.lanonasis.com/ws or ws://localhost:3001/ws
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const WebSocket = require('ws');
const axios = require('axios');

class WebSocketMCPClient {
  constructor() {
    this.wsUrl = process.env.WS_URL || 'ws://localhost:3001/ws';
    this.httpBaseUrl = process.env.HTTP_BASE_URL || 'http://localhost:3001';
    this.apiKey = process.env.MCP_API_KEY || '';
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    
    this.server = new Server(
      {
        name: 'lanonasis-websocket-mcp-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      console.error(`Connecting to WebSocket: ${this.wsUrl}`);
      
      this.ws = new WebSocket(this.wsUrl, {
        headers: this.apiKey ? { 'x-api-key': this.apiKey } : {}
      });

      this.ws.on('open', () => {
        console.error('✅ WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.error('WebSocket message received:', message.type);
          // Handle incoming messages if needed
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error.message);
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        reject(error);
      });

      this.ws.on('close', () => {
        console.error('WebSocket disconnected');
        this.attemptReconnect();
      });

      // Timeout for connection
      setTimeout(() => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.error(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connectWebSocket().catch(error => {
          console.error('Reconnection failed:', error.message);
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached. Falling back to HTTP.');
    }
  }

  setupHandlers() {
    // List available tools via HTTP (WebSocket doesn't have a tools endpoint)
    this.server.setRequestHandler('tools/list', async () => {
      try {
        console.error(`Fetching tools from ${this.httpBaseUrl}/api/v1/tools`);
        const response = await axios.get(`${this.httpBaseUrl}/api/v1/tools`, {
          timeout: 10000,
          headers: this.apiKey ? { 'x-api-key': this.apiKey } : {}
        });
        
        const toolsList = response.data.tools || response.data.data || [];
        if (toolsList.length > 0) {
          console.error(`Found ${toolsList.length} tools`);
          return {
            tools: toolsList.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema || {
                type: 'object',
                properties: tool.parameters || {},
              }
            }))
          };
        }
        
        // Fallback tools
        return this.getFallbackTools();
      } catch (error) {
        console.error(`Error fetching tools: ${error.message}`);
        return this.getFallbackTools();
      }
    });

    // Execute tools - prefer WebSocket, fallback to HTTP
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args = {} } = request.params;
      
      try {
        console.error(`Executing tool: ${name}`);
        
        // Special handling for health and metrics
        if (name === 'health_check') {
          return await this.executeHealthCheck();
        }
        
        if (name === 'get_server_metrics') {
          return await this.executeGetMetrics();
        }
        
        // Execute via HTTP (WebSocket is for real-time events, not tool execution)
        return await this.executeToolViaHTTP(name, args);
      } catch (error) {
        console.error(`Tool execution failed: ${error.message}`);
        throw new Error(`Failed to execute tool '${name}': ${error.message}`);
      }
    });
  }

  getFallbackTools() {
    return {
      tools: [
        {
          name: 'health_check',
          description: 'Check the health status of the remote MCP server',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'search_memories',
          description: 'Search through stored memories',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Maximum results' }
            },
            required: ['query']
          }
        },
        {
          name: 'create_memory',
          description: 'Create a new memory',
          inputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Memory content' },
              title: { type: 'string', description: 'Memory title' },
              type: { type: 'string', description: 'Memory type' },
              tags: { type: 'array', items: { type: 'string' } }
            },
            required: ['content', 'title', 'type']
          }
        }
      ]
    };
  }

  async executeHealthCheck() {
    try {
      const response = await axios.get(`${this.httpBaseUrl}/health`, {
        timeout: 5000
      });
      
      const wsStatus = this.ws && this.ws.readyState === WebSocket.OPEN ? '✅ Connected' : '❌ Disconnected';
      
      return {
        content: [
          {
            type: 'text',
            text: `MCP-Core Server Health Check:
Status: ${response.data.status}
Version: ${response.data.version}
Uptime: ${response.data.uptime}

Services:
• Database: ${response.data.services?.database || 'unknown'}
• Cache: ${response.data.services?.cache || 'unknown'}
• MCP: ${response.data.services?.mcp || 'unknown'}

WebSocket: ${wsStatus}
HTTP Endpoint: ${this.httpBaseUrl}
Response Time: ${response.data.response_time_ms}ms

Memory Usage: ${response.data.memory_usage?.percentage}% (${Math.round(response.data.memory_usage?.used / 1024 / 1024)}MB / ${Math.round(response.data.memory_usage?.total / 1024 / 1024)}MB)

Timestamp: ${response.data.timestamp}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Health check failed: ${error.message}
Endpoint: ${this.httpBaseUrl}
WebSocket: ${this.ws ? 'Initialized' : 'Not initialized'}`
          }
        ]
      };
    }
  }

  async executeGetMetrics() {
    try {
      const response = await axios.get(`${this.httpBaseUrl}/metrics`, {
        timeout: 5000
      });
      
      return {
        content: [
          {
            type: 'text',
            text: `MCP-Core Server Metrics:\n${JSON.stringify(response.data, null, 2)}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Metrics fetch failed: ${error.message}`
          }
        ]
      };
    }
  }

  async executeToolViaHTTP(toolName, parameters) {
    try {
      const response = await axios.post(
        `${this.httpBaseUrl}/api/v1/tools/${toolName}`,
        parameters,
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'x-api-key': this.apiKey } : {})
          }
        }
      );

      const result = response.data.data || response.data.result || response.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `Tool: ${toolName}\n\nResult:\n${JSON.stringify(result, null, 2)}\n\nStatus: ${response.data.success ? '✅ Success' : '⚠️ Unknown'}`
          }
        ]
      };
    } catch (error) {
      if (error.response) {
        const errorData = error.response.data;
        return {
          content: [
            {
              type: 'text',
              text: `❌ Tool execution failed (${error.response.status}):\n${JSON.stringify(errorData, null, 2)}`
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `❌ Tool execution failed: ${error.message}`
          }
        ]
      };
    }
  }

  async start() {
    console.error(`Starting WebSocket MCP Client`);
    console.error(`WebSocket URL: ${this.wsUrl}`);
    console.error(`HTTP Base URL: ${this.httpBaseUrl}`);
    
    // Try to connect WebSocket (non-blocking)
    try {
      await this.connectWebSocket();
    } catch (error) {
      console.error(`⚠️ WebSocket connection failed: ${error.message}`);
      console.error('Continuing with HTTP-only mode...');
    }

    // Test HTTP connection
    try {
      const healthCheck = await axios.get(`${this.httpBaseUrl}/health`, { timeout: 5000 });
      console.error(`✅ HTTP connected to ${healthCheck.data.version || 'MCP-Core'}`);
    } catch (error) {
      console.error(`⚠️ Warning: Could not connect via HTTP: ${error.message}`);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('WebSocket MCP Client connected and ready');
  }

  async close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Start the client if run directly
if (require.main === module) {
  const client = new WebSocketMCPClient();
  
  process.on('SIGINT', async () => {
    console.error('Shutting down...');
    await client.close();
    process.exit(0);
  });
  
  client.start().catch(error => {
    console.error('Failed to start WebSocket MCP Client:', error);
    process.exit(1);
  });
}

module.exports = WebSocketMCPClient;
