# API Key Quick Reference Guide

Quick reference for developers working with the unified SHA-256 API key system.

---

## Table of Contents

1. [Hashing API Keys](#hashing-api-keys)
2. [Validating API Keys](#validating-api-keys)
3. [Testing](#testing)
4. [Common Patterns](#common-patterns)
5. [Troubleshooting](#troubleshooting)

---

## Hashing API Keys

### Node.js / Backend

```typescript
import crypto from 'crypto';

// Hash an API key with SHA-256
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Example usage
const plainKey = 'sk_prod_abc123xyz789';
const hashedKey = hashApiKey(plainKey);
// Output: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
```

### Browser / JavaScript

```javascript
async function hashApiKey(apiKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Example usage
const plainKey = 'sk_prod_abc123xyz789';
const hashedKey = await hashApiKey(plainKey);
```

### Python

```python
import hashlib

def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()

# Example usage
plain_key = 'sk_prod_abc123xyz789'
hashed_key = hash_api_key(plain_key)
```

---

## Validating API Keys

### External API Keys (maas_api_keys)

```typescript
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

async function validateExternalApiKey(apiKey: string) {
  const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  const { data, error } = await supabase
    .from('maas_api_keys')
    .select('*')
    .eq('key_hash', hashedKey)
    .eq('is_active', true)
    .single();
  
  if (error || !data) return null;
  
  // Check expiration
  if (data.expires_at && new Date() > new Date(data.expires_at)) {
    return null;
  }
  
  return data;
}
```

### Internal API Keys (stored_api_keys)

```typescript
async function validateInternalApiKey(apiKey: string) {
  const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  const { data, error } = await supabase
    .from('stored_api_keys')
    .select('*')
    .eq('encrypted_value', hashedKey)
    .eq('status', 'active')
    .single();
  
  if (error || !data) return null;
  
  // Check expiration
  if (data.expires_at && new Date() > new Date(data.expires_at)) {
    return null;
  }
  
  return data;
}
```

---

## Testing

### Generate Test Keys

```typescript
import crypto from 'crypto';

function generateTestApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  return `sk_test_${randomBytes.toString('hex')}`;
}

// Example
const testKey = generateTestApiKey();
// Output: 'sk_test_a1b2c3d4e5f6...'
```

### Test API Key Authentication

```bash
# Test with Authorization header
curl -X GET \
  -H "Authorization: Bearer sk_prod_your_api_key_here" \
  https://mcp.lanonasis.com/api/v1/health

# Test with X-API-Key header
curl -X GET \
  -H "X-API-Key: sk_prod_your_api_key_here" \
  https://mcp.lanonasis.com/api/v1/health
```

### Unit Test Example

```typescript
import { hashApiKey, validateApiKey } from './auth';

describe('API Key Hashing', () => {
  it('should produce deterministic SHA-256 hash', () => {
    const key = 'sk_test_123';
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 = 64 hex chars
  });
  
  it('should validate correct API key', async () => {
    const key = 'sk_test_123';
    const hash = hashApiKey(key);
    
    // Mock DB to return key record
    jest.spyOn(supabase.from('maas_api_keys'), 'select').mockResolvedValue({
      data: { key_hash: hash, is_active: true },
      error: null
    });
    
    const result = await validateApiKey(key);
    expect(result).not.toBeNull();
  });
});
```

---

## Common Patterns

### Creating a New API Key

```typescript
async function createApiKey(userId: string, name: string) {
  // 1. Generate random key
  const plainKey = `sk_prod_${crypto.randomBytes(32).toString('hex')}`;
  
  // 2. Hash the key
  const hashedKey = crypto.createHash('sha256').update(plainKey).digest('hex');
  
  // 3. Store in database
  const { data, error } = await supabase
    .from('maas_api_keys')
    .insert({
      user_id: userId,
      key_hash: hashedKey,
      key_prefix: plainKey.substring(0, 12) + '...', // For display
      is_active: true,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    })
    .select()
    .single();
  
  if (error) throw error;
  
  // 4. Return plain key ONCE (user must save it)
  return {
    id: data.id,
    plain_key: plainKey, // ⚠️ Only show this once!
    key_prefix: data.key_prefix,
    expires_at: data.expires_at
  };
}
```

### Revoking an API Key

```typescript
async function revokeApiKey(keyId: string) {
  const { error } = await supabase
    .from('maas_api_keys')
    .update({ is_active: false })
    .eq('id', keyId);
  
  if (error) throw error;
}
```

### Rotating an API Key

```typescript
async function rotateApiKey(oldKeyId: string) {
  // 1. Get old key details
  const { data: oldKey } = await supabase
    .from('maas_api_keys')
    .select('*')
    .eq('id', oldKeyId)
    .single();
  
  // 2. Create new key
  const newKey = await createApiKey(oldKey.user_id, oldKey.name);
  
  // 3. Revoke old key
  await revokeApiKey(oldKeyId);
  
  return newKey;
}
```

### Checking Key Expiration

```typescript
function isKeyExpired(expiresAt: string): boolean {
  if (!expiresAt) return false;
  return new Date() > new Date(expiresAt);
}

// Usage in middleware
if (isKeyExpired(keyRecord.expires_at)) {
  return res.status(401).json({ error: 'API key expired' });
}
```

---

## Troubleshooting

### Issue: Hash Mismatch

**Problem**: API key not found in database

```typescript
// Debug: Check what hash is being generated
const plainKey = 'sk_prod_abc123';
const hash = crypto.createHash('sha256').update(plainKey).digest('hex');
console.log('Hash:', hash);
console.log('Length:', hash.length); // Should be 64

// Check database
const { data } = await supabase
  .from('maas_api_keys')
  .select('key_hash')
  .limit(5);
console.log('DB hashes:', data);
```

### Issue: Key Not Validating

**Checklist**:
```typescript
// 1. Check key format
console.log('Key starts with sk_?', plainKey.startsWith('sk_'));

// 2. Check key is active
const { data } = await supabase
  .from('maas_api_keys')
  .select('is_active, expires_at')
  .eq('key_hash', hashedKey)
  .single();
console.log('Active?', data?.is_active);
console.log('Expired?', isKeyExpired(data?.expires_at));

// 3. Check database column
// Ensure you're querying the right column:
// - maas_api_keys.key_hash
// - stored_api_keys.encrypted_value
```

### Issue: Performance Slow

**Problem**: API key validation taking too long

```sql
-- Check if indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'maas_api_keys';

-- Create index if missing
CREATE INDEX IF NOT EXISTS idx_maas_api_keys_hash 
ON maas_api_keys(key_hash);

-- Analyze query performance
EXPLAIN ANALYZE 
SELECT * FROM maas_api_keys 
WHERE key_hash = 'your_hash_here';
```

---

## Migration Checklist

When upgrading from bcrypt to SHA-256:

- [ ] Update all hashing code to use SHA-256
- [ ] Verify database column names match
- [ ] Create indexes on hash columns
- [ ] Test with sample keys
- [ ] Notify users to regenerate keys
- [ ] Remove bcrypt dependency
- [ ] Update documentation
- [ ] Monitor authentication success rates

---

## Code Snippets

### Express Middleware

```typescript
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const apiKeyAuth = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  const { data, error } = await supabase
    .from('maas_api_keys')
    .select('*')
    .eq('key_hash', hashedKey)
    .eq('is_active', true)
    .single();
  
  if (error || !data) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  if (isKeyExpired(data.expires_at)) {
    return res.status(401).json({ error: 'API key expired' });
  }
  
  req.user = { id: data.user_id };
  next();
};
```

### React Hook

```typescript
import { useState } from 'react';

export function useApiKey() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  
  const createKey = async (name: string) => {
    const response = await fetch('/api/v1/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    
    const data = await response.json();
    setApiKey(data.plain_key); // Save temporarily
    return data;
  };
  
  const hashKey = async (plainKey: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plainKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };
  
  return { apiKey, createKey, hashKey };
}
```

---

## Environment Variables

```bash
# .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
JWT_SECRET=your-jwt-secret
API_KEY_ENCRYPTION_KEY=your-encryption-key # For AES-256-GCM (internal keys)
```

---

## Best Practices

1. **Never log plain API keys**
   ```typescript
   // ❌ Bad
   logger.info('API key:', apiKey);
   
   // ✅ Good
   logger.info('API key prefix:', apiKey.substring(0, 12) + '...');
   ```

2. **Always hash before database queries**
   ```typescript
   // ❌ Bad
   .eq('key_hash', apiKey) // Plain key in query
   
   // ✅ Good
   const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
   .eq('key_hash', hash)
   ```

3. **Show plain keys only once**
   ```typescript
   // ✅ On creation, show once
   return { plain_key: newKey };
   
   // ✅ After creation, never show again
   return { key_prefix: 'sk_prod_abc...' };
   ```

4. **Set expiration dates**
   ```typescript
   // ✅ Keys should expire
   expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
   ```

5. **Use indexes for performance**
   ```sql
   -- ✅ Index on hash column
   CREATE INDEX idx_key_hash ON maas_api_keys(key_hash);
   ```

---

## Related Documentation

- [API_KEY_HASHING_FIXES.md](./API_KEY_HASHING_FIXES.md) - Technical details
- [API_KEY_FIX_SUMMARY.md](./API_KEY_FIX_SUMMARY.md) - Overview
- [DUAL_API_KEY_SYSTEMS_ANALYSIS.md](./DUAL_API_KEY_SYSTEMS_ANALYSIS.md) - System analysis

---

**Last Updated**: 2025-11-22  
**Version**: 1.0
