#!/usr/bin/env node

/**
 * Lanonasis MCP Server - Local Development Version
 * 
 * This is a simplified version of the unified server for local development
 * that doesn't require real Supabase credentials and focuses on core functionality
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import winston from 'winston';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment
const esmFilename = fileURLToPath(import.meta.url);
const esmDirname = dirname(esmFilename);
dotenv.config({ path: join(esmDirname, '..', '.env.local') });

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console()
  ],
});

/**
 * Local Development MCP Server
 */
class LocalMCPServer {
  private mcpServer: Server;
  private httpServer: any;
  private tools: Record<string, (args: any) => Promise<any>>;

  constructor() {
    this.mcpServer = new Server({
      name: 'lanonasis-mcp-server',
      version: '1.0.0',
      capabilities: {
        tools: {},
      },
    });

    this.tools = this.initializeTools();
    this.setupHandlers();
  }

  private initializeTools() {
    return {
      // Memory Management Tools (6 tools)
      create_memory: async (args: any) => {
        logger.info('Creating memory (mock)', args);
        return {
          id: `mem_${Date.now()}`,
          title: args.title,
          content: args.content,
          created_at: new Date().toISOString(),
          status: 'created'
        };
      },
      
      search_memories: async (args: any) => {
        logger.info('Searching memories (mock)', args);
        return {
          results: [
            {
              id: 'mem_1',
              title: 'Sample Memory',
              content: 'This is a sample memory for local development',
              score: 0.95,
              created_at: new Date().toISOString()
            }
          ],
          total: 1,
          query: args.query
        };
      },

      get_memory: async (args: any) => {
        logger.info('Getting memory (mock)', args);
        return {
          id: args.id,
          title: 'Sample Memory',
          content: 'This is a sample memory content',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      },

      update_memory: async (args: any) => {
        logger.info('Updating memory (mock)', args);
        return {
          id: args.id,
          title: args.title || 'Updated Memory',
          content: args.content || 'Updated content',
          updated_at: new Date().toISOString(),
          status: 'updated'
        };
      },

      delete_memory: async (args: any) => {
        logger.info('Deleting memory (mock)', args);
        return {
          id: args.id,
          status: 'deleted',
          deleted_at: new Date().toISOString()
        };
      },

      list_memories: async (args: any) => {
        logger.info('Listing memories (mock)', args);
        return {
          memories: [
            {
              id: 'mem_1',
              title: 'Sample Memory 1',
              created_at: new Date().toISOString()
            },
            {
              id: 'mem_2', 
              title: 'Sample Memory 2',
              created_at: new Date().toISOString()
            }
          ],
          total: 2,
          limit: args.limit || 10,
          offset: args.offset || 0
        };
      },

      // API Key Management Tools (4 tools)
      create_api_key: async (args: any) => {
        logger.info('Creating API key (mock)', args);
        return {
          key_id: `key_${Date.now()}`,
          name: args.name,
          api_key: `sk_dev_${Math.random().toString(36).substring(2)}`,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
      },

      list_api_keys: async (args: any) => {
        logger.info('Listing API keys (mock)', args);
        return {
          keys: [
            {
              key_id: 'key_1',
              name: 'Development Key',
              created_at: new Date().toISOString(),
              last_used: new Date().toISOString(),
              status: 'active'
            }
          ],
          total: 1
        };
      },

      rotate_api_key: async (args: any) => {
        logger.info('Rotating API key (mock)', args);
        return {
          key_id: args.key_id,
          new_api_key: `sk_dev_${Math.random().toString(36).substring(2)}`,
          rotated_at: new Date().toISOString(),
          status: 'rotated'
        };
      },

      delete_api_key: async (args: any) => {
        logger.info('Deleting API key (mock)', args);
        return {
          key_id: args.key_id,
          status: 'deleted',
          deleted_at: new Date().toISOString()
        };
      },

      // System & Organization Tools (7+ tools)
      get_health_status: async (args: any) => {
        logger.info('Getting health status (mock)', args);
        return {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: '1.0.0-local',
          environment: 'development',
          services: {
            database: 'mock',
            redis: 'mock',
            supabase: 'mock'
          },
          metrics: args.include_metrics ? {
            memory_usage: process.memoryUsage(),
            cpu_usage: process.cpuUsage()
          } : undefined
        };
      },

      get_organization_info: async (args: any) => {
        logger.info('Getting organization info (mock)', args);
        return {
          id: 'org_local_dev',
          name: 'Local Development Organization',
          created_at: new Date().toISOString(),
          plan: 'development',
          usage: args.include_usage ? {
            api_calls: 100,
            storage_used: '1MB',
            users: 1
          } : undefined
        };
      },

      create_project: async (args: any) => {
        logger.info('Creating project (mock)', args);
        return {
          id: `proj_${Date.now()}`,
          name: args.name,
          description: args.description,
          created_at: new Date().toISOString(),
          status: 'active'
        };
      },

      list_projects: async (args: any) => {
        logger.info('Listing projects (mock)', args);
        return {
          projects: [
            {
              id: 'proj_1',
              name: 'Local Development Project',
              created_at: new Date().toISOString(),
              status: 'active'
            }
          ],
          total: 1
        };
      },

      get_config_tool: async (args: any) => {
        logger.info('Getting config (mock)', args);
        const config = {
          server: {
            port: process.env.PORT || '3001',
            host: process.env.HOST || 'localhost',
            environment: 'development'
          },
          features: {
            mcp_enabled: true,
            websocket_enabled: true,
            sse_enabled: true
          }
        };
        
        if (args.key) {
          return { [args.key]: config[args.key as keyof typeof config] };
        }
        
        return config;
      },

      set_config_tool: async (args: any) => {
        logger.info('Setting config (mock)', args);
        return {
          key: args.key,
          value: args.value,
          updated_at: new Date().toISOString(),
          status: 'updated'
        };
      },

      system_diagnostics: async (args: any) => {
        logger.info('Running system diagnostics (mock)', args);
        return {
          timestamp: new Date().toISOString(),
          system: {
            platform: process.platform,
            arch: process.arch,
            node_version: process.version,
            uptime: process.uptime()
          },
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          environment: {
            node_env: process.env.NODE_ENV,
            port: process.env.PORT
          },
          status: 'healthy'
        };
      },

      get_api_docs: async (args: any) => {
        logger.info('Getting API documentation (redirect to docs.lanonasis.com)', args);
        return {
          docs_url: 'https://docs.lanonasis.com',
          api_reference: 'https://docs.lanonasis.com/api',
          mcp_integration: 'https://docs.lanonasis.com/api/mcp-integration',
          endpoints: {
            health: '/health',
            tools: '/api/tools',
            execute: '/api/execute/:tool',
            docs: '/api/docs'
          },
          description: 'Complete API documentation and integration guides',
          timestamp: new Date().toISOString()
        };
      }
    };
  }

  private setupHandlers() {
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = Object.keys(this.tools).map(name => ({
        name,
        description: this.getToolDescription(name),
        inputSchema: {
          type: 'object',
          properties: this.getToolProperties(name),
          required: this.getToolRequired(name)
        }
      }));

      return { tools };
    });

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (!this.tools[name]) {
        throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`);
      }

      try {
        const result = await this.tools[name](args || {});
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error(`Error executing tool ${name}:`, error);
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  private getToolDescription(name: string): string {
    const descriptions: Record<string, string> = {
      create_memory: 'Create a new memory entry',
      search_memories: 'Search through stored memories',
      get_memory: 'Retrieve a specific memory by ID',
      update_memory: 'Update an existing memory',
      delete_memory: 'Delete a memory by ID',
      list_memories: 'List all memories with pagination',
      create_api_key: 'Create a new API key',
      list_api_keys: 'List all API keys',
      rotate_api_key: 'Rotate an existing API key',
      delete_api_key: 'Delete an API key',
      get_health_status: 'Get server health status',
      get_organization_info: 'Get organization information',
      create_project: 'Create a new project',
      list_projects: 'List all projects',
      get_config_tool: 'Get configuration settings',
      set_config_tool: 'Set configuration settings',
      system_diagnostics: 'Run system diagnostics',
      get_api_docs: 'Get API documentation and redirect to docs.lanonasis.com'
    };
    return descriptions[name] || 'Tool description not available';
  }

  private getToolProperties(name: string): Record<string, any> {
    const properties: Record<string, Record<string, any>> = {
      create_memory: {
        title: { type: 'string' },
        content: { type: 'string' },
        memory_type: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
      },
      search_memories: {
        query: { type: 'string' },
        limit: { type: 'number' },
        threshold: { type: 'number' }
      },
      get_memory: {
        id: { type: 'string' }
      },
      update_memory: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' }
      },
      delete_memory: {
        id: { type: 'string' }
      },
      list_memories: {
        limit: { type: 'number' },
        offset: { type: 'number' }
      },
      create_api_key: {
        name: { type: 'string' },
        description: { type: 'string' }
      },
      rotate_api_key: {
        key_id: { type: 'string' }
      },
      delete_api_key: {
        key_id: { type: 'string' }
      },
      get_health_status: {
        include_metrics: { type: 'boolean' }
      },
      get_organization_info: {
        include_usage: { type: 'boolean' }
      },
      create_project: {
        name: { type: 'string' },
        description: { type: 'string' }
      },
      get_config_tool: {
        key: { type: 'string' },
        section: { type: 'string' }
      },
      set_config_tool: {
        key: { type: 'string' },
        value: { type: 'string' }
      }
    };
    return properties[name] || {};
  }

  private getToolRequired(name: string): string[] {
    const required: Record<string, string[]> = {
      create_memory: ['title', 'content'],
      search_memories: ['query'],
      get_memory: ['id'],
      update_memory: ['id'],
      delete_memory: ['id'],
      create_api_key: ['name'],
      rotate_api_key: ['key_id'],
      delete_api_key: ['key_id'],
      create_project: ['name'],
      set_config_tool: ['key', 'value']
    };
    return required[name] || [];
  }

  async startStdio() {
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
    logger.info('🚀 Local MCP Server started in STDIO mode');
  }

  async startHttp() {
    const app = express();
    
    // Middleware
    app.use(helmet());
    app.use(cors());
    app.use(compression());
    app.use(express.json());

    // Health endpoint
    app.get('/health', (req, res) => {
      try {
        res.status(200).json({
          status: 'healthy',
          service: 'Lanonasis MCP Server (Local)',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: '1.0.0-local',
          environment: 'development',
          tools_count: Object.keys(this.tools).length
        });
      } catch (error) {
        res.status(500).json({ error: 'Health check failed' });
      }
    });

    // Tools endpoint
    app.get('/api/tools', (req, res) => {
      const tools = Object.keys(this.tools).map(name => ({
        name,
        description: this.getToolDescription(name)
      }));
      
      res.json({
        tools,
        total: tools.length,
        timestamp: new Date().toISOString()
      });
    });

    // Execute tool endpoint
    app.post('/api/execute/:tool', async (req, res) => {
      const { tool } = req.params;
      const { parameters = {} } = req.body;
      
      if (!this.tools[tool]) {
        return res.status(404).json({
          error: 'Tool not found',
          available_tools: Object.keys(this.tools)
        });
      }

      try {
        const result = await this.tools[tool](parameters);
        res.json({
          tool,
          parameters,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error(`Error executing tool ${tool}:`, error);
        res.status(500).json({
          error: 'Tool execution failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API docs endpoint
    app.get('/api/docs', (req, res) => {
      res.json({
        docs_url: 'https://docs.lanonasis.com',
        api_reference: 'https://docs.lanonasis.com/api',
        mcp_integration: 'https://docs.lanonasis.com/api/mcp-integration',
        redirect_message: 'Visit docs.lanonasis.com for complete API documentation',
        endpoints: {
          health: '/health',
          tools: '/api/tools',
          execute: '/api/execute/:tool',
          docs: '/api/docs'
        },
        timestamp: new Date().toISOString()
      });
    });

    // Root endpoint
    app.get('/', (req, res) => {
      res.json({
        name: 'Lanonasis MCP Server (Local Development)',
        version: '1.0.0-local',
        description: 'Local development version with mock data',
        tools_count: Object.keys(this.tools).length,
        endpoints: {
          health: '/health',
          tools: '/api/tools',
          execute: '/api/execute/:tool',
          docs: '/api/docs'
        },
        timestamp: new Date().toISOString()
      });
    });

    const port = parseInt(process.env.PORT || '3001');
    const host = process.env.HOST || 'localhost';
    
    this.httpServer = createServer(app);
    
    this.httpServer.listen(port, host, () => {
      logger.info(`🚀 Local MCP Server running on http://${host}:${port}`);
      logger.info(`📊 Health check: http://${host}:${port}/health`);
      logger.info(`🔧 API tools: http://${host}:${port}/api/tools`);
      logger.info(`✅ ${Object.keys(this.tools).length} tools available`);
    });
  }

  async stop() {
    if (this.httpServer) {
      this.httpServer.close();
    }
    logger.info('🛑 Local MCP Server stopped');
  }
}

// Main function
async function main() {
  const server = new LocalMCPServer();
  
  // Check command line arguments
  const args = process.argv.slice(2);
  const isStdio = args.includes('--stdio');
  const isHttp = args.includes('--http') || process.env.ENABLE_HTTP === 'true';
  
  try {
    if (isStdio) {
      await server.startStdio();
    } else if (isHttp) {
      await server.startHttp();
    } else {
      // Default to HTTP for local development
      await server.startHttp();
    }
  } catch (error) {
    logger.error('Failed to start Local MCP Server:', error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}

// Only start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { LocalMCPServer };
