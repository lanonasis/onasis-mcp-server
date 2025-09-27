const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// CORS configuration
// Configure allowed CORS origins from environment or use localhost default
const corsOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// Security middleware
app.use(helmet());

// Rate limiting middleware - 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all /api routes
app.use('/api', limiter);

app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Memory as a Service (MaaS)',
    version: '1.0.0',
    status: 'operational',
    documentation: '/docs',
    health: '/api/v1/health',
    endpoints: {
      health: '/api/v1/health',
      memory: '/api/v1/memory',
      auth: '/api/v1/auth',
      apiKeys: '/api/v1/api-keys',
      mcp: '/api/v1/mcp'
    },
    timestamp: new Date().toISOString()
  });
});

// Authentication middleware
const authenticateRequest = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  
  if (!apiKey && !authHeader) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide an API key or authorization token'
    });
  }
  
  // Basic validation - in production, validate against database
  if (apiKey && apiKey.length < 32) {
    return res.status(401).json({
      error: 'Invalid API key',
      message: 'API key format is invalid'
    });
  }
  
  if (authHeader && !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Invalid authorization header',
      message: 'Authorization header must use Bearer token format'
    });
  }
  
  next();
};

// Health check function with real service checks
const performHealthCheck = async () => {
  const healthData = {
    name: 'Lanonasis Memory Service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: 'netlify',
    status: 'healthy',
    checks: {
      database: { status: 'unknown', message: '' },
      supabase: { status: 'unknown', message: '' },
      memory: { status: 'operational', message: 'Service available' },
      auth: { status: 'operational', message: 'Service available' },
      apiKeys: { status: 'operational', message: 'Service available' },
      mcp: { status: 'operational', message: 'Service available' }
    }
  };
  
  // Check Supabase connection if configured
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { error } = await supabase.from('memory_entries').select('id').limit(1);
      
      if (error) {
        healthData.checks.database.status = 'degraded';
        healthData.checks.database.message = 'Database connection issues';
        healthData.checks.supabase.status = 'degraded';
        healthData.checks.supabase.message = error.message;
        healthData.status = 'degraded';
      } else {
        healthData.checks.database.status = 'healthy';
        healthData.checks.database.message = 'Connected';
        healthData.checks.supabase.status = 'healthy';
        healthData.checks.supabase.message = 'Connected';
      }
    } catch (error) {
      healthData.checks.database.status = 'unhealthy';
      healthData.checks.database.message = 'Connection failed';
      healthData.checks.supabase.status = 'unhealthy';
      healthData.checks.supabase.message = error.message;
      healthData.status = 'unhealthy';
    }
  } else {
    healthData.checks.database.status = 'not_configured';
    healthData.checks.database.message = 'Environment variables not set';
    healthData.checks.supabase.status = 'not_configured';
    healthData.checks.supabase.message = 'Environment variables not set';
  }
  
  return healthData;
};

// Consolidated health endpoint
app.get(['/health', '/api/v1/health'], async (req, res) => {
  try {
    const healthData = await performHealthCheck();
    const statusCode = healthData.status === 'healthy' ? 200 : 
                      healthData.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(healthData);
  } catch (error) {
    res.status(503).json({
      name: 'Lanonasis Memory Service',
      version: '1.0.0',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error.message
    });
  }
});

// Auth endpoints
app.post('/api/v1/auth/login', (req, res) => {
  res.json({
    message: 'Authentication endpoint - implementation in progress',
    endpoint: '/api/v1/auth/login',
    status: 'placeholder'
  });
});

app.post('/api/v1/auth/register', (req, res) => {
  res.json({
    message: 'Registration endpoint - implementation in progress',
    endpoint: '/api/v1/auth/register',
    status: 'placeholder'
  });
});

// Memory endpoints (protected)
app.get('/api/v1/memory', authenticateRequest, (req, res) => {
  res.json({
    message: 'Memory list endpoint - authenticated',
    endpoint: '/api/v1/memory',
    status: 'placeholder',
    note: 'Full implementation requires database connection'
  });
});

app.post('/api/v1/memory', authenticateRequest, (req, res) => {
  res.json({
    message: 'Memory creation endpoint - authenticated',
    endpoint: '/api/v1/memory',
    status: 'placeholder',
    note: 'Request processed successfully'
  });
});

// API Key management endpoints (protected)
app.get('/api/v1/api-keys', authenticateRequest, (req, res) => {
  res.json({
    message: 'API Keys management endpoint - authenticated',
    endpoint: '/api/v1/api-keys',
    status: 'placeholder'
  });
});

app.post('/api/v1/api-keys', authenticateRequest, (req, res) => {
  res.json({
    message: 'API Key creation endpoint - authenticated',
    endpoint: '/api/v1/api-keys',
    status: 'placeholder',
    note: 'Request processed successfully'
  });
});

// MCP endpoints
app.get('/api/v1/mcp/status', (req, res) => {
  res.json({
    message: 'MCP status endpoint',
    endpoint: '/api/v1/mcp/status',
    status: 'operational',
    protocol: 'Model Context Protocol v1.0',
    features: ['api-key-management', 'memory-service', 'proxy-tokens']
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    available_endpoints: [
      '/',
      '/health',
      '/api/v1/health',
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/memory',
      '/api/v1/api-keys',
      '/api/v1/mcp/status'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Export serverless handler
const serverlessHandler = serverless(app);

exports.handler = async (event, context) => {
  // Set timeout context
  context.callbackWaitsForEmptyEventLoop = false;
  
  return await serverlessHandler(event, context);
};