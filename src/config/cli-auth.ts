import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { jwtDecode } from 'jwt-decode';

interface UserProfile {
  email: string;
  organization_id: string;
  role: string;
  plan: string;
}

interface CLIConfigData {
  apiUrl?: string;
  token?: string;
  user?: UserProfile;
  lastUpdated?: string;
  // MCP configuration
  mcpServerPath?: string;
  mcpServerUrl?: string;
  mcpUseRemote?: boolean;
  mcpPreference?: 'local' | 'remote' | 'auto';
  // Service Discovery
  discoveredServices?: {
    auth_base: string;
    memory_base: string;
    mcp_ws_base: string;
    project_scope: string;
  };
  // Enhanced Authentication
  vendorKey?: string;
  authMethod?: 'jwt' | 'vendor_key' | 'oauth';
  [key: string]: any; // Allow dynamic properties
}

/**
 * CLI-Compatible Authentication Configuration for MCP Server
 * Aligns with @lanonasis/cli v1.5.2+ authentication patterns
 */
export class CLIAuthConfig {
  private configDir: string;
  private configPath: string;
  private config: CLIConfigData = {};

  constructor() {
    this.configDir = path.join(os.homedir(), '.maas');
    this.configPath = path.join(this.configDir, 'config.json');
  }

  async init(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      await this.load();
    } catch {
      // Config doesn't exist yet, that's ok
    }
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
    } catch {
      this.config = {};
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    this.config.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Validate vendor key format (pk_*.sk_*)
   */
  validateVendorKey(vendorKey: string): boolean {
    return /^pk_[a-zA-Z0-9]+\.sk_[a-zA-Z0-9]+$/.test(vendorKey);
  }

  /**
   * Extract components from vendor key
   */
  parseVendorKey(vendorKey: string): { publicKey: string; secretKey: string } | null {
    if (!this.validateVendorKey(vendorKey)) {
      return null;
    }
    const [publicKey, secretKey] = vendorKey.split('.');
    return { publicKey, secretKey };
  }

  /**
   * Get vendor key from config or environment
   */
  getVendorKey(): string | undefined {
    return process.env.LANONASIS_VENDOR_KEY || this.config.vendorKey;
  }

  /**
   * Check if vendor key authentication is available
   */
  hasVendorKey(): boolean {
    const vendorKey = this.getVendorKey();
    return !!vendorKey && this.validateVendorKey(vendorKey);
  }

  /**
   * Get JWT token from config or environment
   */
  getToken(): string | undefined {
    return process.env.LANONASIS_TOKEN || this.config.token;
  }

  /**
   * Check if JWT authentication is available
   */
  async isAuthenticated(): Promise<boolean> {
    const token = this.getToken();
    if (!token) return false;

    try {
      const decoded = jwtDecode(token) as Record<string, unknown>;
      const now = Date.now() / 1000;
      return typeof decoded.exp === 'number' && decoded.exp > now;
    } catch {
      return false;
    }
  }

  /**
   * Get API URL with service discovery support
   */
  getApiUrl(): string {
    return process.env.MEMORY_API_URL || 
           this.config.discoveredServices?.auth_base ||
           this.config.apiUrl || 
           'https://api.lanonasis.com/api/v1';
  }

  /**
   * Get user profile from JWT token
   */
  async getCurrentUser(): Promise<UserProfile | undefined> {
    const token = this.getToken();
    if (!token) return this.config.user;

    try {
      const decoded = jwtDecode(token) as Record<string, unknown>;
      return {
        email: String(decoded.email || ''),
        organization_id: String(decoded.organizationId || ''),
        role: String(decoded.role || ''),
        plan: String(decoded.plan || '')
      };
    } catch {
      return this.config.user;
    }
  }

  /**
   * Get preferred authentication method
   */
  getAuthMethod(): 'jwt' | 'vendor_key' | 'oauth' | 'none' {
    if (this.hasVendorKey()) return 'vendor_key';
    if (this.getToken()) return 'jwt';
    return this.config.authMethod || 'none';
  }

  /**
   * Service Discovery Integration
   */
  async discoverServices(): Promise<void> {
    try {
      const axios = (await import('axios')).default;
      const discoveryUrl = 'https://api.lanonasis.com/.well-known/onasis.json';
      const response = await axios.get(discoveryUrl);
      this.config.discoveredServices = response.data;
      await this.save();
    } catch (error) {
      // Service discovery failed, use defaults
      if (process.env.MCP_VERBOSE === 'true') {
        console.log('MCP Service discovery failed, using defaults');
      }
    }
  }

  /**
   * Generate authentication headers for API requests
   */
  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    
    const vendorKey = this.getVendorKey();
    const token = this.getToken();
    
    if (vendorKey && this.validateVendorKey(vendorKey)) {
      headers['X-Vendor-Key'] = vendorKey;
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  /**
   * Check if CLI is properly configured
   */
  isConfigured(): boolean {
    return this.hasVendorKey() || !!this.getToken();
  }

  /**
   * Get organization ID for vendor isolation
   */
  getOrganizationId(): string | undefined {
    const vendorKey = this.getVendorKey();
    if (vendorKey) {
      const parsed = this.parseVendorKey(vendorKey);
      // Extract org ID from public key format (pk_orgId_xxx)
      if (parsed?.publicKey) {
        const parts = parsed.publicKey.split('_');
        return parts[1]; // pk_ORG_ID_xxx -> ORG_ID
      }
    }
    
    return this.config.user?.organization_id;
  }
}

// Export singleton instance
export const cliAuthConfig = new CLIAuthConfig();