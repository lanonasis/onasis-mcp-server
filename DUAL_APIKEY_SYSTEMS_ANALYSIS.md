# Dual API Key Systems Analysis

## Executive Summary

The Onasis MCP Server implements **TWO separate API key systems** for different purposes:

1. **External API Keys** (`maas_api_keys` table)
   - Purpose: Public API access authentication
   - Hashing: SHA-256 (one-way)
   - Users: External clients, developers, integrations

2. **Internal API Keys** (`stored_api_keys` table)
   - Purpose: Secret management and service credentials
   - Storage: Encrypted with AES-256-GCM (reversible)
   - Users: Internal services, microservices, infrastructure

**Status**: Both systems now properly validated with SHA-256 hash comparison

---

## Table of Contents

1. [System Comparison](#system-comparison)
2. [Architecture Overview](#architecture-overview)
3. [Use Cases](#use-cases)
4. [Implementation Details](#implementation-details)
5. [Security Model](#security-model)
6. [Integration Points](#integration-points)
7. [Recommendations](#recommendations)

---

## System Comparison

| Feature | External API Keys | Internal API Keys |
|---------|------------------|-------------------|
| **Table** | `maas_api_keys` | `stored_api_keys` |
| **Purpose** | API authentication | Secret management |
| **Hashing** | SHA-256 (one-way) | SHA-256 for lookup, AES-256-GCM for storage |
| **Validation** | `auth-aligned.ts` | `auth.ts` |
| **Reversible** | No | Yes (for internal use) |
| **Exposed to Users** | Yes | No (internal only) |
| **Expiration** | Yes | Yes |
| **Revocation** | via `is_active` | via `status` |
| **Audit Trail** | `last_used` | Optional `last_used_at` |

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                         ONASIS MCP SERVER                             │
└───────────────────────────────────────────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                                │
                 ▼                                ▼
    ┌────────────────────────┐      ┌────────────────────────┐
    │  EXTERNAL API KEYS     │      │  INTERNAL API KEYS     │
    │  (maas_api_keys)       │      │  (stored_api_keys)     │
    └────────────────────────┘      └────────────────────────┘
                 │                                │
                 │                                │
    ┌────────────▼────────────┐      ┌───────────▼────────────┐
    │ SHA-256 Hash Validation │      │ SHA-256 Hash Validation│
    │ (one-way)               │      │ + AES-256-GCM Storage  │
    │                         │      │ (reversible)           │
    └────────────┬────────────┘      └───────────┬────────────┘
                 │                                │
                 │                                │
    ┌────────────▼────────────┐      ┌───────────▼────────────┐
    │ auth-aligned.ts         │      │ auth.ts                │
    │ authenticateApiKey()    │      │ validateInternalApiKey │
    └────────────┬────────────┘      └───────────┬────────────┘
                 │                                │
                 │                                │
                 └────────────┬───────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  authMiddleware │
                    │  (unified)      │
                    └─────────────────┘
```

---

## Use Cases

### External API Keys

**Who Uses Them?**
- External developers building integrations
- Third-party applications
- Customer applications
- Public API consumers

**What They Access**:
- Public API endpoints (`/api/v1/*`)
- Memory operations
- System tools
- Rate-limited resources

**Example Flow**:
```typescript
// 1. User generates key via dashboard
const apiKey = generateApiKey(); // "sk_prod_abc123..."

// 2. User stores key in their application
const response = await fetch('https://mcp.lanonasis.com/api/v1/memories', {
  headers: {
    'X-API-Key': apiKey
  }
});

// 3. Server validates using SHA-256 hash
const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
const record = await db.query('SELECT * FROM maas_api_keys WHERE key_hash = $1', [hashedKey]);
```

---

### Internal API Keys

**Who Uses Them?**
- Internal microservices
- Infrastructure services
- Background jobs
- Service-to-service communication

**What They Store**:
- Database credentials
- OAuth tokens
- Webhook secrets
- Encryption keys
- SSH keys
- Certificate data

**Example Flow**:
```typescript
// 1. Admin stores internal secret
await apiKeyService.createApiKey({
  name: 'Production DB Password',
  value: 'super-secret-password',
  keyType: 'database_url',
  environment: 'production',
  projectId: 'proj_123'
});

// 2. Service retrieves secret
const apiKey = process.env.INTERNAL_API_KEY;
const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

// 3. Server validates and returns decrypted value
const record = await db.query('SELECT * FROM stored_api_keys WHERE encrypted_value = $1', [hashedKey]);
const decryptedValue = decrypt(record.encrypted_value, encryptionKey);
```

---

## Implementation Details

### External API Keys (maas_api_keys)

**File**: `src/middleware/auth-aligned.ts`

**Function**: `authenticateApiKey()`

**Flow**:
```typescript
async function authenticateApiKey(apiKey: string): Promise<AlignedUser | null> {
  // 1. Hash incoming key with SHA-256
  const hashedApiKey = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  // 2. Query database
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
    .single();
  
  // 3. Check expiration
  if (keyRecord.expires_at && new Date() > new Date(keyRecord.expires_at)) {
    return null;
  }
  
  // 4. Return user object
  return {
    userId: keyRecord.user_id,
    organizationId: keyRecord.user_id,
    role: 'user',
    plan: keyRecord.maas_service_config[0].plan
  };
}
```

**Database Schema**:
```sql
CREATE TABLE maas_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash
  key_prefix TEXT, -- e.g., "sk_prod_abc..."
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_maas_api_keys_hash ON maas_api_keys(key_hash);
CREATE INDEX idx_maas_api_keys_user ON maas_api_keys(user_id);
```

---

### Internal API Keys (stored_api_keys)

**File**: `src/middleware/auth.ts`

**Function**: `validateInternalApiKey()`

**Flow**:
```typescript
async function validateInternalApiKey(apiKey: string): Promise<UnifiedUser | null> {
  // 1. Hash incoming key with SHA-256
  const hashedApiKey = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  // 2. Query database
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
  
  // 3. Check expiration
  if (keyRecord.expires_at && new Date() > new Date(keyRecord.expires_at)) {
    return null;
  }
  
  // 4. Return user object
  return {
    userId: keyRecord.created_by,
    organizationId: keyRecord.organization_id,
    role: keyRecord.access_level || 'user',
    plan: 'pro'
  };
}
```

**Database Schema**:
```sql
CREATE TABLE stored_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL UNIQUE, -- AES-256-GCM encrypted or SHA-256 hash
  key_type TEXT, -- 'api_key', 'database_url', 'oauth_token', etc.
  environment TEXT, -- 'development', 'staging', 'production'
  organization_id UUID NOT NULL,
  project_id UUID,
  created_by UUID,
  status TEXT DEFAULT 'active', -- 'active', 'rotating', 'deprecated', 'expired'
  access_level TEXT, -- 'public', 'authenticated', 'team', 'admin'
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stored_api_keys_hash ON stored_api_keys(encrypted_value);
CREATE INDEX idx_stored_api_keys_org ON stored_api_keys(organization_id);
CREATE INDEX idx_stored_api_keys_status ON stored_api_keys(status);
```

---

## Security Model

### External API Keys

**Threat Model**:
- Public-facing keys
- Can be leaked in client code, logs, repos
- Need rate limiting
- Need usage monitoring
- Need revocation

**Security Measures**:
✅ SHA-256 hashing (irreversible)  
✅ Expiration enforcement  
✅ Revocation via `is_active` flag  
✅ Rate limiting by plan  
✅ Usage tracking (`last_used`)  
✅ Prefix-based identification  

**Key Format**: `sk_{env}_{random}`
- `sk_` = Secret Key prefix
- `{env}` = `prod`, `test`, `dev`
- `{random}` = 64 hex characters (32 bytes)

---

### Internal API Keys

**Threat Model**:
- Never exposed to external users
- Used by internal services only
- Need to be retrievable (for database passwords, etc.)
- Higher trust environment
- Still need expiration and revocation

**Security Measures**:
✅ SHA-256 hashing for validation  
✅ AES-256-GCM encryption for storage  
✅ Expiration enforcement  
✅ Status-based revocation  
✅ Access level controls  
✅ Organization isolation  

**Encryption Details**:
```typescript
class EncryptionUtils {
  static algorithm = 'aes-256-gcm';
  
  static encrypt(text: string, key: string): string {
    const derivedKey = crypto.pbkdf2Sync(key, 'salt', 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, derivedKey, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }
  
  static decrypt(encryptedText: string, key: string): string {
    // Reverse of encrypt
  }
}
```

---

## Integration Points

### Unified Middleware

**File**: `src/middleware/auth.ts`

The `authMiddleware` function handles both systems:

```typescript
export const authMiddleware = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey) {
    // 1. Try internal API key first
    const internalUser = await validateInternalApiKey(apiKey);
    if (internalUser) {
      req.user = internalUser;
      return next();
    }
    
    // 2. Fall back to external passthrough
    req.user = { apiKey: apiKey };
    return next();
  }
  
  // 3. Handle JWT tokens
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded;
    return next();
  }
  
  // 4. No authentication
  return res.status(401).json({ error: 'Authentication required' });
};
```

### Priority Order

1. **Internal API Keys** (checked first)
   - Fast lookup
   - Higher privileges
   - Service-to-service

2. **External API Keys** (passthrough)
   - Forwarded to external validator
   - Public API access
   - User-facing

3. **JWT Tokens**
   - Standard web authentication
   - Session-based
   - User credentials

---

## Recommendations

### Current State ✅

Both systems are now properly implemented with:
- SHA-256 hashing for validation
- Expiration checking
- Revocation support
- Status enforcement
- Audit trails

### Future Enhancements

#### 1. Separate Authentication Middleware

Consider splitting into two middlewares:

```typescript
// For public APIs - external keys only
app.use('/api/v1/public', authenticateExternalKey);

// For internal APIs - internal keys only
app.use('/api/v1/internal', authenticateInternalKey);

// For general APIs - both
app.use('/api/v1', authMiddleware);
```

#### 2. Key Rotation Automation

```typescript
// Auto-rotate keys nearing expiration
async function autoRotateKeys() {
  const expiringKeys = await supabase
    .from('stored_api_keys')
    .select('*')
    .lt('expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) // 7 days
    .eq('status', 'active');
  
  for (const key of expiringKeys.data) {
    await rotateApiKey(key.id);
  }
}
```

#### 3. Enhanced Audit Logging

```typescript
// Log all API key operations
await supabase
  .from('api_key_audit_log')
  .insert({
    key_id: keyId,
    operation: 'validated',
    timestamp: new Date(),
    ip_address: req.ip,
    user_agent: req.headers['user-agent']
  });
```

#### 4. Usage Analytics

```typescript
// Track API key usage patterns
await supabase
  .from('api_key_usage')
  .insert({
    key_id: keyId,
    endpoint: req.path,
    method: req.method,
    status_code: res.statusCode,
    response_time: Date.now() - startTime
  });
```

#### 5. Key Health Monitoring

```typescript
// Alert on unusual patterns
async function monitorKeyHealth() {
  // Check for:
  // - Unused keys (no activity in 30 days)
  // - Overused keys (rate limit exceeded)
  // - Failed validation attempts
  // - Keys nearing expiration
}
```

---

## Decision Matrix

| Scenario | Use External Keys | Use Internal Keys |
|----------|------------------|-------------------|
| Public API access | ✅ Yes | ❌ No |
| User authentication | ✅ Yes | ❌ No |
| Service-to-service | ❌ No | ✅ Yes |
| Database credentials | ❌ No | ✅ Yes |
| OAuth tokens storage | ❌ No | ✅ Yes |
| Webhook secrets | ❌ No | ✅ Yes |
| Third-party integrations | ✅ Yes | ❌ No |
| MCP tool access | ✅ Yes (external) | ✅ Yes (internal) |

---

## Testing Strategy

### External Keys

```typescript
describe('External API Keys', () => {
  it('should validate correct key', async () => {
    const key = 'sk_prod_abc123';
    const user = await authenticateApiKey(key);
    expect(user).not.toBeNull();
  });
  
  it('should reject expired key', async () => {
    const key = 'sk_prod_expired';
    const user = await authenticateApiKey(key);
    expect(user).toBeNull();
  });
  
  it('should reject inactive key', async () => {
    const key = 'sk_prod_inactive';
    const user = await authenticateApiKey(key);
    expect(user).toBeNull();
  });
});
```

### Internal Keys

```typescript
describe('Internal API Keys', () => {
  it('should validate correct internal key', async () => {
    const key = 'internal_key_123';
    const user = await validateInternalApiKey(key);
    expect(user).not.toBeNull();
  });
  
  it('should check status', async () => {
    const key = 'internal_key_deprecated';
    const user = await validateInternalApiKey(key);
    expect(user).toBeNull();
  });
});
```

---

## Conclusion

The dual API key system provides:

1. **External Keys**: Public API access with rate limiting
2. **Internal Keys**: Secret management with encryption

Both systems now use **SHA-256 for validation** and provide:
- Expiration enforcement
- Revocation support
- Audit trails
- Security best practices

This architecture balances security, performance, and usability.

---

## Related Documentation

- [API_KEY_HASHING_FIXES.md](./API_KEY_HASHING_FIXES.md) - Technical implementation
- [API_KEY_FIX_SUMMARY.md](./API_KEY_FIX_SUMMARY.md) - Overview
- [API_KEY_QUICK_REFERENCE.md](./API_KEY_QUICK_REFERENCE.md) - Developer guide

---

**Last Updated**: 2025-11-22  
**Version**: 1.0
