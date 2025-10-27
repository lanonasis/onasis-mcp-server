#!/usr/bin/env node

/**
 * Remote MCP Client for VPS Connection
 * Connects to the production MCP server via HTTP and provides MCP protocol interface
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const axios = require('axios');

class RemoteMCPClient {
  constructor() {
    this.vpsHost = process.env.VPS_HOST || 'localhost';
    this.vpsPort = process.env.VPS_PORT || '3001';
    this.baseUrl = `http://${this.vpsHost}:${this.vpsPort}`;
    this.server = new Server(
      {
        name: 'lanonasis-vps-mcp-client',
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

  setupHandlers() {
    // List available tools by querying the remote server
    this.server.setRequestHandler('tools/list', async () => {
      try {
        console.error(`Fetching tools from ${this.baseUrl}/api/v1/tools`);
        const response = await axios.get(`${this.baseUrl}/api/v1/tools`, {
          timeout: 10000
        });
        
        // Handle both {tools: [...]} and {success: true, data: [...]}
        const toolsList = response.data.tools || response.data.data || [];
        if (toolsList.length > 0) {
          console.error(`Found ${toolsList.length} tools`);
          return {
            tools: toolsList.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: {
                type: 'object',
                properties: tool.parameters || {},
              }
            }))
          };
        }
        
        // Fallback tools if API doesn't provide structured response
        return {
          tools: [
            {
              name: 'health_check',
              description: 'Check the health status of the remote MCP server',
              inputSchema: {
                type: 'object',
                properties: {}
              }
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
                  tags: { type: 'array', items: { type: 'string' }, description: 'Tags' }
                },
                required: ['content']
              }
            },
            {
              name: 'get_server_metrics',
              description: 'Get server performance metrics',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            }
          ]
        };
      } catch (error) {
        console.error(`Error fetching tools: ${error.message}`);
        // Return basic tools as fallback
        return {
          tools: [
            {
              name: 'health_check',
              description: 'Check remote server health (fallback mode)',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            }
          ]
        };
      }
    });

    // Execute tools by making HTTP requests to the remote server
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args = {} } = request.params;
      
      try {
        console.error(`Executing tool: ${name} with args:`, args);
        
        // Handle different tool types
        switch (name) {
          case 'health_check':
            return await this.executeHealthCheck();
          
          case 'get_server_metrics':
            return await this.executeGetMetrics();
          
          case 'search_memories':
          case 'create_memory':
            return await this.executeToolRemotely(name, args);
          
          default:
            return await this.executeToolRemotely(name, args);
        }
      } catch (error) {
        console.error(`Tool execution failed: ${error.message}`);
        throw new Error(`Failed to execute tool '${name}': ${error.message}`);
      }
    });
  }

  async executeHealthCheck() {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000
      });
      
      return {
        content: [
          {
            type: 'text',
            text: `Remote MCP Server Health Check:
Status: ${response.data.status}
Service: ${response.data.service}
Version: ${response.data.version}
Message: ${response.data.message}
Uptime: ${response.data.uptime}s
Timestamp: ${response.data.timestamp}

Features Available:
${Object.entries(response.data.features || {}).map(([key, value]) => 
  `• ${key}: ${value ? '✅' : '❌'}`).join('\n')}

Connection: ✅ Successfully connected to ${this.baseUrl}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Health check failed: ${error.message}
VPS: ${this.baseUrl}
Status: Connection failed`
          }
        ]
      };
    }
  }

  async executeGetMetrics() {
    try {
      const response = await axios.get(`${this.baseUrl}/metrics`, {
        timeout: 5000
      });
      
      return {
        content: [
          {
            type: 'text',
            text: `Remote MCP Server Metrics:

Server Information:
• Uptime: ${response.data.server.uptime}s
• Version: ${response.data.server.version}
• Memory Usage: ${JSON.stringify(response.data.server.memory_usage, null, 2)}
• CPU Usage: ${JSON.stringify(response.data.server.cpu_usage, null, 2)}

Request Statistics:
• Total Requests: ${response.data.requests.total}
• Requests per Minute: ${response.data.requests.per_minute}
• Error Count: ${response.data.requests.errors}

Timestamp: ${response.data.timestamp}
Connection: ${this.baseUrl}`
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

  async executeToolRemotely(toolName, parameters) {
    try {
      // Use the correct MCP-Core endpoint: /api/v1/tools/:toolName
      const response = await axios.post(`${this.baseUrl}/api/v1/tools/${toolName}`, 
        parameters,
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.MCP_API_KEY || ''
        }
      });

      // Handle MCP-Core response format: {success: true, data: {...}}
      const result = response.data.data || response.data.result || response.data;
      return {
        content: [
          {
            type: 'text',
            text: `Tool Execution Result:
Tool: ${toolName}
Parameters: ${JSON.stringify(parameters, null, 2)}

Result:
${JSON.stringify(result, null, 2)}

Status: ${response.data.success ? 'Success' : 'Unknown'}
Timestamp: ${new Date().toISOString()}`
          }
        ]
      };
    } catch (error) {
      if (error.response) {
        return {
          content: [
            {
              type: 'text',
              text: `Tool execution failed (${error.response.status}):
${JSON.stringify(error.response.data, null, 2)}`
            }
          ]
        };
      } else {
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
  }

  async start() {
    console.error(`Starting Remote MCP Client for VPS: ${this.baseUrl}`);
    
    // Test connection first
    try {
      const healthCheck = await axios.get(`${this.baseUrl}/health`, { timeout: 5000 });
      console.error(`✅ Connected to ${healthCheck.data.service} v${healthCheck.data.version}`);
    } catch (error) {
      console.error(`⚠️ Warning: Could not connect to VPS: ${error.message}`);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Remote MCP Client connected and ready');
  }
}

// Start the client if run directly
if (require.main === module) {
  const client = new RemoteMCPClient();
  client.start().catch(error => {
    console.error('Failed to start Remote MCP Client:', error);
    process.exit(1);
  });
}

module.exports = RemoteMCPClient;