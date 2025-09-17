/**
 * Canonical UnifiedUser type with standardized field names
 * Use organizationId (camelCase) as the canonical field
 */
export interface UnifiedUser {
  id: string;
  userId: string;
  email: string;
  organizationId: string;
  role: string;
  plan: string;
}

/**
 * Legacy user shape with snake_case organization field
 */
export interface LegacyUser {
  id: string;
  email: string;
  organization_id: string;
  role: string;
  plan: string;
}

/**
 * Helper to convert legacy user data to canonical UnifiedUser
 */
export function createUnifiedUser(legacyUser: LegacyUser): UnifiedUser {
  return {
    id: legacyUser.id,
    userId: legacyUser.id, // Use id as userId for consistency
    email: legacyUser.email,
    organizationId: legacyUser.organization_id, // Convert to camelCase
    role: legacyUser.role,
    plan: legacyUser.plan
  };
}

/**
 * Helper to convert UnifiedUser back to legacy snake_case shape
 * Use only at API/edge boundaries when legacy shapes are required
 */
export function toLegacySnakeCase(user: UnifiedUser): LegacyUser {
  return {
    id: user.id,
    email: user.email,
    organization_id: user.organizationId, // Convert to snake_case
    role: user.role,
    plan: user.plan
  };
}

/**
 * Helper to get legacy userId (same as id for backward compatibility)
 */
export function toLegacyUserId(user: UnifiedUser): string {
  return user.id;
}

/**
 * Builder function that accepts source user and returns canonical shape
 * with optional legacy alias views for edge boundary compatibility
 */
export function buildUnifiedUser(sourceUser: {
  id?: string;
  organization_id?: string;
  email?: string;
  role?: string;
  plan?: string;
}): UnifiedUser {
  if (!sourceUser.id || !sourceUser.organization_id || !sourceUser.email) {
    throw new Error('Invalid user data: missing required fields');
  }

  return {
    id: sourceUser.id,
    userId: sourceUser.id,
    email: sourceUser.email,
    organizationId: sourceUser.organization_id,
    role: sourceUser.role || 'user',
    plan: sourceUser.plan || 'free'
  };
}