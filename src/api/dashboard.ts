/**
 * Dashboard API Endpoints
 * Provides visualization data for memory records, queue metrics, and search analytics
 */

import { Router, Request, Response } from 'express';
import { MemoryService } from '@/services/memoryService';
import { logger } from '@/utils/logger';

export const dashboardRouter = Router();
const memoryService = new MemoryService();

/**
 * @swagger
 * /api/dashboard/overview:
 *   get:
 *     summary: Get dashboard overview with memory stats and queue metrics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard overview data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 memories:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     withEmbeddings:
 *                       type: integer
 *                     withoutEmbeddings:
 *                       type: integer
 *                     byType:
 *                       type: object
 *                     recentCount:
 *                       type: integer
 *                 queue:
 *                   type: object
 *                   properties:
 *                     pending:
 *                       type: integer
 *                     processing:
 *                       type: integer
 *                     completed:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                     averageTime:
 *                       type: number
 */
dashboardRouter.get('/overview', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Get memory stats
    const stats = await memoryService.getMemoryStats(undefined, apiKey);

    // Calculate embeddings status (assuming metadata tracks this)
    const withEmbeddings = stats.total_memories; // Placeholder - adjust based on actual implementation
    const withoutEmbeddings = 0; // Placeholder

    // Queue metrics - placeholder implementation
    // In a real implementation, this would come from a job queue service
    const queueMetrics = {
      pending: 0,
      processing: 0,
      completed: stats.total_memories,
      failed: 0,
      averageTime: 0
    };

    res.json({
      memories: {
        total: stats.total_memories,
        withEmbeddings,
        withoutEmbeddings,
        byType: stats.memories_by_type,
        recentCount: stats.recent_memories.length
      },
      queue: queueMetrics
    });
  } catch (error) {
    logger.error('Error fetching dashboard overview', { error });
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
});

/**
 * @swagger
 * /api/dashboard/recent:
 *   get:
 *     summary: Get recent memories with pagination
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Recent memories list
 */
dashboardRouter.get('/recent', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const userId = req.query.userId as string;

    const filters: any = {};
    if (userId) {
      filters.user_id = userId;
    }

    const result = await memoryService.listMemories(
      filters,
      { page, limit, sort: 'created_at', order: 'desc' },
      apiKey
    );

    res.json({
      memories: result.memories,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit)
    });
  } catch (error) {
    logger.error('Error fetching recent memories', { error });
    res.status(500).json({ error: 'Failed to fetch recent memories' });
  }
});

/**
 * @swagger
 * /api/dashboard/search-analytics:
 *   get:
 *     summary: Get search analytics and trends
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Search analytics data
 */
dashboardRouter.get('/search-analytics', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Placeholder implementation - would need actual analytics tracking
    const analytics = {
      totalSearches: 0,
      averageSimilarity: 0.85,
      topQueries: [],
      searchModes: {
        semantic: 0,
        keyword: 0,
        hybrid: 0
      }
    };

    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching search analytics', { error });
    res.status(500).json({ error: 'Failed to fetch search analytics' });
  }
});

/**
 * @swagger
 * /api/dashboard/queue/jobs:
 *   get:
 *     summary: Get queue job history
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue job history
 */
dashboardRouter.get('/queue/jobs', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Placeholder implementation - would need actual job queue tracking
    const jobs = [];

    res.json({
      jobs,
      total: jobs.length
    });
  } catch (error) {
    logger.error('Error fetching queue jobs', { error });
    res.status(500).json({ error: 'Failed to fetch queue jobs' });
  }
});

/**
 * @swagger
 * /api/dashboard/tags:
 *   get:
 *     summary: Get tag cloud data
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tag cloud data with frequencies
 */
dashboardRouter.get('/tags', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const userId = req.query.userId as string;
    const filters: any = {};
    if (userId) {
      filters.user_id = userId;
    }

    // Fetch all memories to analyze tags
    const result = await memoryService.listMemories(
      filters,
      { page: 1, limit: 1000, sort: 'created_at', order: 'desc' },
      apiKey
    );

    // Count tag frequencies
    const tagCounts: Record<string, number> = {};
    result.memories.forEach(memory => {
      memory.tags?.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // Convert to array and sort by frequency
    const tags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50); // Top 50 tags

    res.json({ tags });
  } catch (error) {
    logger.error('Error fetching tag cloud', { error });
    res.status(500).json({ error: 'Failed to fetch tag cloud' });
  }
});
