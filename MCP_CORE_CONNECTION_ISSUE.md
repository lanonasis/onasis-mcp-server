# MCP Core Connection Issue - Root Cause & Solution

## Problem Summary

**Symptom**: PM2 mcp-core service fails to start with connection error  
**Error**: `ENOTFOUND db.mxtsdgkwzjzlttpotole.supabase.co`  
**Status**: ✅ SOLUTION PROVIDED  

---

## Root Cause Analysis

### The Problem

The mcp-core service cannot connect to Supabase database when started via PM2.

### Why It Happens

PM2 does **NOT** automatically load `.env` files. When you start a service with PM2, it uses the environment variables from the shell at the time `pm2 start` was run.

**What happens**:
```bash
# 1. You have a .env file with credentials
SUPABASE_URL=https://db.mxtsdgkwzjzlttpotole.supabase.co
SUPABASE_SERVICE_KEY=your-key-here

# 2. PM2 starts the service
pm2 start ecosystem.config.cjs

# 3. Service tries to connect
const supabaseUrl = process.env.SUPABASE_URL; // ← undefined!

# 4. Connection fails
Error: ENOTFOUND db.mxtsdgkwzjzlttpotole.supabase.co
```

### Diagnosis

Run these commands to verify:

```bash
# 1. Check if .env file exists
ls -la /path/to/mcp-core/.env

# 2. Check what env vars PM2 has
pm2 env 0  # Replace 0 with your process ID

# 3. Check logs
pm2 logs mcp-core --lines 50 | grep SUPABASE
```

**Expected findings**:
- `.env` file missing or not loaded
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are undefined
- Logs show `ENOTFOUND` or `undefined` errors

---

## Solution Options

### Option 1: Use Environment File in PM2 Config (Recommended)

**File**: `ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [{
    name: 'mcp-core',
    script: './dist/unified-mcp-server.js',
    env_file: './.env', // ← Add this line
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

**Deploy**:
```bash
pm2 reload ecosystem.config.cjs --update-env
```

---

### Option 2: Explicitly Set Environment Variables

**File**: `ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [{
    name: 'mcp-core',
    script: './dist/unified-mcp-server.js',
    env: {
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://db.mxtsdgkwzjzlttpotole.supabase.co',
      SUPABASE_SERVICE_KEY: 'your-service-key-here',
      JWT_SECRET: 'your-jwt-secret-here',
      // Add all required env vars
    }
  }]
};
```

**⚠️ Security Warning**: Don't commit secrets to git!

**Deploy**:
```bash
pm2 reload ecosystem.config.cjs --update-env
```

---

### Option 3: Use .env with dotenv in Code (Development Only)

**File**: `src/config/environment.ts`

```typescript
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

export const config = {
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY!,
  JWT_SECRET: process.env.JWT_SECRET!
};
```

**Note**: This works for `npm run dev` but PM2 needs additional configuration.

---

## Quick Fix Script

We've provided an automated fix script: `fix-mcp-core-connection.sh`

**Usage**:
```bash
# Run the automated fix
bash fix-mcp-core-connection.sh
```

**What it does**:
1. Checks if .env file exists
2. Creates from backup if missing
3. Verifies Supabase credentials
4. Updates PM2 configuration
5. Reloads services
6. Tests connection
7. Shows status

---

## Manual Fix Steps

If you prefer to fix manually:

### Step 1: Create .env File

```bash
cd /path/to/mcp-core

# Create from example
cp .env.example .env

# OR create from scratch
cat > .env <<EOF
SUPABASE_URL=https://db.mxtsdgkwzjzlttpotole.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here
JWT_SECRET=your-jwt-secret-here
API_KEY_ENCRYPTION_KEY=your-encryption-key-here
EOF
```

### Step 2: Update PM2 Config

Edit `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: 'mcp-core',
    script: './dist/unified-mcp-server.js',
    env_file: './.env', // Add this line
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

### Step 3: Reload PM2

```bash
pm2 reload ecosystem.config.cjs --update-env
```

### Step 4: Verify

```bash
# Check status
pm2 status

# Check logs
pm2 logs mcp-core --lines 50

# Test connection
curl http://localhost:3001/health
```

---

## Environment Variables Required

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | `eyJhbGciOiJIUzI1Ni...` |
| `JWT_SECRET` | JWT signing secret | `your-secret-key` |
| `API_KEY_ENCRYPTION_KEY` | Encryption key for API keys | `your-encryption-key` |
| `NODE_ENV` | Environment (production/dev) | `production` |
| `PORT` | Service port | `3001` |

---

## Security Best Practices

### ✅ DO

1. **Use .env files for local development**
   ```bash
   # .env (not in git)
   SUPABASE_URL=...
   ```

2. **Use PM2 env_file in production**
   ```javascript
   env_file: './.env'
   ```

3. **Use secrets manager for sensitive data**
   ```bash
   # AWS Secrets Manager, HashiCorp Vault, etc.
   ```

4. **Rotate credentials regularly**
   ```bash
   # Every 90 days minimum
   ```

5. **Use different keys per environment**
   ```bash
   # .env.development
   # .env.staging
   # .env.production
   ```

### ❌ DON'T

1. **Don't commit .env files**
   ```gitignore
   # .gitignore
   .env
   .env.*
   !.env.example
   ```

2. **Don't hardcode secrets in code**
   ```typescript
   // ❌ Bad
   const apiKey = 'sk_prod_abc123';
   
   // ✅ Good
   const apiKey = process.env.API_KEY;
   ```

3. **Don't share production keys**
   ```bash
   # Use separate keys for dev/staging/prod
   ```

4. **Don't log secrets**
   ```typescript
   // ❌ Bad
   console.log('API Key:', process.env.API_KEY);
   
   // ✅ Good
   console.log('API Key loaded:', !!process.env.API_KEY);
   ```

---

## Troubleshooting

### Issue: .env file exists but still fails

**Solution**:
```bash
# 1. Check file permissions
ls -la .env

# 2. Check file contents
cat .env | grep SUPABASE_URL

# 3. Ensure PM2 config loads .env
grep env_file ecosystem.config.cjs

# 4. Reload with --update-env flag
pm2 reload ecosystem.config.cjs --update-env
```

---

### Issue: Different credentials needed per service

**Solution**: Use per-service .env files

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'mcp-core',
      script: './dist/unified-mcp-server.js',
      env_file: './apps/mcp-core/.env'
    },
    {
      name: 'auth-gateway',
      script: './dist/auth-gateway.js',
      env_file: './apps/auth-gateway/.env'
    }
  ]
};
```

---

### Issue: PM2 not picking up .env changes

**Solution**: Force reload

```bash
# Delete and restart
pm2 delete mcp-core
pm2 start ecosystem.config.cjs --update-env

# OR restart with --update-env
pm2 restart mcp-core --update-env

# Verify env vars loaded
pm2 env 0
```

---

## Prevention Checklist

Before deploying to production:

- [ ] Create .env file from .env.example
- [ ] Fill in all required environment variables
- [ ] Add env_file to PM2 config
- [ ] Test locally first (`npm run dev`)
- [ ] Deploy with `pm2 reload --update-env`
- [ ] Verify connection (`curl /health`)
- [ ] Check logs for errors
- [ ] Set up monitoring/alerts

---

## Long-Term Solutions

### 1. Use a Secrets Manager

```typescript
// Load from AWS Secrets Manager
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

async function loadSecrets() {
  const client = new SecretsManager({ region: 'us-east-1' });
  const secret = await client.getSecretValue({ SecretId: 'prod/mcp-core' });
  return JSON.parse(secret.SecretString);
}
```

### 2. Use Environment-Specific Configs

```bash
# Load correct .env based on NODE_ENV
.env.development
.env.staging
.env.production
```

```typescript
const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
dotenv.config({ path: envFile });
```

### 3. Implement Health Checks

```typescript
// Add database connection check
app.get('/health', async (req, res) => {
  try {
    await supabase.from('health_check').select('1').limit(1);
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message 
    });
  }
});
```

### 4. Add Monitoring & Alerts

```bash
# PM2 Plus for monitoring
pm2 plus

# Set up alerts for connection failures
pm2 install pm2-discord
pm2 set pm2-discord:webhook_url https://discord.com/api/webhooks/xxx
```

---

## Diagnostic Commands

```bash
# Check PM2 status
pm2 status

# Check environment variables
pm2 env 0

# Check logs
pm2 logs mcp-core --lines 100

# Check .env file
cat .env | grep -v '#' | grep -v '^$'

# Test database connection
psql -h db.mxtsdgkwzjzlttpotole.supabase.co -U postgres -c "SELECT 1"

# Check if port is listening
lsof -i :3001

# Check PM2 config
cat ecosystem.config.cjs

# Restart and watch logs
pm2 restart mcp-core --update-env && pm2 logs mcp-core --lines 0
```

---

## Related Documentation

- [PM2_CONNECTION_FIX_GUIDE.md](./PM2_CONNECTION_FIX_GUIDE.md) - Quick fix guide
- [fix-mcp-core-connection.sh](./fix-mcp-core-connection.sh) - Automated fix script

---

**Last Updated**: 2025-11-22  
**Version**: 1.0  
**Status**: Solution Verified
