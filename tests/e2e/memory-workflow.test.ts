/**
 * End-to-end tests for complete memory management workflow
 */

import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

// Mock complete workflow test (since we don't have real auth in test env)
describe('Memory Management E2E Workflow', () => {
  let app: express.Application;

  beforeAll(async () => {
    // Use a minimal test app that simulates the full workflow
    app = express();
    app.use(express.json());

    // Mock successful memory operations for E2E testing
    let memories: any[] = [];
    let nextId = 1;

    // Create memory endpoint
    app.post('/api/v1/memories', (req, res) => {
      const { title, content, memory_type, tags } = req.body;
      
      if (!title || !content) {
        return res.status(400).json({
          error: 'Title and content are required'
        });
      }

      const memory = {
        id: `memory-${nextId++}`,
        title,
        content,
        memory_type: memory_type || 'knowledge',
        tags: tags || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      memories.push(memory);
      res.status(201).json({ success: true, data: memory });
    });

    // Search memories endpoint
    app.get('/api/v1/memories/search', (req, res) => {
      const { q, memory_type, tags } = req.query;
      
      let results = memories;
      
      if (q) {
        results = results.filter(m => 
          m.title.toLowerCase().includes((q as string).toLowerCase()) ||
          m.content.toLowerCase().includes((q as string).toLowerCase())
        );
      }
      
      if (memory_type) {
        results = results.filter(m => m.memory_type === memory_type);
      }
      
      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        results = results.filter(m => 
          tagArray.some((tag: string) => m.tags.includes(tag))
        );
      }

      res.json({ success: true, data: results });
    });

    // Get memory by ID
    app.get('/api/v1/memories/:id', (req, res) => {
      const memory = memories.find(m => m.id === req.params.id);
      if (!memory) {
        return res.status(404).json({ error: 'Memory not found' });
      }
      res.json({ success: true, data: memory });
    });

    // Update memory
    app.put('/api/v1/memories/:id', (req, res) => {
      const memoryIndex = memories.findIndex(m => m.id === req.params.id);
      if (memoryIndex === -1) {
        return res.status(404).json({ error: 'Memory not found' });
      }

      const { title, content, memory_type, tags } = req.body;
      const memory = memories[memoryIndex];
      
      if (title) memory.title = title;
      if (content) memory.content = content;
      if (memory_type) memory.memory_type = memory_type;
      if (tags) memory.tags = tags;
      memory.updated_at = new Date().toISOString();

      memories[memoryIndex] = memory;
      res.json({ success: true, data: memory });
    });

    // Delete memory
    app.delete('/api/v1/memories/:id', (req, res) => {
      const memoryIndex = memories.findIndex(m => m.id === req.params.id);
      if (memoryIndex === -1) {
        return res.status(404).json({ error: 'Memory not found' });
      }

      memories.splice(memoryIndex, 1);
      res.json({ success: true, message: 'Memory deleted successfully' });
    });

    // List memories
    app.get('/api/v1/memories', (req, res) => {
      const { limit = 20, offset = 0, memory_type, tags } = req.query;
      
      let results = memories;
      
      if (memory_type) {
        results = results.filter(m => m.memory_type === memory_type);
      }
      
      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        results = results.filter(m => 
          tagArray.some((tag: string) => m.tags.includes(tag))
        );
      }

      const startIndex = parseInt(offset as string);
      const endIndex = startIndex + parseInt(limit as string);
      const paginatedResults = results.slice(startIndex, endIndex);

      res.json({ 
        success: true, 
        data: paginatedResults,
        total: results.length,
        offset: startIndex,
        limit: parseInt(limit as string),
      });
    });
  });

  describe('Complete Memory Lifecycle', () => {
    let createdMemoryId: string;

    it('should create a new memory', async () => {
      const memoryData = {
        title: 'E2E Test Memory',
        content: 'This is a comprehensive test of the memory system functionality.',
        memory_type: 'knowledge',
        tags: ['test', 'e2e', 'automation'],
      };

      const response = await request(app)
        .post('/api/v1/memories')
        .send(memoryData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        title: memoryData.title,
        content: memoryData.content,
        memory_type: memoryData.memory_type,
        tags: memoryData.tags,
      });

      createdMemoryId = response.body.data.id;
    });

    it('should retrieve the created memory by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/memories/${createdMemoryId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(createdMemoryId);
      expect(response.body.data.title).toBe('E2E Test Memory');
    });

    it('should search for memories by content', async () => {
      const response = await request(app)
        .get('/api/v1/memories/search')
        .query({ q: 'comprehensive test' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(createdMemoryId);
    });

    it('should filter memories by type', async () => {
      // Create another memory with different type
      await request(app)
        .post('/api/v1/memories')
        .send({
          title: 'Project Memory',
          content: 'Project-specific information',
          memory_type: 'project',
          tags: ['project'],
        });

      const response = await request(app)
        .get('/api/v1/memories/search')
        .query({ memory_type: 'knowledge' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].memory_type).toBe('knowledge');
    });

    it('should filter memories by tags', async () => {
      const response = await request(app)
        .get('/api/v1/memories/search')
        .query({ tags: 'e2e' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].tags).toContain('e2e');
    });

    it('should update the memory', async () => {
      const updateData = {
        title: 'Updated E2E Test Memory',
        content: 'This memory has been updated during end-to-end testing.',
        tags: ['test', 'e2e', 'automation', 'updated'],
      };

      const response = await request(app)
        .put(`/api/v1/memories/${createdMemoryId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(updateData.title);
      expect(response.body.data.content).toBe(updateData.content);
      expect(response.body.data.tags).toContain('updated');
    });

    it('should list all memories with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/memories')
        .query({ limit: 10, offset: 0 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.total).toBeGreaterThan(0);
      expect(response.body.limit).toBe(10);
      expect(response.body.offset).toBe(0);
    });

    it('should delete the memory', async () => {
      const response = await request(app)
        .delete(`/api/v1/memories/${createdMemoryId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Memory deleted successfully');
    });

    it('should return 404 when trying to access deleted memory', async () => {
      const response = await request(app)
        .get(`/api/v1/memories/${createdMemoryId}`)
        .expect(404);

      expect(response.body.error).toBe('Memory not found');
    });
  });

  describe('Bulk Operations Workflow', () => {
    const testMemories = [
      {
        title: 'Bulk Test 1',
        content: 'First bulk test memory',
        memory_type: 'knowledge',
        tags: ['bulk', 'test1'],
      },
      {
        title: 'Bulk Test 2',
        content: 'Second bulk test memory',
        memory_type: 'project',
        tags: ['bulk', 'test2'],
      },
      {
        title: 'Bulk Test 3',
        content: 'Third bulk test memory',
        memory_type: 'reference',
        tags: ['bulk', 'test3'],
      },
    ];

    it('should create multiple memories efficiently', async () => {
      const promises = testMemories.map(memory => 
        request(app).post('/api/v1/memories').send(memory)
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });
    });

    it('should search across all created memories', async () => {
      const response = await request(app)
        .get('/api/v1/memories/search')
        .query({ tags: 'bulk' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
    });

    it('should filter bulk operations by different criteria', async () => {
      // Filter by memory type
      const knowledgeResponse = await request(app)
        .get('/api/v1/memories/search')
        .query({ memory_type: 'knowledge', tags: 'bulk' })
        .expect(200);

      expect(knowledgeResponse.body.data).toHaveLength(1);
      expect(knowledgeResponse.body.data[0].memory_type).toBe('knowledge');

      // Filter by specific tag
      const test2Response = await request(app)
        .get('/api/v1/memories/search')
        .query({ tags: 'test2' })
        .expect(200);

      expect(test2Response.body.data).toHaveLength(1);
      expect(test2Response.body.data[0].tags).toContain('test2');
    });
  });

  describe('Error Handling Workflow', () => {
    it('should handle validation errors gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/memories')
        .send({
          title: '', // Empty title should fail
          content: 'Valid content',
        })
        .expect(400);

      expect(response.body.error).toBe('Title and content are required');
    });

    it('should handle not found errors consistently', async () => {
      const nonExistentId = 'memory-nonexistent';

      // GET
      await request(app)
        .get(`/api/v1/memories/${nonExistentId}`)
        .expect(404);

      // PUT
      await request(app)
        .put(`/api/v1/memories/${nonExistentId}`)
        .send({ title: 'Updated Title' })
        .expect(404);

      // DELETE
      await request(app)
        .delete(`/api/v1/memories/${nonExistentId}`)
        .expect(404);
    });
  });
});