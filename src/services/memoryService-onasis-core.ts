import fetch from 'node-fetch';
import { config } from '@/config/environment';
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

export interface ListMemoryFilters extends Record<string, unknown> {
  organization_id?: string;
  user_id?: string;
  memory_type?: MemoryType;
  tags?: string[];
  topic_id?: string | null;
}

/**
 * MemoryService that routes through Onasis-Core API
 * This replaces direct Supabase calls with HTTP requests to onasis-core
 */
export class MemoryService {
  private readonly ONASIS_CORE_BASE_URL: string;

  constructor() {
    // Use onasis-core API endpoint instead of direct Supabase
    this.ONASIS_CORE_BASE_URL = process.env.ONASIS_CORE_URL || 'https://api.lanonasis.com';
  }

  /**
   * Make authenticated HTTP request to onasis-core
   */
  private async makeRequest(endpoint: string, options: {
    method?: string;
    body?: object;
    apiKey?: string;
  } = {}): Promise<any> {
    const { method = 'GET', body, apiKey } = options;
    
    if (!apiKey) {
      throw new InternalServerError('API key is required for onasis-core requests');
    }
    
    const url = `${this.ONASIS_CORE_BASE_URL}${endpoint}`;
    const fetchOptions: any = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'x-project-scope': 'maas'
      }
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    try {
      logger.info('Making request to onasis-core', { url, method });
      const response = await fetch(url, fetchOptions);
      const data = await response.json();

      if (!response.ok) {
        logger.error('Onasis-core API error', { 
          status: response.status, 
          statusText: response.statusText, 
          data,
          url
        });
        throw new InternalServerError(`API request failed: ${data.error || response.statusText}`);
      }

      return data;
    } catch (error) {
      logger.error('Failed to make request to onasis-core', { error, url, method });
      throw new InternalServerError('Failed to connect to onasis-core service');
    }
  }

  /**
   * Create a new memory entry via onasis-core
   */
  async createMemory(id: string, data: CreateMemoryRequest & { user_id: string; group_id: string }, apiKey: string): Promise<MemoryEntry> {
    const startTime = Date.now();

    try {
      const result = await this.makeRequest('/api/v1/memory', {
        method: 'POST',
        body: {
          id,
          title: data.title,
          content: data.content,
          memory_type: data.memory_type,
          tags: data.tags || [],
          topic_id: data.topic_id || null,
          metadata: data.metadata || {}
        },
        apiKey
      });

      logPerformance('memory_creation', Date.now() - startTime, {
        memory_id: id,
        content_length: data.content.length
      });

      return result;
    } catch (error) {
      logger.error('Failed to create memory via onasis-core', { error, id });
      throw error;
    }
  }

  /**
   * Get memory by ID via onasis-core
   */
  async getMemoryById(id: string, organizationId: string, apiKey: string): Promise<MemoryEntry | null> {
    try {
      const result = await this.makeRequest(`/api/v1/memory/${id}`, { apiKey });
      return result;
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        return null;
      }
      logger.error('Failed to get memory by ID via onasis-core', { error, id, organizationId });
      throw error;
    }
  }

  /**
   * Update memory entry via onasis-core
   */
  async updateMemory(id: string, data: UpdateMemoryRequest, apiKey: string): Promise<MemoryEntry> {
    const startTime = Date.now();

    try {
      const updateData: any = {};

      // Only include fields that are provided
      if (data.title !== undefined) updateData.title = data.title;
      if (data.content !== undefined) updateData.content = data.content;
      if (data.memory_type !== undefined) updateData.memory_type = data.memory_type;
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.topic_id !== undefined) updateData.topic_id = data.topic_id;
      if (data.metadata !== undefined) updateData.metadata = data.metadata;

      const result = await this.makeRequest(`/api/v1/memory/${id}`, {
        method: 'PUT',
        body: updateData,
        apiKey
      });

      logPerformance('memory_update', Date.now() - startTime, {
        memory_id: id,
        updated_fields: Object.keys(updateData)
      });

      return result;
    } catch (error) {
      logger.error('Failed to update memory via onasis-core', { error, id });
      throw error;
    }
  }

  /**
   * Delete memory entry via onasis-core
   */
  async deleteMemory(id: string, apiKey: string): Promise<void> {
    try {
      await this.makeRequest(`/api/v1/memory/${id}`, {
        method: 'DELETE',
        apiKey
      });
    } catch (error) {
      logger.error('Failed to delete memory via onasis-core', { error, id });
      throw error;
    }
  }

  /**
   * List memories with filters via onasis-core
   */
  async listMemories(
    filters: ListMemoryFilters = {},
    options: ListOptions = { page: 1, limit: 20, sort: 'created_at', order: 'desc' },
    apiKey: string
  ): Promise<{ memories: MemoryEntry[]; total: number }> {
    try {
      const queryParams = new URLSearchParams();
      
      // Add filters as query parameters
      if (filters.memory_type) queryParams.append('memory_type', filters.memory_type);
      if (filters.tags?.length) queryParams.append('tags', filters.tags.join(','));
      if (filters.topic_id) queryParams.append('topic_id', filters.topic_id);
      
      // Add pagination options
      queryParams.append('page', options.page.toString());
      queryParams.append('limit', options.limit.toString());
      queryParams.append('sort', options.sort);
      queryParams.append('order', options.order);

      const endpoint = `/api/v1/memory?${queryParams.toString()}`;
      const result = await this.makeRequest(endpoint, { apiKey });

      return {
        memories: result.data || result.memories || [],
        total: result.total || result.count || 0
      };
    } catch (error) {
      logger.error('Failed to list memories via onasis-core', { error, filters, options });
      throw error;
    }
  }

  /**
   * Search memories with semantic search via onasis-core
   */
  async searchMemories(
    query: string,
    filters: SearchFilters = {},
    organizationId?: string,
    apiKey?: string
  ): Promise<MemorySearchResult[]> {
    const startTime = Date.now();

    try {
      const searchData: any = {
        query,
        limit: filters.limit || 10,
        threshold: filters.threshold || 0.7
      };

      // Add optional filters
      if (filters.memory_types?.length) searchData.memory_types = filters.memory_types;
      if (filters.tags?.length) searchData.tags = filters.tags;
      if (filters.topic_id) searchData.topic_id = filters.topic_id;
      if (organizationId) searchData.organization_id = organizationId;

      const result = await this.makeRequest('/api/v1/memory/search', {
        method: 'POST',
        body: searchData,
        apiKey
      });

      logPerformance('memory_search', Date.now() - startTime, {
        query_length: query.length,
        results_count: result.length || result.data?.length || 0
      });

      return result.data || result || [];
    } catch (error) {
      logger.error('Failed to search memories via onasis-core', { error, query, filters });
      throw error;
    }
  }

  /**
   * Get memory statistics via onasis-core
   */
  async getMemoryStats(organizationId?: string, apiKey?: string): Promise<MemoryStats> {
    try {
      const endpoint = organizationId 
        ? `/api/v1/memory/stats?organization_id=${organizationId}`
        : '/api/v1/memory/stats';
      
      const result = await this.makeRequest(endpoint, { apiKey });
      return result;
    } catch (error) {
      logger.error('Failed to get memory stats via onasis-core', { error, organizationId });
      throw error;
    }
  }

  /**
   * Bulk delete memories via onasis-core
   */
  async bulkDeleteMemories(ids: string[], apiKey: string): Promise<{ deleted: number }> {
    try {
      const result = await this.makeRequest('/api/v1/memory/bulk/delete', {
        method: 'POST',
        body: { ids },
        apiKey
      });

      return result;
    } catch (error) {
      logger.error('Failed to bulk delete memories via onasis-core', { error, ids });
      throw error;
    }
  }

  /**
   * Update memory access tracking via onasis-core
   */
  async updateMemoryAccess(id: string, apiKey: string): Promise<void> {
    try {
      await this.makeRequest(`/api/v1/memory/${id}/access`, {
        method: 'POST',
        apiKey
      });
    } catch (error) {
      logger.error('Failed to update memory access via onasis-core', { error, id });
      // Don't throw error for access tracking failures
    }
  }

  /**
   * Legacy analytics logging method - now routes through onasis-core
   */
  private async logAnalytics(
    groupId: string, 
    userId: string, 
    action: string, 
    resourceType: string, 
    resourceId: string, 
    metadata: Record<string, any>,
    apiKey: string
  ): Promise<void> {
    try {
      await this.makeRequest('/api/v1/analytics', {
        method: 'POST',
        body: {
          group_id: groupId,
          user_id: userId,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          metadata
        },
        apiKey
      });
    } catch (error) {
      logger.warn('Failed to log analytics via onasis-core', { error, action, resourceType, resourceId });
      // Don't throw error for analytics failures
    }
  }
}

// Export the service instance
export const memoryService = new MemoryService();