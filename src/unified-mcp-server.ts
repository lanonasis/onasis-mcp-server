#!/usr/bin/env node

/**
 * Lanonasis Unified MCP Server - Multi-Protocol Edition
 *
 * Supports multiple connection methods:
 * - Stdio (Standards-compliant MCP)
 * - HTTP REST API
 * - Server-Sent Events (SSE)
 * - WebSocket
 * - Claude Desktop integration
 * - CLI/SDK integration
 * - MCP Studio compatibility
 *
 * Features 17+ enterprise tools with Supabase integration
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
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import winston from 'winston';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  HealthStatus,
  OrganizationInfo,
  MemoryUpdateData,
} from './types/health-status.js';

// Load environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.production') });

// Global type declarations
declare global {
  // Holds the app server instance for signal handlers
  var mcpServerInstance: LanonasisUnifiedMCPServer | undefined;
}
// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.File({
      filename: 'logs/lanonasis-mcp.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// MCP Protocol Compliance: Redirect all console output to stderr for stdio mode
const originalConsoleError = console.error;
// The next lines ensure normal console.* calls get re-routed
console.log = (...args) => originalConsoleError('[MCP-LOG]', ...args);
console.error = (...args) => originalConsoleError('[MCP-ERROR]', ...args);
console.warn = (...args) => originalConsoleError('[MCP-WARN]', ...args);
console.info = (...args) => originalConsoleError('[MCP-INFO]', ...args);

// Disable colors for MCP protocol compliance
process.env.FORCE_COLOR = '0';
process.env.DEBUG = '';

/**
 * Configuration interface
 */
interface LanonasisMCPServerConfig {
  httpPort: number;
  wsPort: number;
  ssePort: number;
  host: string;
  enableHttp: boolean;
  enableWebSocket: boolean;
  enableSSE: boolean;
  enableStdio: boolean;
  rateLimitWindow: number;
  rateLimitMax: number;
  maxConnections: number;
  supabaseUrl: string;
  supabaseKey: string;
  supabaseSSLCert?: string;
}

/**
 * Argument interfaces for each tool
 */
interface CreateMemoryArgs {
  title: string;
  content: string;
  memory_type?: string;
  tags?: string[];
  topic_id?: string;
}
interface SearchMemoriesArgs {
  query: string;
  limit?: number;
  threshold?: number;
  memory_type?: string;
  tags?: string[];
}
interface GetMemoryArgs {
  id: string;
}
interface UpdateMemoryArgs {
  id: string;
  title?: string;
  content?: string;
  memory_type?: string;
  tags?: string[];
}
interface DeleteMemoryArgs {
  id: string;
}
interface ListMemoriesArgs {
  limit?: number;
  offset?: number;
  memory_type?: string;
  tags?: string[];
  sort?: 'created_at' | 'updated_at' | 'title';
  order?: 'asc' | 'desc';
}

interface CreateApiKeyArgs {
  name: string;
  description?: string;
  access_level?: string;
  expires_in_days?: number;
  project_id?: string;
}
interface ListApiKeysArgs {
  active_only?: boolean;
  project_id?: string;
  limit?: number;
  offset?: number;
}
interface RotateApiKeyArgs {
  key_id: string;
}
interface DeleteApiKeyArgs {
  key_id: string;
}

interface GetHealthStatusArgs {
  include_metrics?: boolean;
}
interface GetAuthStatusArgs {}
interface GetOrganizationInfoArgs {
  include_usage?: boolean;
}
interface CreateProjectArgs {
  name: string;
  description?: string;
  organization_id?: string;
}
interface ListProjectsArgs {
  organization_id?: string;
  limit?: number;
  offset?: number;
}
interface GetConfigToolArgs {
  key?: string;
  section?: string;
}
interface SetConfigToolArgs {
  key: string;
  value: string;
  section?: string;
}

/**
 * Main LanonasisUnifiedMCPServer class
 */
class LanonasisUnifiedMCPServer {
  public config: LanonasisMCPServerConfig;
  private supabase: SupabaseClient;
  private currentAuthContext: any;
  private mcpServer: Server | null;
  private httpServer: any;
  private wsServer: any;
  private sseClients: Set<express.Response>;
  private tools: Record<string, (args: unknown) => Promise<any>>;

  constructor() {
    this.config = {
      // Server ports
      httpPort: parseInt(process.env.PORT || '3001'),
      wsPort: parseInt(process.env.MCP_WS_PORT || '3002'),
      ssePort: parseInt(process.env.MCP_SSE_PORT || '3003'),
      host: process.env.MCP_HOST || '0.0.0.0',

      // Features
      enableHttp: process.env.ENABLE_HTTP !== 'false',
      enableWebSocket: process.env.ENABLE_WEBSOCKET !== 'false',
      enableSSE: process.env.ENABLE_SSE !== 'false',
      enableStdio: process.env.ENABLE_STDIO !== 'false',

      // Security
      rateLimitWindow: parseInt(process.env.MCP_RATE_LIMIT_WINDOW || '900000'), // 15 min
      rateLimitMax: parseInt(process.env.MCP_RATE_LIMIT || '100'),
      maxConnections: parseInt(process.env.MCP_MAX_CONNECTIONS || '1000'),

      // Supabase
      supabaseUrl: process.env.ONASIS_SUPABASE_URL || process.env.SUPABASE_URL || '',
      supabaseKey:
        process.env.ONASIS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
      supabaseSSLCert: process.env.SUPABASE_SSL_CERT_PATH,
    };

    // Initialize Supabase client
    this.supabase = createClient(this.config.supabaseUrl, this.config.supabaseKey);

    // Initialize servers
    this.mcpServer = null;
    this.httpServer = null;
    this.wsServer = null;
    this.sseClients = new Set();

    // Initialize tool implementations
    this.tools = this.initializeTools();

    logger.info('Lanonasis Unified MCP Server initialized', {
      config: this.config,
      toolCount: Object.keys(this.tools).length,
    });
  }

  /**
   * Initialize all 17+ MCP tools
   */
  initializeTools(): Record<string, (args: unknown) => Promise<any>> {
    return {
      // Memory Management Tools (6 tools)
      create_memory: (args) => this.createMemoryTool(args as CreateMemoryArgs),
      search_memories: (args) => this.searchMemoriesTool(args as SearchMemoriesArgs),
      get_memory: (args) => this.getMemoryTool(args as GetMemoryArgs),
      update_memory: (args) => this.updateMemoryTool(args as UpdateMemoryArgs),
      delete_memory: (args) => this.deleteMemoryTool(args as DeleteMemoryArgs),
      list_memories: (args) => this.listMemoriesTool(args as ListMemoriesArgs),

      // API Key Management Tools (4 tools)
      create_api_key: (args) => this.createApiKeyTool(args as CreateApiKeyArgs),
      list_api_keys: (args) => this.listApiKeysTool(args as ListApiKeysArgs),
      rotate_api_key: (args) => this.rotateApiKeyTool(args as RotateApiKeyArgs),
      delete_api_key: (args) => this.deleteApiKeyTool(args as DeleteApiKeyArgs),

      // System & Organization Tools (7 tools)
      get_health_status: (args) => this.getHealthStatusTool(args as GetHealthStatusArgs),
      get_auth_status: (args) => this.getAuthStatusTool(args as GetAuthStatusArgs),
      get_organization_info: (args) =>
        this.getOrganizationInfoTool(args as GetOrganizationInfoArgs),
      create_project: (args) => this.createProjectTool(args as CreateProjectArgs),
      list_projects: (args) => this.listProjectsTool(args as ListProjectsArgs),
      get_config: (args) => this.getConfigTool(args as GetConfigToolArgs),
      set_config: (args) => this.setConfigTool(args as SetConfigToolArgs),
    };
  }

  /**
   * Get tool definitions for MCP protocol
   */
  getToolDefinitions() {
    return [
      // Memory Management Tools
      {
        name: 'create_memory',
        description: 'Create a new memory entry with vector embedding for semantic search',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Memory title' },
            content: { type: 'string', description: 'Memory content' },
            memory_type: {
              type: 'string',
              enum: ['context', 'project', 'knowledge', 'reference', 'personal', 'workflow'],
              description: 'Type of memory for organization',
            },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
            topic_id: { type: 'string', description: 'Topic ID for organization' },
          },
          required: ['title', 'content'],
        },
      },
      {
        name: 'search_memories',
        description: 'Search through memories with semantic vector search',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query for semantic matching' },
            limit: { type: 'number', default: 10, description: 'Maximum results to return' },
            threshold: { type: 'number', default: 0.7, description: 'Similarity threshold (0.0-1.0)' },
            memory_type: { type: 'string', description: 'Filter by memory type' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_memory',
        description: 'Get a specific memory by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Memory ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'update_memory',
        description: 'Update an existing memory entry',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Memory ID to update' },
            title: { type: 'string', description: 'Updated title' },
            content: { type: 'string', description: 'Updated content' },
            memory_type: { type: 'string', description: 'Updated memory type' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Updated tags',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'delete_memory',
        description: 'Delete a memory by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Memory ID to delete' },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_memories',
        description: 'List memories with pagination and filters',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 20, description: 'Number of memories to return' },
            offset: { type: 'number', default: 0, description: 'Offset for pagination' },
            memory_type: { type: 'string', description: 'Filter by memory type' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
            sort: { type: 'string', enum: ['created_at', 'updated_at', 'title'], default: 'updated_at' },
            order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        },
      },

      // API Key Management Tools
      {
        name: 'create_api_key',
        description: 'Create a new API key for programmatic access',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'API key name/description' },
            description: { type: 'string', description: 'Detailed description' },
            access_level: {
              type: 'string',
              enum: ['public', 'authenticated', 'team', 'admin', 'enterprise'],
              default: 'authenticated',
              description: 'Access level for the key',
            },
            expires_in_days: { type: 'number', default: 365, description: 'Expiry in days' },
            project_id: { type: 'string', description: 'Associated project ID' },
          },
          required: ['name'],
        },
      },
      {
        name: 'list_api_keys',
        description: 'List API keys with pagination',
        inputSchema: {
          type: 'object',
          properties: {
            active_only: { type: 'boolean', default: true, description: 'Show only active keys' },
            project_id: { type: 'string', description: 'Filter by project ID' },
            limit: { type: 'number', default: 20 },
            offset: { type: 'number', default: 0 },
          },
        },
      },
      {
        name: 'rotate_api_key',
        description: 'Rotate an existing API key (generates new secret)',
        inputSchema: {
          type: 'object',
          properties: {
            key_id: { type: 'string', description: 'API key ID to rotate' },
          },
          required: ['key_id'],
        },
      },
      {
        name: 'delete_api_key',
        description: 'Delete an API key',
        inputSchema: {
          type: 'object',
          properties: {
            key_id: { type: 'string', description: 'API key ID to delete' },
          },
          required: ['key_id'],
        },
      },

      // System & Organization Tools
      {
        name: 'get_health_status',
        description: 'Get comprehensive system health status',
        inputSchema: {
          type: 'object',
          properties: {
            include_metrics: {
              type: 'boolean',
              default: false,
              description: 'Include performance metrics',
            },
          },
        },
      },
      {
        name: 'get_auth_status',
        description: 'Get current authentication status and user info',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_organization_info',
        description: 'Get organization information and settings',
        inputSchema: {
          type: 'object',
          properties: {
            include_usage: {
              type: 'boolean',
              default: false,
              description: 'Include usage statistics',
            },
          },
        },
      },
      {
        name: 'create_project',
        description: 'Create a new project for memory organization',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Project name' },
            description: { type: 'string', description: 'Project description' },
            organization_id: { type: 'string', description: 'Organization ID' },
          },
          required: ['name'],
        },
      },
      {
        name: 'list_projects',
        description: 'List projects with pagination',
        inputSchema: {
          type: 'object',
          properties: {
            organization_id: { type: 'string', description: 'Filter by organization ID' },
            limit: { type: 'number', default: 20 },
            offset: { type: 'number', default: 0 },
          },
        },
      },
      {
        name: 'get_config',
        description: 'Get configuration settings',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Specific config key to retrieve' },
            section: { type: 'string', description: 'Configuration section' },
          },
        },
      },
      {
        name: 'set_config',
        description: 'Set configuration setting',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Configuration key' },
            value: { type: 'string', description: 'Configuration value' },
            section: { type: 'string', description: 'Configuration section' },
          },
          required: ['key', 'value'],
        },
      },
    ];
  }

  /**
   * Start all enabled protocols
   */
  async startUnifiedServer() {
    const startTasks: Promise<void>[] = [];

    // Start stdio MCP server (primary protocol)
    if (this.config.enableStdio) {
      startTasks.push(this.startStdioServer());
    }

    // Start HTTP server
    if (this.config.enableHttp) {
      startTasks.push(this.startHttpServer());
    }

    // Start WebSocket server
    if (this.config.enableWebSocket) {
      startTasks.push(this.startWebSocketServer());
    }

    // Start SSE server
    if (this.config.enableSSE) {
      startTasks.push(this.startSSEServer());
    }

    await Promise.all(startTasks);

    logger.info('Lanonasis Unified MCP Server started successfully', {
      stdio: this.config.enableStdio,
      http: this.config.enableHttp ? this.config.httpPort : false,
      websocket: this.config.enableWebSocket ? this.config.wsPort : false,
      sse: this.config.enableSSE ? this.config.ssePort : false,
    });
  }

  /**
   * Start stdio MCP server (primary protocol)
   */
  async startStdioServer() {
    // Create the server definition
    this.mcpServer = new Server(
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

    // List tools handler
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getToolDefinitions(),
    }));

    // Call tool handler
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params;
      const handler = this.tools[name];
      if (!handler) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
      try {
        const result = await handler(args || {});
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        if (error instanceof Error) {
          logger.error(`Tool ${name} failed:`, error);
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error.message}`
          );
        }
        throw new McpError(ErrorCode.InternalError, 'Tool execution failed: Unknown error');
      }
    });

    // Only connect stdio transport if not in HTTP mode
    if (process.argv.includes('--stdio') || !process.argv.includes('--http')) {
      const transport = new StdioServerTransport();
      await this.mcpServer.connect(transport);
      console.error('Lanonasis MCP Server running on stdio interface');
    }
  }

  /**
   * Start HTTP REST API server
   */
  async startHttpServer() {
    const app = express();

    // Security middleware
    app.use(helmet());
    app.use(
      cors({
        origin: process.env.CORS_ORIGINS?.split(',') || [
          'http://localhost:3000',
          'https://lanonasis.com',
        ],
        credentials: true,
      })
    );
    app.use(compression());

    // Rate limiting
    app.use(
      '/api',
      rateLimit({
        windowMs: this.config.rateLimitWindow,
        max: this.config.rateLimitMax,
        message: { error: 'Too many requests' },
      })
    );

    app.use(express.json({ limit: '10mb' }));

    // Health check endpoint
    app.get('/health', async (req, res) => {
      const health = await this.getHealthStatusTool({});
      res.json(health);
    });

    // List tools endpoint
    app.get('/api/v1/tools', (req, res) => {
      res.json({
        success: true,
        tools: this.getToolDefinitions(),
        count: this.getToolDefinitions().length,
      });
    });

    // Execute tool endpoint
    app.post('/api/v1/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const args = req.body;
        const handler = this.tools[toolName];
        if (!handler) {
          return res.status(404).json({
            success: false,
            error: `Tool ${toolName} not found`,
          });
        }
        const result = await handler(args);
        res.json({
          success: true,
          result,
          tool: toolName,
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          logger.error('HTTP tool execution failed:', error);
          return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
        logger.error('HTTP tool execution failed: unknown error');
        return res.status(500).json({
          success: false,
          error: 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // MCP message endpoint (Claude Desktop compatibility)
    app.post('/api/v1/mcp/message', async (req, res) => {
      try {
        const { method, params } = req.body;

        if (method === 'tools/list') {
          return res.json({
            jsonrpc: '2.0',
            id: req.body.id,
            result: { tools: this.getToolDefinitions() },
          });
        }

        if (method === 'tools/call') {
          const { name, arguments: args } = params;
          const handler = this.tools[name];
          if (!handler) {
            return res.json({
              jsonrpc: '2.0',
              id: req.body.id,
              error: { code: -32601, message: `Tool ${name} not found` },
            });
          }
          const result = await handler(args || {});
          return res.json({
            jsonrpc: '2.0',
            id: req.body.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            },
          });
        }

        return res.status(400).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: { code: -32600, message: 'Invalid request method' },
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          logger.error('MCP message handling failed:', error);
          return res.json({
            jsonrpc: '2.0',
            id: req.body.id,
            error: { code: -32603, message: error.message },
          });
        }
        logger.error('MCP message handling failed: unknown error');
        return res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: { code: -32603, message: 'Unknown error' },
        });
      }
    });

    this.httpServer = app.listen(this.config.httpPort, this.config.host, () => {
      logger.info(`HTTP server started on ${this.config.host}:${this.config.httpPort}`);
    });
  }

  /**
   * Start WebSocket server
   */
  async startWebSocketServer() {
    const server = createServer();
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws, request) => {
      logger.info('New WebSocket connection', {
        ip: request.headers['x-forwarded-for'] || request.socket.remoteAddress,
      });

      ws.on('message', async (rawData) => {
        try {
          const dataStr = rawData.toString();
          const message = JSON.parse(dataStr);

          // Handle MCP protocol over WebSocket
          if (message.method === 'tools/list') {
            ws.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: message.id,
                result: { tools: this.getToolDefinitions() },
              })
            );
            return;
          }

          if (message.method === 'tools/call') {
            const { name, arguments: args } = message.params;
            const handler = this.tools[name];
            if (!handler) {
              ws.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: message.id,
                  error: { code: -32601, message: `Tool ${name} not found` },
                })
              );
              return;
            }
            const result = await handler(args || {});
            ws.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: message.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(result, null, 2),
                    },
                  ],
                },
              })
            );
          }
        } catch (error: unknown) {
          if (error instanceof Error) {
            logger.error('WebSocket message handling failed:', error);
          } else {
            logger.error('WebSocket message handling failed: unknown error');
          }
          ws.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: 'Parse error' },
            })
          );
        }
      });

      ws.on('close', () => {
        logger.info('WebSocket connection closed');
      });
    });

    server.listen(this.config.wsPort, this.config.host, () => {
      logger.info(`WebSocket server started on ${this.config.host}:${this.config.wsPort}`);
    });
  }

  /**
   * Start Server-Sent Events server
   */
  async startSSEServer() {
    const app = express();

    app.use(
      cors({
        origin: '*',
        credentials: true,
      })
    );

    app.get('/sse', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Client-Id',
      });

      // Add client to set
      this.sseClients.add(res);

      // Send initial connection message
      res.write(`event: connected\n`);
      res.write(
        `data: ${JSON.stringify({
          status: 'connected',
          timestamp: new Date().toISOString(),
        })}\n\n`
      );

      // Send available tools
      res.write(`event: tools\n`);
      res.write(`data: ${JSON.stringify({ tools: this.getToolDefinitions() })}\n\n`);

      // Handle client disconnect
      req.on('close', () => {
        this.sseClients.delete(res);
        logger.info('SSE client disconnected');
      });
    });

    // Tool execution via GET for SSE
    app.get('/sse/tool/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        // req.query is an object of type any
        const args = req.query;

        const handler = this.tools[toolName];
        if (!handler) {
          return res.status(404).json({ error: `Tool ${toolName} not found` });
        }

        const result = await handler(args);
        // Broadcast result to all SSE clients
        this.broadcastToSSE('tool_result', {
          tool: toolName,
          result,
          timestamp: new Date().toISOString(),
        });

        res.json({ success: true, result });
      } catch (error: unknown) {
        if (error instanceof Error) {
          logger.error('SSE tool execution failed:', error);
          return res.status(500).json({ error: error.message });
        }
        logger.error('SSE tool execution failed: unknown error');
        return res.status(500).json({ error: 'Unknown error' });
      }
    });

    const sseServer = app.listen(this.config.ssePort, this.config.host, () => {
      logger.info(`SSE server started on ${this.config.host}:${this.config.ssePort}`);
    });
  }

  /**
   * Broadcast message to all SSE clients
   */
  broadcastToSSE(event: string, data: any) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.sseClients.forEach((client) => {
      try {
        client.write(message);
      } catch {
        this.sseClients.delete(client);
      }
    });
  }

  // ------------------------------------------------------------------
  // Tool Implementations
  // ------------------------------------------------------------------

  async createMemoryTool(args: CreateMemoryArgs) {
    try {
      // Generate embedding for the content
      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: args.content,
          model: 'text-embedding-ada-002',
        }),
      });
      if (!embeddingResponse.ok) {
        throw new Error('Failed to generate embedding');
      }
      const embeddingData = await embeddingResponse.json();
      const embedding = embeddingData.data[0].embedding;

      // Insert memory into Supabase
      const { data, error } = await this.supabase
        .from('memory_entries')
        .insert({
          title: args.title,
          content: args.content,
          memory_type: args.memory_type || 'knowledge',
          tags: args.tags || [],
          topic_id: args.topic_id,
          embedding,
          status: 'active',
          metadata: {
            source: 'mcp-server',
            created_via: 'tool_call',
          },
        })
        .select()
        .single();

      if (error) throw error;

      logger.info('Memory created via MCP', { id: data.id, title: args.title });

      return {
        success: true,
        memory: data,
        message: 'Memory created successfully',
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('Create memory tool failed:', error);
        return {
          success: false,
          error: error.message,
        };
      }
      logger.error('Create memory tool failed: unknown error');
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  async searchMemoriesTool(args: SearchMemoriesArgs) {
    try {
      // Generate embedding for the query
      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: args.query,
          model: 'text-embedding-ada-002',
        }),
      });
      if (!embeddingResponse.ok) {
        throw new Error('Failed to generate embedding for search');
      }
      const embeddingData = await embeddingResponse.json();
      const embedding = embeddingData.data[0].embedding;

      // Search memories using vector similarity
      const { data: memories, error } = await this.supabase.rpc('match_memories', {
        query_embedding: embedding,
        match_threshold: args.threshold || 0.7,
        match_count: args.limit || 10,
      });
      if (error) throw error;

      let filteredMemories = memories || [];

      if (args.memory_type) {
        filteredMemories = filteredMemories.filter(
          (m: { memory_type: string }) => m.memory_type === args.memory_type
        );
      }

      if (args.tags && args.tags.length > 0) {
        filteredMemories = filteredMemories.filter((m: { tags: string[] }) =>
          args.tags?.some((tag) => m.tags.includes(tag))
        );
      }

      logger.info('Memory search completed via MCP', {
        query: args.query,
        resultCount: filteredMemories.length,
      });

      return {
        success: true,
        memories: filteredMemories,
        count: filteredMemories.length,
        query: args.query,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('Search memories tool failed:', error);
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  async getMemoryTool(args: GetMemoryArgs) {
    try {
      const { data, error } = await this.supabase
        .from('memory_entries')
        .select('*')
        .eq('id', args.id)
        .eq('status', 'active')
        .single();

      if (error) throw error;
      return {
        success: true,
        memory: data,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  async updateMemoryTool(args: UpdateMemoryArgs) {
    try {
      const updates: MemoryUpdateData = { updated_at: new Date().toISOString() };

      if (args.title) updates.title = args.title;
      if (args.content) updates.content = args.content;
      if (args.memory_type) updates.memory_type = args.memory_type;
      if (args.tags) updates.tags = args.tags;

      // If content is updated, regenerate embedding
      if (args.content) {
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: args.content,
            model: 'text-embedding-ada-002',
          }),
        });
        if (embeddingResponse.ok) {
          const embeddingData = await embeddingResponse.json();
          updates.embedding = embeddingData.data[0].embedding;
        }
      }

      const { data, error } = await this.supabase
        .from('memory_entries')
        .update(updates)
        .eq('id', args.id)
        .select()
        .single();

      if (error) throw error;
      return {
        success: true,
        memory: data,
        message: 'Memory updated successfully',
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  async deleteMemoryTool(args: DeleteMemoryArgs) {
    try {
      const { data, error } = await this.supabase
        .from('memory_entries')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('id', args.id)
        .select()
        .single();

      if (error) throw error;
      return {
        success: true,
        message: 'Memory deleted successfully',
        deleted_id: args.id,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  async listMemoriesTool(args: ListMemoriesArgs) {
    try {
      let query = this.supabase
        .from('memory_entries')
        .select('id, title, memory_type, tags, created_at, updated_at, access_count')
        .eq('status', 'active');

      if (args.memory_type) {
        query = query.eq('memory_type', args.memory_type);
      }
      if (args.tags && args.tags.length > 0) {
        query = query.contains('tags', args.tags);
      }

      const sortColumn = args.sort || 'updated_at';
      const sortOrder = args.order || 'desc';
      query = query.order(sortColumn, { ascending: sortOrder === 'asc' });

      const limit = Math.min(args.limit || 20, 100);
      const offset = args.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        success: true,
        memories: data || [],
        count: data?.length || 0,
        pagination: {
          limit,
          offset,
          total: count,
        },
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  // API Key Management Tools
  async createApiKeyTool(args: CreateApiKeyArgs) {
    try {
      const keyData = {
        name: args.name,
        description: args.description,
        access_level: args.access_level || 'authenticated',
        project_id: args.project_id,
        expires_at: args.expires_in_days
          ? new Date(Date.now() + args.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
          : null,
        key_prefix: 'onasis_',
        key_secret: this.generateApiKey(),
        is_active: true,
        metadata: {
          created_via: 'mcp-tool',
          source: 'lanonasis-mcp-server',
        },
      };

      const { data, error } = await this.supabase
        .from('api_keys')
        .insert(keyData)
        .select('id, name, key_prefix, key_secret, access_level, expires_at, created_at')
        .single();

      if (error) throw error;

      return {
        success: true,
        api_key: data,
        message: 'API key created successfully',
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  async listApiKeysTool(args: ListApiKeysArgs) {
    try {
      let query = this.supabase
        .from('api_keys')
        .select('id, name, key_prefix, access_level, expires_at, is_active, created_at, last_used_at');

      if (args.active_only !== false) {
        query = query.eq('is_active', true);
      }
      if (args.project_id) {
        query = query.eq('project_id', args.project_id);
      }

      const limit = Math.min(args.limit || 20, 100);
      const offset = args.offset || 0;
      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) throw error;

      return {
        success: true,
        api_keys: data || [],
        count: data?.length || 0,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  async rotateApiKeyTool(args: RotateApiKeyArgs) {
    try {
      const newSecret = this.generateApiKey();
      const { data, error } = await this.supabase
        .from('api_keys')
        .update({
          key_secret: newSecret,
          updated_at: new Date().toISOString(),
        })
        .eq('id', args.key_id)
        .select('id, name, key_prefix, key_secret')
        .single();

      if (error) throw error;

      return {
        success: true,
        api_key: data,
        message: 'API key rotated successfully',
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  async deleteApiKeyTool(args: DeleteApiKeyArgs) {
    try {
      const { data, error } = await this.supabase
        .from('api_keys')
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', args.key_id)
        .select('id, name')
        .single();

      if (error) throw error;
      return {
        success: true,
        message: `API key '${data.name}' deleted successfully`,
        deleted_id: args.key_id,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  // System Tools
  async getHealthStatusTool(args: GetHealthStatusArgs): Promise<HealthStatus> {
    const healthData: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      server_info: {
        name: 'lanonasis-mcp-server',
        protocols: {
          stdio: this.config.enableStdio,
          http: this.config.enableHttp ? this.config.httpPort : false,
          websocket: this.config.enableWebSocket ? this.config.wsPort : false,
          sse: this.config.enableSSE ? this.config.ssePort : false,
        },
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        tools_count: Object.keys(this.tools).length,
      },
      services: {
        supabase: 'connected',
        openai: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured',
      },
    };

    if (args.include_metrics) {
      try {
        // Get basic metrics from Supabase
        const { count: memoryCount } = await this.supabase
          .from('memory_entries')
          .select('id', { count: 'exact' })
          .eq('status', 'active');

        const { count: apiKeyCount } = await this.supabase
          .from('api_keys')
          .select('id', { count: 'exact' })
          .eq('is_active', true);

        healthData.metrics = {
          total_memories: memoryCount || 0,
          active_api_keys: apiKeyCount || 0,
          sse_connections: this.sseClients.size,
        };
      } catch (error: unknown) {
        if (error instanceof Error) {
          healthData.metrics_error = error.message;
        } else {
          healthData.metrics_error = 'Unknown error fetching metrics';
        }
      }
    }

    return healthData;
  }

  async getAuthStatusTool(_: GetAuthStatusArgs) {
    return {
      status: 'authenticated',
      server: 'lanonasis-mcp-server',
      capabilities: [
        'memory_management',
        'api_key_management',
        'multi_protocol_support',
        'semantic_search',
        'vector_embeddings',
      ],
      protocols: {
        stdio: this.config.enableStdio,
        http: this.config.enableHttp,
        websocket: this.config.enableWebSocket,
        sse: this.config.enableSSE,
      },
    };
  }

  async getOrganizationInfoTool(args: GetOrganizationInfoArgs): Promise<OrganizationInfo> {
    const orgInfo: any = {
      name: 'Lanonasis Organization',
      plan: 'enterprise',
      features: [
        'unlimited_memories',
        'api_key_management',
        'multi_protocol_access',
        'semantic_search',
        'bulk_operations',
      ],
      limits: {
        memories: -1, // unlimited
        api_keys: -1, // unlimited
        rate_limit: this.config.rateLimitMax,
      },
    };

    if (args.include_usage) {
      try {
        const { count: memoryCount } = await this.supabase
          .from('memory_entries')
          .select('id', { count: 'exact' })
          .eq('status', 'active');

        orgInfo.usage = {
          memories_used: memoryCount || 0,
          api_keys_active: await this.getActiveApiKeyCount(),
        };
      } catch (error: unknown) {
        if (error instanceof Error) {
          orgInfo.usage_error = error.message;
        } else {
          orgInfo.usage_error = 'Unknown error retrieving usage';
        }
      }
    }

    return orgInfo;
  }

  async createProjectTool(args: CreateProjectArgs) {
    try {
      const { data, error } = await this.supabase
        .from('projects')
        .insert({
          name: args.name,
          description: args.description,
          organization_id: args.organization_id,
          status: 'active',
          metadata: {
            created_via: 'mcp-tool',
          },
        })
        .select()
        .single();

      if (error) throw error;
      return {
        success: true,
        project: data,
        message: 'Project created successfully',
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  async listProjectsTool(args: ListProjectsArgs) {
    try {
      let query = this.supabase
        .from('projects')
        .select('id, name, description, status, created_at')
        .eq('status', 'active');

      if (args.organization_id) {
        query = query.eq('organization_id', args.organization_id);
      }

      const limit = Math.min(args.limit || 20, 100);
      const offset = args.offset || 0;

      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) throw error;
      return {
        success: true,
        projects: data || [],
        count: data?.length || 0,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }

  async getConfigTool(args: GetConfigToolArgs) {
    // We'll treat config as a typed object but index with caution
    const config: Record<string, unknown> = {
      server: {
        version: '1.0.0',
        protocols: ['stdio', 'http', 'websocket', 'sse'],
        tools_count: Object.keys(this.tools).length,
      },
      features: {
        semantic_search: true,
        vector_embeddings: true,
        api_key_management: true,
        multi_protocol: true,
      },
      limits: {
        rate_limit: this.config.rateLimitMax,
        max_connections: this.config.maxConnections,
        memory_limit: 'unlimited',
      },
    };

    if (args.key) {
      const keys = args.key.split('.');
      let value: unknown = config;
      for (const k of keys) {
        if (typeof value === 'object' && value !== null) {
          value = (value as Record<string, unknown>)[k];
        } else {
          value = undefined;
          break;
        }
      }
      if (value === undefined) {
        return {
          success: false,
          error: `Configuration key '${args.key}' not found`,
        };
      }
      return {
        success: true,
        key: args.key,
        value,
      };
    }

    if (args.section) {
      if (config[args.section] !== undefined) {
        return {
          success: true,
          section: args.section,
          config: config[args.section],
        };
      }
      return {
        success: false,
        error: `Configuration section '${args.section}' not found`,
      };
    }

    return {
      success: true,
      config,
    };
  }

  async setConfigTool(args: SetConfigToolArgs) {
    // For security, only allow certain configuration changes
    const allowedKeys = ['rate_limit', 'max_connections'];

    if (!allowedKeys.includes(args.key)) {
      return {
        success: false,
        error: `Configuration key '${args.key}' is not modifiable`,
      };
    }

    // This is a mock implementation - in a real system, you'd persist this
    return {
      success: true,
      message: `Configuration '${args.key}' would be set to '${args.value}'`,
      note: 'Configuration changes require server restart to take effect',
    };
  }

  // Utility methods
  generateApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async getActiveApiKeyCount() {
    try {
      const { count } = await this.supabase
        .from('api_keys')
        .select('id', { count: 'exact' })
        .eq('is_active', true);
      return count || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Initiating graceful shutdown...');

    try {
      if (this.httpServer) {
        this.httpServer.close();
        logger.info('HTTP server closed');
      }

      // Close SSE connections
      this.sseClients.forEach((client) => {
        try {
          client.end();
        } catch {
          //
        }
      });
      this.sseClients.clear();

      if (this.mcpServer) {
        await this.mcpServer.close?.();
        logger.info('MCP server closed');
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('Error during shutdown:', error);
      } else {
        logger.error('Error during shutdown: unknown error');
      }
      process.exit(1);
    }
  }
}

// Signal handlers
process.on('SIGTERM', async () => {
  const server = global.mcpServerInstance;
  if (server) await server.shutdown();
});

process.on('SIGINT', async () => {
  const server = global.mcpServerInstance;
  if (server) await server.shutdown();
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
async function main() {
  try {
    const server = new LanonasisUnifiedMCPServer();
    global.mcpServerInstance = server;

    // Check command line arguments for mode
    if (process.argv.includes('--http')) {
      logger.info('Starting in HTTP mode');
      server.config.enableStdio = false;
      await server.startUnifiedServer();
    } else if (process.argv.includes('--stdio')) {
      logger.info('Starting in stdio mode');
      server.config.enableHttp = false;
      server.config.enableWebSocket = false;
      server.config.enableSSE = false;
      await server.startUnifiedServer();
    } else {
      // Default: start all protocols
      await server.startUnifiedServer();
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error('Failed to start Lanonasis Unified MCP Server:', error);
    } else {
      logger.error('Failed to start Lanonasis Unified MCP Server: unknown error');
    }
    process.exit(1);
  }
}

// Only start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { LanonasisUnifiedMCPServer };

/*
Summary of Changes
------------------
1) Parameter Types (TS7006): Added explicit interfaces (e.g. CreateMemoryArgs, SearchMemoriesArgs, etc.) to accurately type function parameters instead of using 'any'. This ensures stronger type checking and avoids implicit 'any' issues.
2) Catch Blocks (TS18046): Changed catch blocks from single parameter to '(error: unknown)' and then used 'if (error instanceof Error)' checks to access the error's message property safely.
3) Indexing Objects (TS7053): Cast the config object to 'Record<string, unknown>' in getConfigTool when indexing with dynamic keys, preventing the implicit 'any' type. This resolved the "Element implicitly has an 'any' type" issue.
*/
