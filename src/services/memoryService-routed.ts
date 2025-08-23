import { logger, logPerformance } from '@/utils/logger';
import { 
  MemoryEntry, 
  MemorySearchResult, 
  CreateMemoryRequest, 
  UpdateMemoryRequest,
  MemoryStats,
  MemoryType 
} from '@/types/memory';
import { InternalServerError } from '@/middleware/errorHandler';
import { OnasisCoreClient, ListMemoryFilters } from './onasisCoreClient';

interface SearchFilters {
  memory_types?: MemoryType[];
  tags?: string[];
  topic_id?: string | null;
  user_id?: string;
  limit?: number;
  threshold?: number;
}

interface ListOptions {
  page: number;
  limit: number;
  sort: string;
  order: string;
}

/**
 * MemoryService that routes through Onasis-CORE instead of direct Supabase
 * This ensures proper authentication, RLS policies, and user context
 */
export class MemoryService {
  private onasisCore: OnasisCoreClient;

  constructor(apiKey?: string, onasisCoreUrl?: string) {
    this.onasisCore = new OnasisCoreClient(apiKey, onasisCoreUrl);
  }

  /**
   * Set authentication token for the current session
   */
  setAuthToken(token: string): void {
    this.onasisCore.setAuthToken(token);
  }

  /**
   * Create a new memory entry via Onasis-CORE
   */
  async createMemory(id: string, data: CreateMemoryRequest & { user_id: string; group_id: string }): Promise<MemoryEntry> {
    const startTime = Date.now();

    try {
      const memory = await this.onasisCore.createMemory(id, data);

      logPerformance('memory_creation_routed', Date.now() - startTime, {
        memory_id: id,
        content_length: data.content.length,
        routing: 'onasis-core'
      });

      return memory;
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      logger.error('Unexpected error creating memory via Onasis-CORE', { error });
      throw new InternalServerError('Failed to create memory entry');
    }
  }

  /**
   * Get memory by ID via Onasis-CORE
   */
  async getMemoryById(id: string, organizationId: string): Promise<MemoryEntry | null> {
    try {
      return await this.onasisCore.getMemoryById(id, organizationId);
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      logger.error('Unexpected error getting memory by ID via Onasis-CORE', { error });
      throw new InternalServerError('Failed to retrieve memory');
    }
  }

  /**
   * Update memory entry via Onasis-CORE
   */
  async updateMemory(id: string, data: UpdateMemoryRequest): Promise<MemoryEntry> {
    const startTime = Date.now();

    try {
      const memory = await this.onasisCore.updateMemory(id, data);

      logPerformance('memory_update_routed', Date.now() - startTime, {
        memory_id: id,
        updated_fields: Object.keys(data),
        routing: 'onasis-core'
      });

      return memory;
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      logger.error('Unexpected error updating memory via Onasis-CORE', { error });
      throw new InternalServerError('Failed to update memory entry');
    }
  }

  /**
   * Delete memory entry via Onasis-CORE
   */
  async deleteMemory(id: string): Promise<void> {
    try {
      await this.onasisCore.deleteMemory(id);
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      logger.error('Unexpected error deleting memory via Onasis-CORE', { error });
      throw new InternalServerError('Failed to delete memory entry');
    }
  }

  /**
   * Search memories via Onasis-CORE
   */
  async searchMemories(
    query: string, 
    organizationId: string, 
    filters: SearchFilters = {}
  ): Promise<MemorySearchResult[]> {
    const startTime = Date.now();

    try {
      const results = await this.onasisCore.searchMemories(query, organizationId, filters);

      logPerformance('memory_search_routed', Date.now() - startTime, {
        query_length: query.length,
        results_count: results?.length || 0,
        filters,
        routing: 'onasis-core'
      });

      return results;
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      logger.error('Unexpected error searching memories via Onasis-CORE', { error });
      throw new InternalServerError('Failed to search memories');
    }
  }

  /**
   * List memories with pagination via Onasis-CORE
   */
  async listMemories(filters: ListMemoryFilters, options: ListOptions): Promise<{
    memories: MemoryEntry[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const startTime = Date.now();

    try {
      const result = await this.onasisCore.listMemories(filters, options);

      logPerformance('memory_list_routed', Date.now() - startTime, {
        filters,
        options,
        results_count: result.memories?.length || 0,
        total: result.pagination?.total || 0,
        routing: 'onasis-core'
      });

      return result;
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      logger.error('Unexpected error listing memories via Onasis-CORE', { error });
      throw new InternalServerError('Failed to list memories');
    }
  }

  /**
   * Update access tracking via Onasis-CORE
   */
  async updateAccessTracking(id: string): Promise<void> {
    await this.onasisCore.updateAccessTracking(id);
  }

  /**
   * Get memory count via Onasis-CORE
   */
  async getMemoryCount(organizationId: string): Promise<number> {
    try {
      return await this.onasisCore.getMemoryCount(organizationId);
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      logger.error('Unexpected error getting memory count via Onasis-CORE', { error });
      throw new InternalServerError('Failed to get memory count');
    }
  }

  /**
   * Get memory statistics via Onasis-CORE
   */
  async getMemoryStats(organizationId: string): Promise<MemoryStats> {
    const startTime = Date.now();

    try {
      const stats = await this.onasisCore.getMemoryStats(organizationId);

      logPerformance('memory_stats_routed', Date.now() - startTime, {
        organization_id: organizationId,
        total_memories: stats.total_memories || 0,
        routing: 'onasis-core'
      });

      return stats;
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      logger.error('Unexpected error getting memory stats via Onasis-CORE', { error });
      throw new InternalServerError('Failed to get memory statistics');
    }
  }

  /**
   * Bulk delete memories via Onasis-CORE
   */
  async bulkDeleteMemories(memoryIds: string[], organizationId: string): Promise<{
    deleted_count: number;
    failed_ids: string[];
  }> {
    const startTime = Date.now();

    try {
      const result = await this.onasisCore.bulkDeleteMemories(memoryIds, organizationId);

      logPerformance('bulk_delete_routed', Date.now() - startTime, {
        requested_count: memoryIds.length,
        deleted_count: result.deleted_count || 0,
        failed_count: result.failed_ids?.length || 0,
        routing: 'onasis-core'
      });

      return result;
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      logger.error('Unexpected error in bulk delete via Onasis-CORE', { error });
      throw new InternalServerError('Failed to bulk delete memories');
    }
  }

  /**
   * Health check for the routing connection
   */
  async healthCheck(): Promise<boolean> {
    return await this.onasisCore.healthCheck();
  }
}