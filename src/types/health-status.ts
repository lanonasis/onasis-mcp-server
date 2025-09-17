/**
 * Health status response interface for the unified MCP server
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  server_info: {
    name: string;
    protocols: {
      stdio: boolean;
      http: number | false;
      websocket: number | false;
      sse: number | false;
    };
    uptime: number;
    memory_usage: NodeJS.MemoryUsage;
    tools_count: number;
  };
  services: {
    supabase: string;
    openai: string;
  };
  metrics?: {
    total_memories: number;
    active_api_keys: number;
    sse_connections: number;
  };
  metrics_error?: string;
}

/**
 * Organization info response interface
 */
export interface OrganizationInfo {
  name: string;
  plan: string;
  features: string[];
  limits: {
    memories: number;
    api_keys: number;
    rate_limit: number;
  };
  usage?: {
    memories_used: number;
    api_keys_active: number;
  };
  usage_error?: string;
}

/**
 * Memory update interface with properly typed fields
 */
export interface MemoryUpdateData {
  updated_at: string;
  title?: string;
  content?: string;
  memory_type?: string;
  tags?: string[];
  embedding?: number[];
}