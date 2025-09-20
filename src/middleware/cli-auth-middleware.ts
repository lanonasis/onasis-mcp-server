import { Request, Response, NextFunction } from 'express';
import { cliAuthConfig } from '../config/cli-auth.js';
import { UnifiedUser, buildUnifiedUser } from '../types/unified-user.js';
import axios from 'axios';

interface AuthenticatedRequest extends Request {
  user?: UnifiedUser;
  vendorKey?: string;
  organizationId?: string;
}

/**
 * CLI-Compatible Authentication Middleware for MCP Server
 * Routes through Core authenticated endpoints instead of direct DB access
 */
export class CLIAuthMiddleware {
  
  /**
   * Validate vendor key format and extract organization ID
   */
  static validateVendorKey(vendorKey: string): { isValid: boolean; organizationId?: string } {
    if (!cliAuthConfig.validateVendorKey(vendorKey)) {
      return { isValid: false };
    }

    const parsed = cliAuthConfig.parseVendorKey(vendorKey);
    if (!parsed) {
      return { isValid: false };
    }

    // Extract organization ID from public key (pk_orgId_xxx format)
    const publicKeyParts = parsed.publicKey.split('_');
    const organizationId = publicKeyParts[1];

    return { isValid: true, organizationId };
  }

  /**
   * Main authentication middleware
   */
  static async authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await cliAuthConfig.init();

      // Check for vendor key authentication
      const vendorKey = req.headers['x-vendor-key'] as string || cliAuthConfig.getVendorKey();
      if (vendorKey) {
        const validation = CLIAuthMiddleware.validateVendorKey(vendorKey);
        if (validation.isValid) {
          req.vendorKey = vendorKey;
          req.organizationId = validation.organizationId;
          
          // Validate vendor key with Core API
          const isValidWithCore = await CLIAuthMiddleware.validateWithCore(vendorKey);
          if (isValidWithCore) {
            return next();
          }
        }
      }

      // Check for JWT authentication
      const token = req.headers.authorization?.replace('Bearer ', '') || cliAuthConfig.getToken();
      if (token) {
        const isAuthenticated = await cliAuthConfig.isAuthenticated();
        if (isAuthenticated) {
          const user = await cliAuthConfig.getCurrentUser();
          if (user) {
            req.user = buildUnifiedUser({
              id: user.organization_id, // Using org ID as user ID for now
              organization_id: user.organization_id,
              email: user.email,
              role: user.role,
              plan: user.plan
            });
            req.organizationId = user.organization_id;
            return next();
          }
        }
      }

      // No valid authentication found
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid vendor key (X-Vendor-Key header) or JWT token (Authorization header)',
        supportedMethods: ['vendor_key', 'jwt'],
        example: {
          vendorKey: 'pk_orgId_publicKey.sk_secretKey',
          jwt: 'Bearer eyJhbGciOiJIUzI1NiIs...'
        }
      });
    } catch (error) {
      console.error('Authentication middleware error:', error);
      res.status(500).json({
        error: 'Authentication system error',
        message: 'Internal authentication system error'
      });
    }
  }

  /**
   * Validate vendor key with Core API
   */
  static async validateWithCore(vendorKey: string): Promise<boolean> {
    try {
      const coreUrl = cliAuthConfig.getApiUrl();
      const response = await axios.post(`${coreUrl}/auth/validate-vendor-key`, 
        { vendorKey },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-MCP-Client': 'lanonasis-mcp-server/1.0.0'
          },
          timeout: 5000
        }
      );
      return response.status === 200 && response.data.valid === true;
    } catch (error) {
      console.error('Vendor key validation error:', error);
      return false;
    }
  }

  /**
   * Route MCP memory operations through Core authenticated endpoints
   */
  static createCoreApiClient(req: AuthenticatedRequest) {
    const headers = cliAuthConfig.getAuthHeaders();
    
    // Add request-specific auth headers
    if (req.vendorKey) {
      headers['X-Vendor-Key'] = req.vendorKey;
    }
    if (req.user) {
      headers['X-Organization-ID'] = req.user.organizationId;
    } else if (req.organizationId) {
      // Ensure vendorKey auth gets organization header too
      headers['X-Organization-ID'] = req.organizationId;
    }

    return axios.create({
      baseURL: cliAuthConfig.getApiUrl(),
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'X-MCP-Client': 'lanonasis-mcp-server/1.0.0'
      },
      timeout: 10000
    });
  }

  /**
   * Memory operation proxy to Core API
   */
  static async proxyMemoryOperation(req: AuthenticatedRequest, operation: string, data?: any): Promise<any> {
    const client = CLIAuthMiddleware.createCoreApiClient(req);
    
    try {
      let response;
      
      switch (operation) {
        case 'search':
          response = await client.post('/memories/search', data);
          break;
        case 'create':
          response = await client.post('/memories', data);
          break;
        case 'get':
          response = await client.get(`/memories/${data.id}`);
          break;
        case 'update':
          response = await client.put(`/memories/${data.id}`, data);
          break;
        case 'delete':
          response = await client.delete(`/memories/${data.id}`);
          break;
        case 'list':
          response = await client.get('/memories', { params: data });
          break;
        default:
          throw new Error(`Unsupported memory operation: ${operation}`);
      }

      return response.data;
    } catch (error: any) {
      console.error(`Memory operation ${operation} failed:`, error);
      throw new Error(`Memory operation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Organization isolation middleware - ensures RLS compliance
   */
  static enforceOrganizationIsolation(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!req.organizationId) {
      res.status(403).json({
        error: 'Organization isolation required',
        message: 'Valid organization ID required for this operation'
      });
      return;
    }

    // Add organization context to all downstream operations
    req.headers['x-organization-id'] = req.organizationId;
    next();
  }

  /**
   * Rate limiting specific to CLI integration
   */
  static createRateLimit() {
    const rateLimit = require('express-rate-limit');
    
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: (req: AuthenticatedRequest) => {
        // Higher limits for authenticated users
        if (req.vendorKey || req.user) {
          return 1000; // 1000 requests per 15 minutes for authenticated
        }
        return 100; // 100 requests per 15 minutes for unauthenticated
      },
      keyGenerator: (req: AuthenticatedRequest) => {
        // Rate limit by organization ID for better isolation
        return req.organizationId || req.ip;
      },
      message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: '15 minutes'
      }
    });
  }
}

export type { AuthenticatedRequest };