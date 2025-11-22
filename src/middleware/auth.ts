import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { JWTPayload } from '@/types/auth';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);

// Unified user type that works with both JWT and Supabase auth
export interface UnifiedUser extends JWTPayload {
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  apiKey?: string; // Store original API key for passthrough
}

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: UnifiedUser;
    }
  }
}

/**
 * Validate internal API key from stored_api_keys table
 * Uses SHA-256 hashing for secure comparison
 * Checks expiration, revocation, and active status
 */
async function validateInternalApiKey(apiKey: string): Promise<UnifiedUser | null> {
  try {
    // Hash the API key using SHA-256
    const hashedApiKey = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Query for the API key by its hash
    const { data: keyRecord, error } = await supabase
      .from('stored_api_keys')
      .select(`
        id,
        name,
        organization_id,
        created_by,
        status,
        expires_at,
        access_level
      `)
      .eq('encrypted_value', hashedApiKey)
      .eq('status', 'active')
      .single();

    if (error || !keyRecord) {
      logger.debug('Internal API key not found or error', { error: error?.message });
      return null;
    }

    // Check if key is expired
    if (keyRecord.expires_at && new Date() > new Date(keyRecord.expires_at)) {
      logger.warn('Internal API key expired', { keyId: keyRecord.id });
      return null;
    }

    // Update last_used tracking if you have such a column
    // This is optional and depends on your database schema
    // await supabase
    //   .from('stored_api_keys')
    //   .update({ last_used_at: new Date().toISOString() })
    //   .eq('id', keyRecord.id);

    // Create unified user object
    const userId = keyRecord.created_by || keyRecord.organization_id;
    const unifiedUser: UnifiedUser = {
      userId: userId,
      organizationId: keyRecord.organization_id,
      role: keyRecord.access_level || 'user',
      plan: 'pro', // Internal API keys typically have pro access
      id: userId,
      email: '',
      user_metadata: {},
      app_metadata: {}
    };
    
    return unifiedUser;
  } catch (error) {
    logger.error('Internal API key validation error', { error });
    return null;
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    let token: string | undefined;

    // Check for Bearer token
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    // Check for API key
    else if (apiKey) {
      // Try to validate internal API key first
      const user = await validateInternalApiKey(apiKey);
      
      if (user) {
        // Internal API key validated successfully
        req.user = user;
        
        logger.debug('Internal API key authenticated', { 
          userId: user.userId,
          organizationId: user.organizationId,
          apiKeyPrefix: apiKey.substring(0, 20) + '...' 
        });
        
        next();
        return;
      }
      
      // If not an internal API key, pass through for external validation
      // Create a minimal user object that includes the API key for passthrough
      req.user = {
        userId: 'api-user', // Placeholder - will be resolved by external service
        organizationId: 'api-org', // Placeholder - will be resolved by external service
        role: 'user',
        plan: 'pro',
        apiKey: apiKey
      };
      
      logger.debug('External API key passthrough', { 
        apiKeyPrefix: apiKey.substring(0, 20) + '...' 
      });
      
      next();
      return;
    }

    if (!token) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid Bearer token or API key'
      });
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
      
      // Add user info to request
      req.user = decoded;
      
      logger.debug('User authenticated', {
        userId: decoded.userId,
        organizationId: decoded.organizationId,
        role: decoded.role
      });

      next();
    } catch (jwtError) {
      logger.warn('Invalid token provided', { 
        error: jwtError instanceof Error ? jwtError.message : 'Unknown error',
        token: token.substring(0, 20) + '...' 
      });
      
      res.status(401).json({
        error: 'Invalid token',
        message: 'The provided token is invalid or expired'
      });
      return;
    }
  } catch (error) {
    logger.error('Authentication middleware error', { error });
    res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
    return;
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
      return;
    }

    next();
  };
};

export const requirePlan = (allowedPlans: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    if (!allowedPlans.includes(req.user.plan)) {
      res.status(403).json({
        error: 'Plan upgrade required',
        message: `This feature requires one of the following plans: ${allowedPlans.join(', ')}`
      });
      return;
    }

    next();
  };
};