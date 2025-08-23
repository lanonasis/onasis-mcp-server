#!/usr/bin/env node

/**
 * Simple CommonJS fallback server for deployment
 * Used when TypeScript build fails but we need basic functionality
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const app = express();

// Basic middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Health endpoint (critical for deployment verification)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Lanonasis MCP Server (Fallback)',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0-fallback',
    message: 'Running in fallback mode due to build issues'
  });
});

// Basic info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Lanonasis MCP Server',
    status: 'fallback',
    message: 'Server running in fallback mode. Main TypeScript build failed.',
    health: '/health',
    timestamp: new Date().toISOString()
  });
});

// Catch all other routes
app.get('*', (req, res) => {
  res.status(503).json({
    error: 'Service Temporarily Unavailable',
    message: 'Server running in fallback mode. Full MCP functionality unavailable.',
    retry_after: '300'
  });
});

const port = process.env.PORT || 3001;
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
  console.log(`🚀 Fallback MCP Server running on ${host}:${port}`);
  console.log(`📊 Health check: http://${host}:${port}/health`);
  console.log(`⚠️  Running in fallback mode - limited functionality`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 SIGINT received, shutting down gracefully');
  process.exit(0);
});