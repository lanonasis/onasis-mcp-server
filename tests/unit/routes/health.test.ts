/**
 * Unit tests for health routes
 */

import request from 'supertest';
import express from 'express';
import healthRouter from '../../../src/routes/health';

describe('Health Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', healthRouter);
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        service: 'Lanonasis MCP Server',
        timestamp: expect.any(String),
        version: expect.any(String),
        uptime: expect.any(Number),
        dependencies: {
          database: { status: 'healthy', response_time: 1 },
          openai: { status: 'healthy', response_time: 1 },
        },
      });

      // Validate timestamp is recent (within last minute)
      const timestamp = new Date(response.body.timestamp);
      const now = new Date();
      const diffMs = now.getTime() - timestamp.getTime();
      expect(diffMs).toBeLessThan(60000); // Less than 1 minute
    });

    it('should return consistent structure on multiple calls', async () => {
      const response1 = await request(app).get('/health').expect(200);
      const response2 = await request(app).get('/health').expect(200);

      expect(response1.body.status).toBe('healthy');
      expect(response2.body.status).toBe('healthy');
      expect(response1.body.service).toBe(response2.body.service);
      expect(response1.body.version).toBe(response2.body.version);
    });
  });

  describe('GET /status', () => {
    it('should return detailed status information', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      expect(response.body).toEqual({
        status: 'operational',
        service: 'Lanonasis MCP Server',
        version: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        memory: expect.objectContaining({
          used: expect.any(Number),
          total: expect.any(Number),
          percentage: expect.any(Number),
        }),
        environment: process.env.NODE_ENV || 'development',
      });

      // Validate memory percentages
      expect(response.body.memory.percentage).toBeGreaterThan(0);
      expect(response.body.memory.percentage).toBeLessThan(100);
      expect(response.body.memory.used).toBeGreaterThan(0);
      expect(response.body.memory.total).toBeGreaterThan(response.body.memory.used);
    });

    it('should show increasing uptime on subsequent calls', async () => {
      const response1 = await request(app).get('/status').expect(200);
      
      // Wait a small amount
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const response2 = await request(app).get('/status').expect(200);

      expect(response2.body.uptime).toBeGreaterThanOrEqual(response1.body.uptime);
    });
  });

  describe('GET /ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/ready')
        .expect(200);

      expect(response.body).toEqual({
        ready: true,
        service: 'Lanonasis MCP Server',
        checks: expect.objectContaining({
          database: expect.any(String),
          memory_service: expect.any(String),
          mcp_server: expect.any(String),
        }),
        timestamp: expect.any(String),
      });
    });
  });
});