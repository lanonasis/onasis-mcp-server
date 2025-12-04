import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { ensureApiKeyHash } from '../../../shared/hash-utils';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);

import { UnifiedUser } from './auth';

// Aligned user type for Supabase auth that extends JWTPayload
// Type alias for backward compatibility
export type AlignedUser = UnifiedUser;

/**
 * Authentication middleware aligned with Supabase auth system
 * Supports both JWT tokens and API keys
 */
export const alignedAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    let token: string | undefined;
    let isApiKey = false;

    // Check for Bearer token
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    // Check for API key
    else if (apiKey) {
      token = apiKey;
      isApiKey = true;
    }

    if (!token) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid Bearer token or API key'
      });
      return;
    }

    try {
      if (isApiKey) {
        // Handle API key authentication
        const user = await authenticateApiKey(token);
        if (!user) {
          res.status(401).json({
            error: 'Invalid API key',
            message: 'The provided API key is invalid or inactive'
          });
          return;
        }
        req.user = user;
      } else {
        // Handle JWT token authentication with Supabase
        const token = authHeader?.replace('Bearer ', '') || '';
        
        try {
          // Validate JWT token with Supabase
          const { data: { user }, error } = await supabase.auth.getUser(token);
          
          if (error || !user) {
            res.status(401).json({
              error: 'Invalid or expired token',
              message: 'JWT validation failed'
            });
            return;
          }

          // Get user plan from service config
          const { data: serviceConfig, error: configError } = await supabase
            .from('maas_service_config')
            .select('plan')
            .eq('user_id', user.id)
            .single();

          // Fix serviceConfig handling - .single() returns an object, not an array
          const plan = serviceConfig?.plan || 'free';

          const alignedUser: UnifiedUser = {
            // JWTPayload properties (from Supabase user)
            userId: user.id,
            organizationId: user.id, // For Supabase, use user ID as org ID
            role: 'user',
            plan: plan,
            // Additional UnifiedUser properties
            id: user.id,
            email: user.email || '',
            user_metadata: user.user_metadata || {},
            app_metadata: user.app_metadata || {}
          };

          req.user = alignedUser;
        } catch (jwtError) {
          res.status(401).json({
            error: 'JWT validation failed',
            message: 'Unable to validate authentication token'
          });
          return;
        }
      }

      logger.debug('User authenticated', {
        userId: req.user?.userId || req.user?.id,
        email: req.user?.email,
        plan: req.user?.plan,
        authMethod: isApiKey ? 'api_key' : 'jwt'
      });

      next();
    } catch (authError) {
      logger.warn('Authentication error', { 
        error: authError instanceof Error ? authError.message : 'Unknown error'
      });
      
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Unable to verify authentication credentials'
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

/**
 * Authenticate using API key from maas_api_keys table
 * Uses SHA-256 hashing for secure API key comparison
 */
async function authenticateApiKey(apiKey: string): Promise<AlignedUser | null> {
  try {
    // Hash the API key using SHA-256 for secure comparison
    const hashedApiKey = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Query for the API key by its hash
    const { data: keyRecord, error } = await supabase
      .from('maas_api_keys')
      .select(`
        user_id,
        is_active,
        expires_at,
        key_hash,
        maas_service_config!inner(plan)
      `)
      .eq('key_hash', hashedApiKey)
      .eq('is_active', true)
      .eq('key_hash', apiKeyHash)
      .single();

    if (error || !keyRecord) {
      return null;
    }

    // key_hash comparison handled in query; no further comparison needed

    // Check if key is expired
    if (keyRecord.expires_at && new Date() > new Date(keyRecord.expires_at)) {
      return null;
    }

    // Update last_used timestamp
    await supabase
      .from('maas_api_keys')
      .update({ last_used: new Date().toISOString() })
      .eq('key_hash', hashedApiKey);

    // Extract plan value to avoid TypeScript errors
    let plan = 'free';
    if (keyRecord && keyRecord.maas_service_config && Array.isArray(keyRecord.maas_service_config) && keyRecord.maas_service_config.length > 0 && keyRecord.maas_service_config[0]) {
      plan = keyRecord.maas_service_config[0].plan;
    }

    const unifiedUser: UnifiedUser = {
      // JWTPayload properties
      userId: keyRecord.user_id,
      organizationId: keyRecord.user_id, // For API keys, use user ID as org ID
      role: 'user', // Default role for API key users
      plan: plan,
      // Additional UnifiedUser properties
      id: keyRecord.user_id,
      email: '',
      user_metadata: {},
      app_metadata: {}
    };
    
    return unifiedUser;
  } catch (error) {
    logger.error('API key authentication error', { error });
    return null;
  }
}

/**
 * Middleware to check plan requirements
 */
export const requirePlan = (allowedPlans: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    const userPlan = req.user.plan || 'free';
    if (!allowedPlans.includes(userPlan)) {
      res.status(403).json({
        error: 'Plan upgrade required',
        message: `This feature requires one of the following plans: ${allowedPlans.join(', ')}. Current plan: ${userPlan}`,
        current_plan: userPlan,
        required_plans: allowedPlans
      });
      return;
    }

    next();
  };
};

/**
 * Check if user has admin privileges (for admin endpoints)
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'User not authenticated'
    });
    return;
  }

  // Check if user has admin role in app_metadata
  const appMetadata = req.user?.app_metadata as Record<string, unknown> | undefined;
  const isAdmin = appMetadata?.role === 'admin' ||
                  (Array.isArray(appMetadata?.roles) && appMetadata?.roles?.includes('admin'));

  if (!isAdmin) {
    res.status(403).json({
      error: 'Admin access required',
      message: 'This endpoint requires administrator privileges'
    });
    return;
  }

  next();
};

/**
 * Rate limiting based on user plan with actual enforcement
 */
export const planBasedRateLimit = () => {
  const limits: Record<string, { requests: number; window: number }> = {
    free: { requests: 60, window: 60000 }, // 60 requests per minute
    pro: { requests: 300, window: 60000 }, // 300 requests per minute
    enterprise: { requests: 1000, window: 60000 } // 1000 requests per minute
  };

  // Create rate limiters for each plan
  const limiters: Record<string, any> = {};
  
  Object.keys(limits).forEach(plan => {
    limiters[plan] = rateLimit({
      windowMs: limits[plan].window,
      max: limits[plan].requests,
      message: {
        error: `Rate limit exceeded for ${plan} plan`,
        limit: limits[plan].requests,
        window: limits[plan].window,
        retryAfter: Math.ceil(limits[plan].window / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) => {
        // Use user ID for rate limiting if available, otherwise IP
        return req.user?.userId || req.ip || 'unknown';
      }
    });
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      // Apply default rate limiting for unauthenticated users
      limiters.free(req, res, next);
      return;
    }

    const userPlan = req.user?.plan || 'free';
    const limiter = limiters[userPlan] || limiters.free;
    
    // Apply the appropriate rate limiter
    limiter(req, res, next);
  };
};

/**
 * Initialize user service configuration if it doesn't exist
 */
export async function ensureUserServiceConfig(userId: string): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('maas_service_config')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!existing) {
      await supabase
        .from('maas_service_config')
        .insert({
          user_id: userId,
          plan: 'free',
          memory_limit: 100,
          api_calls_per_minute: 60,
          features: {},
          settings: {}
        });
    }
  } catch (error) {
    logger.warn('Failed to ensure user service config', { error, userId });
  }
}
