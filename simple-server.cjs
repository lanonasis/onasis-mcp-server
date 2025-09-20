#!/usr/bin/env node

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 18 tools including the new API docs tool
const tools = [
  // Memory Management Tools (6 tools)
  { name: 'create_memory', description: 'Create a new memory entry' },
  { name: 'search_memories', description: 'Search through stored memories' },
  { name: 'get_memory', description: 'Retrieve a specific memory by ID' },
  { name: 'update_memory', description: 'Update an existing memory' },
  { name: 'delete_memory', description: 'Delete a memory by ID' },
  { name: 'list_memories', description: 'List all memories with pagination' },
  
  // API Key Management Tools (4 tools)
  { name: 'create_api_key', description: 'Create a new API key' },
  { name: 'list_api_keys', description: 'List all API keys' },
  { name: 'rotate_api_key', description: 'Rotate an existing API key' },
  { name: 'delete_api_key', description: 'Delete an API key' },
  
  // System & Organization Tools (8 tools including new API docs)
  { name: 'get_health_status', description: 'Get server health status' },
  { name: 'get_organization_info', description: 'Get organization information' },
  { name: 'create_project', description: 'Create a new project' },
  { name: 'list_projects', description: 'List all projects' },
  { name: 'get_config_tool', description: 'Get configuration settings' },
  { name: 'set_config_tool', description: 'Set configuration settings' },
  { name: 'system_diagnostics', description: 'Run system diagnostics' },
  { name: 'get_api_docs', description: 'Get API documentation and redirect to docs.lanonasis.com' }
];

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Lanonasis MCP Server (Simple)',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0-simple',
    environment: 'development',
    tools_count: tools.length
  });
});

// Tools endpoint
app.get('/api/tools', (req, res) => {
  res.json({
    tools,
    total: tools.length,
    timestamp: new Date().toISOString()
  });
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

// Execute tool endpoint
app.post('/api/execute/:tool', (req, res) => {
  const { tool } = req.params;
  const { parameters = {} } = req.body;
  
  const toolExists = tools.find(t => t.name === tool);
  if (!toolExists) {
    return res.status(404).json({
      error: 'Tool not found',
      available_tools: tools.map(t => t.name)
    });
  }

  // Mock execution results
  const mockResults = {
    get_api_docs: {
      docs_url: 'https://docs.lanonasis.com',
      api_reference: 'https://docs.lanonasis.com/api',
      mcp_integration: 'https://docs.lanonasis.com/api/mcp-integration',
      description: 'Complete API documentation and integration guides',
      redirect_message: 'Visit docs.lanonasis.com for complete documentation'
    }
  };

  const result = mockResults[tool] || { 
    status: 'executed', 
    tool, 
    parameters,
    message: `Mock execution of ${tool}` 
  };

  res.json({
    tool,
    parameters,
    result,
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Lanonasis MCP Server (Simple)',
    version: '1.0.0-simple',
    description: 'Simple working version with 18 tools including API docs',
    tools_count: tools.length,
    endpoints: {
      health: '/health',
      tools: '/api/tools',
      execute: '/api/execute/:tool',
      docs: '/api/docs'
    },
    timestamp: new Date().toISOString()
  });
});

const port = process.env.PORT || 3001;
const host = process.env.HOST || 'localhost';

app.listen(port, host, () => {
  console.log(`🚀 Simple MCP Server running on http://${host}:${port}`);
  console.log(`📊 Health check: http://${host}:${port}/health`);
  console.log(`🔧 API tools: http://${host}:${port}/api/tools`);
  console.log(`📚 API docs: http://${host}:${port}/api/docs`);
  console.log(`✅ ${tools.length} tools available`);
});
