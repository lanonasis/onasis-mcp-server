import axios, { AxiosInstance, AxiosResponse } from 'axios';
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
 * OnasisCoreClient - Routes MCP requests through Onasis-CORE instead of direct Supabase
 * This ensures proper authentication, RLS policies, and user context
 */
export class OnasisCoreClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor(apiKey?: string, baseURL?: string) {
    this.baseURL = baseURL || process.env.ONASIS_CORE_URL || 'https://api.lanonasis.com';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Onasis-MCP-Server/1.0.0',
      }
    });

    // Add API key if provided
    if (apiKey) {
      this.client.defaults.headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info('Onasis-CORE API Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: { ...config.headers, Authorization: '[REDACTED]' }
        });
        return config;
      },
      (error) => {
        logger.error('Onasis-CORE API Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info('Onasis-CORE API Response', {
          status: response.status,
          url: response.config.url,
          data_size: JSON.stringify(response.data).length
        });
        return response;
      },
      (error) => {
        logger.error('Onasis-CORE API Error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
          response: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set authentication token for requests
   */
  setAuthToken(token: string): void {
    this.client.defaults.headers['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Create a new memory entry via Onasis-CORE
   */
  async createMemory(id: string, data: CreateMemoryRequest & { user_id: string; group_id: string }): Promise<MemoryEntry> {
    const startTime = Date.now();

    try {
      const response: AxiosResponse<MemoryEntry> = await this.client.post('/api/v1/memory', {
        id,
        ...data
      });

      logPerformance('onasis_core_create_memory', Date.now() - startTime, {
        memory_id: id,
        content_length: data.content.length
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to create memory via Onasis-CORE', { error, memory_data: { id, ...data } });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new InternalServerError('Unauthorized - Invalid API key or token');
        } else if (error.response?.status === 403) {
          throw new InternalServerError('Forbidden - Insufficient permissions');
        } else if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw new InternalServerError(`Client error: ${error.response.data?.message || error.message}`);
        }
      }
      
      throw new InternalServerError('Failed to create memory entry via Onasis-CORE');
    }
  }

  /**
   * Get memory by ID via Onasis-CORE
   */
  async getMemoryById(id: string, organizationId: string): Promise<MemoryEntry | null> {
    try {
      const response: AxiosResponse<MemoryEntry> = await this.client.get(`/api/v1/memory/${id}`, {
        params: { organization_id: organizationId }
      });

      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      
      logger.error('Failed to get memory by ID via Onasis-CORE', { error, id, organizationId });
      throw new InternalServerError('Failed to retrieve memory via Onasis-CORE');
    }
  }

  /**
   * Update memory entry via Onasis-CORE
   */
  async updateMemory(id: string, data: UpdateMemoryRequest): Promise<MemoryEntry> {
    const startTime = Date.now();

    try {
      const response: AxiosResponse<MemoryEntry> = await this.client.put(`/api/v1/memory/${id}`, data);

      logPerformance('onasis_core_update_memory', Date.now() - startTime, {
        memory_id: id,
        updated_fields: Object.keys(data)
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to update memory via Onasis-CORE', { error, id, updateData: data });
      throw new InternalServerError('Failed to update memory entry via Onasis-CORE');
    }
  }

  /**
   * Delete memory entry via Onasis-CORE
   */
  async deleteMemory(id: string): Promise<void> {
    try {
      await this.client.delete(`/api/v1/memory/${id}`);
    } catch (error: any) {
      logger.error('Failed to delete memory via Onasis-CORE', { error, id });
      throw new InternalServerError('Failed to delete memory entry via Onasis-CORE');
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
      const response: AxiosResponse<{ results: MemorySearchResult[] }> = await this.client.post('/api/v1/memory/search', {
        query,
        organization_id: organizationId,
        ...filters
      });

      logPerformance('onasis_core_search_memory', Date.now() - startTime, {
        query_length: query.length,
        results_count: response.data.results?.length || 0,
        filters
      });

      return response.data.results || [];
    } catch (error: any) {
      logger.error('Failed to search memories via Onasis-CORE', { error, query, organizationId, filters });
      throw new InternalServerError('Failed to search memories via Onasis-CORE');
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
      const response: AxiosResponse<{
        memories: MemoryEntry[];
        pagination: { page: number; limit: number; total: number; pages: number; };
      }> = await this.client.get('/api/v1/memory', {
        params: {
          ...filters,
          page: options.page,
          limit: options.limit,
          sort: options.sort,
          order: options.order
        }
      });

      logPerformance('onasis_core_list_memory', Date.now() - startTime, {
        filters,
        options,
        results_count: response.data.memories?.length || 0,
        total: response.data.pagination?.total || 0
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to list memories via Onasis-CORE', { error, filters, options });
      throw new InternalServerError('Failed to list memories via Onasis-CORE');
    }
  }

  /**
   * Update access tracking via Onasis-CORE
   */
  async updateAccessTracking(id: string): Promise<void> {
    try {
      await this.client.post(`/api/v1/memory/${id}/access`);
    } catch (error: any) {
      logger.warn('Failed to update access tracking via Onasis-CORE', { error, id });
      // Don't throw error as this is not critical
    }
  }

  /**
   * Get memory count via Onasis-CORE
   */
  async getMemoryCount(organizationId: string): Promise<number> {
    try {
      const response: AxiosResponse<{ count: number }> = await this.client.get('/api/v1/memory/count', {
        params: { organization_id: organizationId }
      });

      return response.data.count || 0;
    } catch (error: any) {
      logger.error('Failed to get memory count via Onasis-CORE', { error, organizationId });
      throw new InternalServerError('Failed to get memory count via Onasis-CORE');
    }
  }

  /**
   * Get memory statistics via Onasis-CORE
   */
  async getMemoryStats(organizationId: string): Promise<MemoryStats> {
    const startTime = Date.now();

    try {
      const response: AxiosResponse<MemoryStats> = await this.client.get('/api/v1/memory/stats', {
        params: { organization_id: organizationId }
      });

      logPerformance('onasis_core_memory_stats', Date.now() - startTime, {
        organization_id: organizationId,
        total_memories: response.data.total_memories || 0
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get memory stats via Onasis-CORE', { error, organizationId });
      throw new InternalServerError('Failed to get memory statistics via Onasis-CORE');
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
      const response: AxiosResponse<{ deleted_count: number; failed_ids: string[]; }> = await this.client.post('/api/v1/memory/bulk/delete', {
        memory_ids: memoryIds,
        organization_id: organizationId
      });

      logPerformance('onasis_core_bulk_delete', Date.now() - startTime, {
        requested_count: memoryIds.length,
        deleted_count: response.data.deleted_count || 0,
        failed_count: response.data.failed_ids?.length || 0
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to bulk delete memories via Onasis-CORE', { error, memoryIds, organizationId });
      throw new InternalServerError('Failed to bulk delete memories via Onasis-CORE');
    }
  }

  /**
   * Health check for Onasis-CORE connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error: any) {
      logger.error('Onasis-CORE health check failed', { error: error.message });
      return false;
    }
  }
}