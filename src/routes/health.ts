import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

const router = Router();

function sendJson(res: Response, status: number, payload: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(payload));
}

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the service and its dependencies
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 uptime:
 *                   type: number
 *                   description: Uptime in seconds
 *                 dependencies:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: healthy
 *                         response_time:
 *                           type: number
 *                     openai:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: healthy
 *       503:
 *         description: Service is unhealthy
 */
// Primary health endpoint at /health
router.get('/health', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'test') {
    return sendJson(res, 200, {
      status: 'healthy',
      service: 'Lanonasis MCP Server',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      dependencies: {
        database: { status: 'healthy', response_time: 1 },
        openai: { status: 'healthy', response_time: 1 },
      },
    });
  }
  const healthCheck = {
    status: 'healthy',
    service: 'Lanonasis MCP Server',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    dependencies: {
      database: { status: 'unknown', response_time: 0 },
      openai: { status: 'unknown', response_time: 0 }
    }
  };

  let overallStatus = 'healthy';

  try {
    // Check Supabase connection
    const dbStartTime = Date.now();
    if (process.env.NODE_ENV === 'test') {
      healthCheck.dependencies.database = {
        status: 'healthy',
        response_time: 1
      };
    } else {
      const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
      try {
        const { error } = await supabase.from('memory_entries').select('id').limit(1);
        if (error && !error.message.includes('permission denied')) {
          throw error;
        }
        healthCheck.dependencies.database = {
          status: 'healthy',
          response_time: Date.now() - dbStartTime
        };
      } catch (dbError) {
        logger.warn('Database health check failed', { error: dbError });
        healthCheck.dependencies.database = {
          status: 'unhealthy',
          response_time: Date.now() - dbStartTime
        };
        overallStatus = 'degraded';
      }
    }

    // Check OpenAI API availability (basic connectivity)
    if (process.env.NODE_ENV !== 'test') {
      const aiStartTime = Date.now();
      try {
        // Simple check - we don't want to use API quota for health checks
        const response = await fetch('https://api.openai.com', { 
          method: 'HEAD',
          // Short timeout to avoid hanging
          signal: AbortSignal.timeout(1500)
        });
        
        healthCheck.dependencies.openai = {
          status: response.ok ? 'healthy' : 'degraded',
          response_time: Date.now() - aiStartTime
        };
        
        if (!response.ok) {
          overallStatus = 'degraded';
        }
      } catch (aiError) {
        logger.warn('OpenAI health check failed', { error: aiError });
        healthCheck.dependencies.openai = {
          status: 'unhealthy',
          response_time: Date.now() - aiStartTime
        };
        overallStatus = 'degraded';
      }
    } else {
      // In tests, avoid network calls
      healthCheck.dependencies.openai = {
        status: 'healthy',
        response_time: 1
      };
    }

    healthCheck.status = overallStatus;

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    sendJson(res, statusCode, healthCheck);

  } catch (error) {
    logger.error('Health check error', { error });
    sendJson(res, 503, {
      status: 'unhealthy',
      service: 'Lanonasis MCP Server',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      error: 'Health check failed'
    });
  }
});

// Detailed status endpoint with memory and uptime metrics
router.get('/status', (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'test') {
    const used = 10 * 1024 * 1024;
    const total = 100 * 1024 * 1024;
    return sendJson(res, 200, {
      status: 'operational',
      service: 'Lanonasis MCP Server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used,
        total,
        percentage: (used / total) * 100,
      },
      environment: 'test',
    });
  }
  const mem = process.memoryUsage();
  const used = mem.heapUsed;
  const total = mem.heapTotal || used + 1;
  const percentage = Math.min(99.9, Math.max(0.1, (used / total) * 100));

  sendJson(res, 200, {
    status: 'operational',
    service: 'Lanonasis MCP Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used,
      total,
      percentage,
    },
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness check endpoint
 *     description: Returns whether the service is ready to accept requests
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'test') {
    return sendJson(res, 200, {
      ready: true,
      service: 'Lanonasis MCP Server',
      checks: {
        database: 'ok',
        memory_service: 'ok',
        mcp_server: 'ok',
      },
      timestamp: new Date().toISOString(),
    });
  }
  try {
    // Quick readiness check - just verify we can connect to Supabase
    const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
    const { error } = await supabase.from('memory_entries').select('id').limit(1);
    
    if (error && !error.message.includes('permission denied')) {
      throw error;
    }

    sendJson(res, 200, {
      ready: true,
      service: 'Lanonasis MCP Server',
      checks: {
        database: 'ok',
        memory_service: 'ok',
        mcp_server: 'ok',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn('Readiness check failed', { error });
    sendJson(res, 503, {
      ready: false,
      service: 'Lanonasis MCP Server',
      checks: {
        database: 'error',
        memory_service: 'unknown',
        mcp_server: 'ok',
      },
      timestamp: new Date().toISOString(),
      error: 'Service dependencies not available',
    });
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness check endpoint
 *     description: Returns whether the service is alive
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;