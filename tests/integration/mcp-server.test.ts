/**
 * Integration tests for MCP server functionality
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

describe('MCP Server Integration', () => {
  let serverProcess: ChildProcess;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Start the MCP server in stdio mode
    const serverPath = path.join(__dirname, '../../dist/unified-mcp-server.js');
    serverProcess = spawn('node', [serverPath, '--stdio'], {
      env: { ...process.env, NODE_ENV: 'test' },
    });

    // Create transport and client
    transport = new StdioClientTransport({
      spawn: () => ({ stdout: serverProcess.stdout!, stdin: serverProcess.stdin! }),
    });

    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    await client.connect(transport);
  }, 30000); // 30 second timeout for server startup

  afterAll(async () => {
    if (client) {
      await client.close();
    }
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  describe('Server Initialization', () => {
    it('should connect to MCP server successfully', async () => {
      expect(client).toBeDefined();
      expect(transport).toBeDefined();
    });

    it('should list available tools', async () => {
      const result = await client.request(
        { method: 'tools/list' },
        { tools: [] }
      );

      expect(result.tools).toBeInstanceOf(Array);
      expect(result.tools.length).toBeGreaterThan(0);

      // Verify essential tools are available
      const toolNames = result.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain('create_memory');
      expect(toolNames).toContain('search_memories');
      expect(toolNames).toContain('get_memory');
      expect(toolNames).toContain('list_memories');
      expect(toolNames).toContain('update_memory');
      expect(toolNames).toContain('delete_memory');
      expect(toolNames).toContain('get_health_status');
    });

    it('should provide server information', async () => {
      const result = await client.request(
        { method: 'initialize' },
        {
          protocolVersion: '2024-11-05',
          capabilities: {
            resources: {},
            tools: {},
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        }
      );

      expect(result.serverInfo).toBeDefined();
      expect(result.serverInfo.name).toBe('lanonasis-mcp-server');
      expect(result.serverInfo.version).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should execute get_health_status tool', async () => {
      const result = await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'get_health_status',
            arguments: {},
          },
        },
        {}
      );

      expect(result.content).toBeDefined();
      expect(result.content[0]).toEqual({
        type: 'text',
        text: expect.stringContaining('status'),
      });
    });

    it('should handle authentication for memory tools', async () => {
      // This should fail without proper authentication
      const result = await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'list_memories',
            arguments: {},
          },
        },
        {}
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('authentication');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tool names gracefully', async () => {
      try {
        await client.request(
          {
            method: 'tools/call',
            params: {
              name: 'nonexistent_tool',
              arguments: {},
            },
          },
          {}
        );
      } catch (error: any) {
        expect(error.message).toContain('Tool not found');
      }
    });

    it('should handle malformed requests gracefully', async () => {
      try {
        await client.request(
          {
            method: 'tools/call',
            params: {
              name: 'create_memory',
              arguments: {
                // Missing required fields
              },
            },
          },
          {}
        );
      } catch (error: any) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('Protocol Compliance', () => {
    it('should respond to ping requests', async () => {
      const result = await client.request({ method: 'ping' }, {});
      expect(result).toEqual({});
    });

    it('should handle notifications properly', async () => {
      // Send a notification (should not throw)
      await expect(
        client.notification({ method: 'notifications/initialized' })
      ).resolves.not.toThrow();
    });
  });
});