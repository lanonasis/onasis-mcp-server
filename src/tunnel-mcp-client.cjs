#!/usr/bin/env node

/**
 * Tunnel MCP Client for Claude Desktop
 * Creates SSH tunnel and provides MCP protocol interface to remote server
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { spawn } = require('child_process');
const { promisify } = require('util');

class TunnelMCPClient {
  constructor() {
    this.tunnelPort = process.env.TUNNEL_PORT || '3001';
    this.vpsHost = process.env.VPS_HOST || 'vps';
    this.tunnelProcess = null;
    this.baseUrl = `http://localhost:${this.tunnelPort}`;
    
    this.server = new McpServer({
      name: 'lanonasis-tunnel-mcp',
      version: '1.0.0',
    });

    this.setupTunnel();
    this.setupTools();
  }

  setupTunnel() {
    // Create SSH tunnel
    console.error(`Creating SSH tunnel: ${this.vpsHost}:3001 → localhost:${this.tunnelPort}`);
    
    this.tunnelProcess = spawn('ssh', [
      '-N', 
      '-L', `${this.tunnelPort}:localhost:3001`, 
      this.vpsHost
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.tunnelProcess.on('error', (err) => {
      console.error(`SSH tunnel error: ${err.message}`);
    });

    // Cleanup tunnel on exit
    process.on('exit', () => this.cleanupTunnel());
    process.on('SIGINT', () => this.cleanupTunnel());
    process.on('SIGTERM', () => this.cleanupTunnel());
  }

  cleanupTunnel() {
    if (this.tunnelProcess && !this.tunnelProcess.killed) {
      console.error('Cleaning up SSH tunnel...');
      this.tunnelProcess.kill();
    }
  }

  async makeHttpRequest(method, path, data = null) {
    // Simple HTTP client using curl since we can't rely on axios being available
    return new Promise((resolve, reject) => {
      const curlArgs = [
        '-s',
        '--connect-timeout', '5',
        '--max-time', '10',
        '-X', method.toUpperCase()
      ];

      if (data) {
        curlArgs.push('-H', 'Content-Type: application/json');
        curlArgs.push('-d', JSON.stringify(data));
      }

      curlArgs.push(`${this.baseUrl}${path}`);

      const curl = spawn('curl', curlArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      curl.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      curl.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      curl.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            resolve({ raw: stdout });
          }
        } else {
          reject(new Error(`HTTP request failed: ${stderr || stdout}`));
        }
      });
    });
  }

  setupTools() {
    const z = require('zod');
    
    // Wait for tunnel to establish, then register tools
    setTimeout(async () => {
      try {
        const response = await this.makeHttpRequest('GET', '/api/tools');
        console.error(`Discovered ${response.tools?.length || 0} remote tools`);
      } catch (error) {
        console.error(`Failed to discover remote tools: ${error.message}`);
      }
    }, 2000);
    
    // Health check tool
    this.server.registerTool('health_check', {
      description: 'Check the health of the remote MCP server',
      inputSchema: {},
    }, async () => {
      try {
        const health = await this.makeHttpRequest('GET', '/health');
        return {
          content: [
            {
              type: 'text',
              text: `🏥 Remote MCP Server Health Check

Status: ${health.status}
Service: ${health.service}
Version: ${health.version}
Message: ${health.message}
Uptime: ${health.uptime}s

Features:
${Object.entries(health.features || {}).map(([key, value]) => 
  `• ${key}: ${value ? '✅' : '❌'}`).join('\n')}

Connection: ✅ Via SSH tunnel to ${this.vpsHost}
Tunnel: localhost:${this.tunnelPort} → ${this.vpsHost}:3001`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Health check failed: ${error.message}

Connection: ${this.baseUrl}
Tunnel: ${this.vpsHost}:3001`
            }
          ]
        };
      }
    });

    // Get metrics tool
    this.server.registerTool('get_metrics', {
      description: 'Get server performance metrics',
      inputSchema: {},
    }, async () => {
      try {
        const metrics = await this.makeHttpRequest('GET', '/metrics');
        return {
          content: [
            {
              type: 'text',
              text: `📊 Remote MCP Server Metrics

Server Information:
• Uptime: ${metrics.server?.uptime || 'N/A'}s
• Version: ${metrics.server?.version || 'N/A'}
• Memory Usage: ${JSON.stringify(metrics.server?.memory_usage || 'N/A', null, 2)}
• CPU Usage: ${JSON.stringify(metrics.server?.cpu_usage || 'N/A', null, 2)}

Connection: ${this.baseUrl} → ${this.vpsHost}:3001`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Metrics request failed: ${error.message}`
            }
          ]
        };
      }
    });

    // Search memories tool
    this.server.registerTool('search_memories', {
      description: 'Search stored memories on the remote server',
      inputSchema: {
        query: z.string().describe('The search query'),
        limit: z.number().optional().describe('Maximum number of results')
      },
    }, async ({ query, limit }) => {
      try {
        const result = await this.makeHttpRequest('POST', '/api/execute/search_memories', {
          parameters: { query, limit }
        });
        return {
          content: [
            {
              type: 'text',
              text: `🔍 Memory Search Results

Query: "${query}"
${limit ? `Limit: ${limit}` : ''}

Results:
${JSON.stringify(result.result || result, null, 2)}

Server: ${this.vpsHost} (via SSH tunnel)`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Memory search failed: ${error.message}`
            }
          ]
        };
      }
    });

    // Create memory tool
    this.server.registerTool('create_memory', {
      description: 'Create a new memory on the remote server',
      inputSchema: {
        content: z.string().describe('The memory content'),
        title: z.string().optional().describe('Memory title'),
        tags: z.array(z.string()).optional().describe('Tags for the memory')
      },
    }, async ({ content, title, tags }) => {
      try {
        const result = await this.makeHttpRequest('POST', '/api/execute/create_memory', {
          parameters: { content, title, tags }
        });
        return {
          content: [
            {
              type: 'text',
              text: `💾 Memory Created

Content: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"
${title ? `Title: ${title}` : ''}
${tags ? `Tags: ${tags.join(', ')}` : ''}

Result:
${JSON.stringify(result.result || result, null, 2)}

Server: ${this.vpsHost} (via SSH tunnel)`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Memory creation failed: ${error.message}`
            }
          ]
        };
      }
    });

    // Tunnel status tool
    this.server.registerTool('tunnel_status', {
      description: 'Check SSH tunnel connection status',
      inputSchema: {},
    }, async () => {
      return {
        content: [
          {
            type: 'text',
            text: `🔗 SSH Tunnel Status

Tunnel: localhost:${this.tunnelPort} → ${this.vpsHost}:3001
Process: ${this.tunnelProcess && !this.tunnelProcess.killed ? 'Running' : 'Not running'}
Base URL: ${this.baseUrl}

VPS Host: ${this.vpsHost}
Local Port: ${this.tunnelPort}`
          }
        ]
      };
    });
  }

  async start() {
    console.error(`Starting Tunnel MCP Client...`);
    console.error(`SSH Tunnel: ${this.vpsHost}:3001 → localhost:${this.tunnelPort}`);
    
    // Wait for tunnel to establish
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Tunnel MCP Client connected and ready for Claude Desktop');
  }
}

// Start the client
if (require.main === module) {
  const client = new TunnelMCPClient();
  client.start().catch(error => {
    console.error('Failed to start Tunnel MCP Client:', error);
    process.exit(1);
  });
}

module.exports = TunnelMCPClient;