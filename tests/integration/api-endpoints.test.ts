/**
 * Integration tests for HTTP API endpoints
 */

import request from 'supertest';
import express from 'express';
import { createServer } from 'http';
import { AddressInfo } from 'net';

// We'll test against the actual server instance
let server: any;
let app: express.Application;
let baseURL: string;

describe('HTTP API Integration', () => {
  beforeAll(async () => {
    // Import and start the actual server
    const { createExpressApp } = await import('../../src/unified-mcp-server');
    
    app = await createExpressApp({
      protocol: 'http',
      port: 0, // Use random available port
      environment: 'test',
    });

    server = createServer(app);
    
    return new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseURL = `http://localhost:${address.port}`;
        resolve();
      });
    });
  }, 30000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('Health Endpoints', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'Lanonasis MCP Server',
      });
    });

    it('should return detailed status', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'operational',
        service: 'Lanonasis MCP Server',
        uptime: expect.any(Number),
        memory: expect.any(Object),
      });
    });

    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/ready')
        .expect(200);

      expect(response.body).toMatchObject({
        ready: true,
        service: 'Lanonasis MCP Server',
        checks: expect.any(Object),
      });
    });
  });

  describe('API Documentation', () => {
    it('should serve Swagger documentation', async () => {
      const response = await request(app)
        .get('/api-docs/')
        .expect(200);

      expect(response.text).toContain('swagger');
      expect(response.text).toContain('Lanonasis MCP Server API');
    });

    it('should provide OpenAPI specification', async () => {
      const response = await request(app)
        .get('/api-docs.json')
        .expect(200);

      expect(response.body).toMatchObject({
        openapi: expect.any(String),
        info: expect.objectContaining({
          title: 'Lanonasis MCP Server API',
        }),
      });
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Helmet.js security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    it('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'https://app.lanonasis.com')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to API endpoints', async () => {
      const promises = [];
      
      // Make many rapid requests to trigger rate limiting
      for (let i = 0; i < 50; i++) {
        promises.push(
          request(app)
            .get('/api/v1/memories')
            .set('Authorization', 'Bearer invalid-key')
        );
      }

      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited
      const rateLimited = responses.some(res => res.status === 429);
      expect(rateLimited).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/nonexistent-endpoint')
        .expect(404);

      expect(response.body).toMatchObject({
        error: expect.stringContaining('Not Found'),
      });
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/memories')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.error).toContain('Invalid JSON');
    });

    it('should return proper error format', async () => {
      const response = await request(app)
        .post('/api/v1/memories')
        .send({ title: '', content: '' }) // Invalid data
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.any(String),
        details: expect.any(Object),
      });
    });
  });

  describe('Authentication Integration', () => {
    it('should reject requests without API key', async () => {
      const response = await request(app)
        .get('/api/v1/memories')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized - API key required',
      });
    });

    it('should accept valid API key format', async () => {
      // This will still fail auth because it's not a real key,
      // but should pass format validation
      const response = await request(app)
        .get('/api/v1/memories')
        .set('Authorization', 'Bearer sk_test_' + 'a'.repeat(64))
        .expect(401); // Should get to auth check, not format error

      expect(response.body.error).not.toContain('format');
    });
  });

  describe('Server-Sent Events', () => {
    it('should serve SSE endpoint', async () => {
      const response = await request(app)
        .get('/mcp/sse')
        .set('Accept', 'text/event-stream')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
    });
  });

  describe('Performance', () => {
    it('should respond to health check quickly', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/health')
        .expect(200);
        
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should respond within 100ms
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(10).fill(null).map(() => 
        request(app).get('/health').expect(200)
      );

      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.body.status).toBe('healthy');
      });
    });
  });
});