#!/usr/bin/env node

/**
 * CLI-Aligned MCP Server
 * Integrates with @lanonasis/cli v1.5.2+ authentication and SDK patterns
 * Routes through Core authenticated endpoints for security compliance
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError 
} from '@modelcontextprotocol/sdk/types.js';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import { cliAuthConfig } from './config/cli-auth.js';
import { CLIAuthMiddleware, AuthenticatedRequest } from './middleware/cli-auth-middleware.js';

interface MemorySearchParams {
  query: string;
  limit?: number;
  type?: string;
  similarity_threshold?: number;
}

interface MemoryCreateParams {
  content: string;
  title?: string;
  type?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * CLI-Aligned MCP Server Class
 * Implements the same patterns as @lanonasis/cli for consistent behavior
 */
export class CLIAlignedMCPServer {
  private server: Server;
  private httpApp?: express.Application;

  constructor() {
    this.server = new Server({
      name: 'lanonasis-mcp-server',
      version: '1.0.0',
      capabilities: {
        tools: {},
      },
    });

    this.setupTools();
    this.setupErrorHandling();
  }

  /**
   * Setup MCP tools with CLI authentication integration
   */
  private setupTools(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Memory Management Tools (CLI-aligned)
          {
            name: 'search_memories',
            description: 'Search memories using semantic vector search through CLI-authenticated endpoints',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                limit: { type: 'number', description: 'Maximum results (1-50)', minimum: 1, maximum: 50 },
                type: { type: 'string', description: 'Memory type filter' },
                similarity_threshold: { type: 'number', description: 'Similarity threshold (0-1)', minimum: 0, maximum: 1 }
              },
              required: ['query']
            }
          },
          {
            name: 'create_memory',
            description: 'Create a new memory through CLI-authenticated endpoints',
            inputSchema: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'Memory content' },
                title: { type: 'string', description: 'Memory title' },
                type: { type: 'string', description: 'Memory type' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Memory tags' },
                metadata: { type: 'object', description: 'Additional metadata' }
              },
              required: ['content']
            }
          },
          {
            name: 'get_memory',
            description: 'Retrieve a specific memory by ID through CLI-authenticated endpoints',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Memory ID' }
              },
              required: ['id']
            }
          },
          {
            name: 'update_memory',
            description: 'Update an existing memory through CLI-authenticated endpoints',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Memory ID' },
                content: { type: 'string', description: 'Updated content' },
                title: { type: 'string', description: 'Updated title' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Updated tags' },
                metadata: { type: 'object', description: 'Updated metadata' }
              },
              required: ['id']
            }
          },
          {
            name: 'delete_memory',
            description: 'Delete a memory by ID through CLI-authenticated endpoints',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Memory ID to delete' }
              },
              required: ['id']
            }
          },
          {
            name: 'list_memories',
            description: 'List memories with pagination through CLI-authenticated endpoints',
            inputSchema: {
              type: 'object',
              properties: {
                page: { type: 'number', description: 'Page number', minimum: 1 },
                limit: { type: 'number', description: 'Items per page (1-50)', minimum: 1, maximum: 50 },
                type: { type: 'string', description: 'Memory type filter' },
                sort: { type: 'string', description: 'Sort field', enum: ['created_at', 'updated_at', 'title'] },
                order: { type: 'string', description: 'Sort order', enum: ['asc', 'desc'] }
              }
            }
          },
          // Authentication & Status Tools
          {
            name: 'get_auth_status',
            description: 'Get current authentication status and configuration',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'get_organization_info',
            description: 'Get organization information and limits',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          // Health & System Tools
          {
            name: 'get_health_status',
            description: 'Get system health status',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Create mock request for authentication context
      const mockReq: Partial<AuthenticatedRequest> = {
        headers: {},
        organizationId: cliAuthConfig.getOrganizationId(),
        vendorKey: cliAuthConfig.getVendorKey()
      };

      // Add user info if available
      const user = await cliAuthConfig.getCurrentUser();
      if (user) {
        mockReq.user = {
          id: user.organization_id,
          userId: user.organization_id,
          email: user.email,
          organizationId: user.organization_id,
          role: user.role,
          plan: user.plan
        };
      }

      try {
        switch (name) {
          case 'search_memories':
            return await this.handleSearchMemories(mockReq as AuthenticatedRequest, args as unknown as MemorySearchParams);
          
          case 'create_memory':
            return await this.handleCreateMemory(mockReq as AuthenticatedRequest, args as unknown as MemoryCreateParams);
          
          case 'get_memory':
            return await this.handleGetMemory(mockReq as AuthenticatedRequest, args as { id: string });
          
          case 'update_memory':
            return await this.handleUpdateMemory(mockReq as AuthenticatedRequest, args);
          
          case 'delete_memory':
            return await this.handleDeleteMemory(mockReq as AuthenticatedRequest, args as { id: string });
          
          case 'list_memories':
            return await this.handleListMemories(mockReq as AuthenticatedRequest, args);
          
          case 'get_auth_status':
            return await this.handleGetAuthStatus();
          
          case 'get_organization_info':
            return await this.handleGetOrganizationInfo(mockReq as AuthenticatedRequest);
          
          case 'get_health_status':
            return await this.handleGetHealthStatus();
          
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${(error as Error).message}`);
      }
    });
  }

  // Tool Handlers (using CLI authentication patterns)

  private async handleSearchMemories(req: AuthenticatedRequest, params: MemorySearchParams) {
    const result = await CLIAuthMiddleware.proxyMemoryOperation(req, 'search', params);
    
    return {
      content: [{
        type: 'text',
        text: `Found ${result.memories?.length || 0} memories matching "${params.query}"\n\n` +
              (result.memories || []).map((memory: any, index: number) => 
                `${index + 1}. ${memory.title || 'Untitled'}\n` +
                `   ID: ${memory.id}\n` +
                `   Type: ${memory.type || 'N/A'}\n` +
                `   Score: ${memory.similarity_score?.toFixed(3) || 'N/A'}\n` +
                `   Created: ${new Date(memory.created_at).toLocaleDateString()}\n` +
                `   Preview: ${memory.content.substring(0, 200)}${memory.content.length > 200 ? '...' : ''}\n`
              ).join('\n')
      }]
    };
  }

  private async handleCreateMemory(req: AuthenticatedRequest, params: MemoryCreateParams) {
    const result = await CLIAuthMiddleware.proxyMemoryOperation(req, 'create', params);
    
    return {
      content: [{
        type: 'text',
        text: `✅ Memory created successfully!\n\n` +
              `ID: ${result.id}\n` +
              `Title: ${result.title || 'Untitled'}\n` +
              `Type: ${result.type || 'N/A'}\n` +
              `Content Length: ${result.content?.length || 0} characters\n` +
              `Created: ${new Date(result.created_at).toLocaleString()}`
      }]
    };
  }

  private async handleGetMemory(req: AuthenticatedRequest, params: { id: string }) {
    const result = await CLIAuthMiddleware.proxyMemoryOperation(req, 'get', params);
    
    return {
      content: [{
        type: 'text',
        text: `📄 Memory Details\n\n` +
              `ID: ${result.id}\n` +
              `Title: ${result.title || 'Untitled'}\n` +
              `Type: ${result.type || 'N/A'}\n` +
              `Tags: ${result.tags?.join(', ') || 'None'}\n` +
              `Created: ${new Date(result.created_at).toLocaleString()}\n` +
              `Updated: ${new Date(result.updated_at).toLocaleString()}\n\n` +
              `Content:\n${result.content}`
      }]
    };
  }

  private async handleUpdateMemory(req: AuthenticatedRequest, params: any) {
    const result = await CLIAuthMiddleware.proxyMemoryOperation(req, 'update', params);
    
    return {
      content: [{
        type: 'text',
        text: `✅ Memory updated successfully!\n\n` +
              `ID: ${result.id}\n` +
              `Title: ${result.title || 'Untitled'}\n` +
              `Updated: ${new Date(result.updated_at).toLocaleString()}`
      }]
    };
  }

  private async handleDeleteMemory(req: AuthenticatedRequest, params: { id: string }) {
    await CLIAuthMiddleware.proxyMemoryOperation(req, 'delete', params);
    
    return {
      content: [{
        type: 'text',
        text: `✅ Memory deleted successfully!\n\nID: ${params.id}`
      }]
    };
  }

  private async handleListMemories(req: AuthenticatedRequest, params: any) {
    const result = await CLIAuthMiddleware.proxyMemoryOperation(req, 'list', params);
    
    return {
      content: [{
        type: 'text',
        text: `📋 Memory List (Page ${params.page || 1})\n\n` +
              `Total: ${result.total || 0}\n` +
              `Showing: ${result.memories?.length || 0} items\n\n` +
              (result.memories || []).map((memory: any, index: number) => 
                `${index + 1}. ${memory.title || 'Untitled'}\n` +
                `   ID: ${memory.id}\n` +
                `   Type: ${memory.type || 'N/A'}\n` +
                `   Created: ${new Date(memory.created_at).toLocaleDateString()}\n`
              ).join('\n')
      }]
    };
  }

  private async handleGetAuthStatus() {
    await cliAuthConfig.init();
    
    const hasVendorKey = cliAuthConfig.hasVendorKey();
    const isAuthenticated = await cliAuthConfig.isAuthenticated();
    const authMethod = cliAuthConfig.getAuthMethod();
    const user = await cliAuthConfig.getCurrentUser();
    
    return {
      content: [{
        type: 'text',
        text: `🔐 Authentication Status\n\n` +
              `Method: ${authMethod}\n` +
              `Vendor Key: ${hasVendorKey ? '✅ Available' : '❌ Not configured'}\n` +
              `JWT Token: ${isAuthenticated ? '✅ Valid' : '❌ Invalid/Missing'}\n` +
              `API URL: ${cliAuthConfig.getApiUrl()}\n\n` +
              (user ? 
                `User Info:\n` +
                `  Email: ${user.email}\n` +
                `  Organization: ${user.organization_id}\n` +
                `  Role: ${user.role}\n` +
                `  Plan: ${user.plan}\n` : 
                `No user information available\n`)
      }]
    };
  }

  private async handleGetOrganizationInfo(req: AuthenticatedRequest) {
    const organizationId = cliAuthConfig.getOrganizationId();
    
    return {
      content: [{
        type: 'text',
        text: `🏢 Organization Information\n\n` +
              `Organization ID: ${organizationId || 'Not available'}\n` +
              `Authentication: ${req.vendorKey ? 'Vendor Key' : req.user ? 'JWT Token' : 'None'}\n` +
              `Status: ${organizationId ? '✅ Active' : '❌ Not configured'}\n`
      }]
    };
  }

  private async handleGetHealthStatus() {
    await cliAuthConfig.init();
    
    const isConfigured = cliAuthConfig.isConfigured();
    const apiUrl = cliAuthConfig.getApiUrl();
    
    return {
      content: [{
        type: 'text',
        text: `💚 MCP Server Health Status\n\n` +
              `Server: ✅ Running\n` +
              `CLI Config: ${isConfigured ? '✅ Configured' : '⚠️  Not configured'}\n` +
              `API Endpoint: ${apiUrl}\n` +
              `SDK Version: 1.17.0 (CLI-aligned)\n` +
              `Auth Methods: Vendor Key, JWT\n` +
              `Tools Available: 9\n`
      }]
    };
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Server Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Start stdio MCP server
   */
  async startStdio(): Promise<void> {
    console.error('🚀 Starting CLI-Aligned MCP Server (stdio)...');
    
    await cliAuthConfig.init();
    await cliAuthConfig.discoverServices();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('✅ MCP Server ready for CLI integration');
  }

  /**
   * Start HTTP server for testing and debugging
   */
  async startHttp(port: number = 3001): Promise<void> {
    console.log(`🚀 Starting CLI-Aligned MCP Server (HTTP) on port ${port}...`);
    
    await cliAuthConfig.init();
    await cliAuthConfig.discoverServices();
    
    this.httpApp = express();
    
    // Security middleware
    this.httpApp.use(helmet());
    this.httpApp.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || ['https://lanonasis.com', 'https://api.lanonasis.com'],
      credentials: true
    }));
    this.httpApp.use(compression());
    this.httpApp.use(express.json({ limit: '10mb' }));
    
    // Rate limiting
    this.httpApp.use(CLIAuthMiddleware.createRateLimit());
    
    // Health endpoint (no auth required)
    this.httpApp.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'lanonasis-mcp-server-cli-aligned',
        version: '1.0.0',
        sdkVersion: '1.17.0',
        cliCompatible: true,
        timestamp: new Date().toISOString()
      });
    });
    
    // Protected MCP operations
    this.httpApp.use('/mcp', CLIAuthMiddleware.authenticate as express.RequestHandler);
    this.httpApp.use('/mcp', CLIAuthMiddleware.enforceOrganizationIsolation as express.RequestHandler);
    
    // MCP tool endpoints
    this.httpApp.post('/mcp/tools', async (req: express.Request, res: express.Response) => {
      try {
        const { tool, arguments: args } = req.body;

        // Mock call tool request
        const mockRequest = {
          params: {
            name: tool,
            arguments: args
          }
        };

        // Handle through existing tool handler
        const result = await this.server.request(
          { method: 'tools/call', params: mockRequest.params },
          CallToolRequestSchema
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: 'Tool execution failed',
          message: (error as Error).message
        });
      }
    });
    
    this.httpApp.listen(port, () => {
      console.log(`✅ CLI-Aligned MCP Server HTTP ready on port ${port}`);
    });
  }
}

// Main execution
async function main() {
  const server = new CLIAlignedMCPServer();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--http')) {
    const port = parseInt(process.env.PORT || '3001');
    await server.startHttp(port);
  } else {
    // Default to stdio for MCP protocol
    await server.startStdio();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}