# PM2 Connection Fix - Quick Guide

## 🚨 Quick Fix (2 minutes)

```bash
# Run the automated fix script
bash fix-mcp-core-connection.sh
```

**Done!** The script handles everything automatically.

---

## Manual Fix (5 minutes)

If you prefer to fix it manually or the script fails:

### Step 1: Create .env File

```bash
cd /home/runner/work/onasis-mcp-server/onasis-mcp-server

# Copy from example
cp .env.example .env

# OR create from production backup
cp .env.production .env

# OR create new
cat > .env <<EOF
SUPABASE_URL=https://db.mxtsdgkwzjzlttpotole.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here
JWT_SECRET=your-jwt-secret-here
API_KEY_ENCRYPTION_KEY=your-encryption-key-here
NODE_ENV=production
PORT=3001
EOF
```

### Step 2: Update PM2 Config

Edit `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: 'mcp-core',
    script: './dist/unified-mcp-server.js',
    env_file: './.env', // ← Add this line if missing
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
pm2 logs mcp-core --lines 20
# Should show successful connection
```

---

## What's the Problem?

**TL;DR**: PM2 doesn't load `.env` files automatically. Your service can't find database credentials.

### The Error

```
Error: ENOTFOUND db.mxtsdgkwzjzlttpotole.supabase.co
```

### Why It Happens

```javascript
// Your code tries to use process.env.SUPABASE_URL
const supabaseUrl = process.env.SUPABASE_URL;

// But PM2 didn't load .env, so it's undefined
console.log(supabaseUrl); // undefined

// Connection fails
```

---

## Verification Checklist

After applying the fix:

```bash
# 1. Check PM2 status
pm2 status
# ✅ Should show "online" status

# 2. Check logs
pm2 logs mcp-core --lines 50
# ✅ Should NOT show ENOTFOUND errors

# 3. Test health endpoint
curl http://localhost:3001/health
# ✅ Should return {"status":"ok"}

# 4. Check environment variables
pm2 env 0
# ✅ Should show SUPABASE_URL, SUPABASE_SERVICE_KEY, etc.
```

---

## Common Issues & Solutions

### Issue 1: .env file doesn't exist

**Error**: `ENOENT: no such file or directory, open '.env'`

**Fix**:
```bash
# Create from example
cp .env.example .env

# Fill in values
nano .env
```

---

### Issue 2: Wrong path to .env

**Error**: Still getting ENOTFOUND after adding env_file

**Fix**:
```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'mcp-core',
    script: './dist/unified-mcp-server.js',
    cwd: '/home/runner/work/onasis-mcp-server/onasis-mcp-server', // Add this
    env_file: './.env'
  }]
};
```

---

### Issue 3: PM2 not picking up changes

**Error**: Made changes but still failing

**Fix**:
```bash
# Delete and restart (forces reload)
pm2 delete mcp-core
pm2 start ecosystem.config.cjs

# Verify
pm2 logs mcp-core --lines 20
```

---

### Issue 4: Missing environment variables

**Error**: `process.env.SUPABASE_URL is undefined`

**Fix**:
```bash
# Check what's in .env
cat .env | grep SUPABASE_URL

# If missing, add it
echo "SUPABASE_URL=https://db.mxtsdgkwzjzlttpotole.supabase.co" >> .env

# Reload
pm2 reload mcp-core --update-env
```

---

## Three-Tier Fix Strategy

### Tier 1: Quick Fix (30 seconds)

```bash
bash fix-mcp-core-connection.sh
```

### Tier 2: Manual Fix (2-5 minutes)

1. Create `.env` file
2. Add `env_file` to PM2 config
3. Reload PM2

### Tier 3: Nuclear Option (last resort)

```bash
# Stop everything
pm2 stop all

# Delete PM2 process
pm2 delete mcp-core

# Fresh start
cp .env.production .env
pm2 start ecosystem.config.cjs

# Verify
pm2 logs mcp-core --lines 50
```

---

## Security Reminders

### ✅ DO

```bash
# Keep .env out of git
echo ".env" >> .gitignore

# Use different keys per environment
.env.development
.env.production

# Restrict file permissions
chmod 600 .env
```

### ❌ DON'T

```bash
# Don't commit .env
git add .env  # NO!

# Don't share production keys
slack send "Here's my API key: sk_prod_..."  # NO!

# Don't log secrets
console.log(process.env.API_KEY)  # NO!
```

---

## Quick Reference Commands

```bash
# Check PM2 status
pm2 status

# View logs (last 50 lines)
pm2 logs mcp-core --lines 50

# View logs (streaming)
pm2 logs mcp-core

# Restart service
pm2 restart mcp-core --update-env

# Check environment
pm2 env 0

# Delete and recreate
pm2 delete mcp-core
pm2 start ecosystem.config.cjs

# Test health
curl http://localhost:3001/health

# Check .env exists
ls -la .env

# View .env contents (careful!)
cat .env
```

---

## Need More Help?

### Detailed Guides

- [MCP_CORE_CONNECTION_ISSUE.md](./MCP_CORE_CONNECTION_ISSUE.md) - Full technical analysis
- [fix-mcp-core-connection.sh](./fix-mcp-core-connection.sh) - Automated fix script

### Still Stuck?

1. **Check logs**: `pm2 logs mcp-core --lines 100`
2. **Verify .env**: `cat .env | grep -v '^#'`
3. **Test connection**: `curl http://localhost:3001/health`
4. **Ask for help**: Include logs and error messages

---

## Automated Fix Script Contents

The `fix-mcp-core-connection.sh` script:

1. ✅ Checks if .env exists
2. ✅ Creates from backup if missing
3. ✅ Verifies Supabase credentials present
4. ✅ Updates PM2 config (if needed)
5. ✅ Reloads PM2 services
6. ✅ Tests connection
7. ✅ Shows success/failure status

**Usage**:
```bash
bash fix-mcp-core-connection.sh
```

---

## Success Indicators

### ✅ Fixed

```bash
pm2 logs mcp-core --lines 20

# You should see:
# ✅ "Server listening on port 3001"
# ✅ "Database connected"
# ✅ "MCP server ready"

# You should NOT see:
# ❌ "ENOTFOUND"
# ❌ "undefined"
# ❌ "Connection refused"
```

### Health Check

```bash
curl http://localhost:3001/health

# Should return:
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-11-22T19:00:00.000Z"
}
```

---

## Prevention for Future

### Add to Deployment Checklist

```markdown
- [ ] Create .env file
- [ ] Add env_file to PM2 config
- [ ] Test with npm run dev first
- [ ] Deploy with pm2 reload --update-env
- [ ] Verify health endpoint
- [ ] Check PM2 logs
- [ ] Monitor for 24 hours
```

### Add to .env.example

```bash
# .env.example
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-service-key
JWT_SECRET=your-jwt-secret
API_KEY_ENCRYPTION_KEY=your-encryption-key
NODE_ENV=production
PORT=3001

# Copy this file to .env and fill in actual values
# cp .env.example .env
```

### Add to README

```markdown
## Setup

1. Clone repo
2. Copy .env.example to .env: `cp .env.example .env`
3. Fill in environment variables
4. Install dependencies: `npm install`
5. Build: `npm run build`
6. Start: `pm2 start ecosystem.config.cjs`
```

---

## Timeline

| Step | Time | Description |
|------|------|-------------|
| 1. Run script | 30s | Automated fix |
| 2. Verify | 30s | Check logs/health |
| **Total** | **1min** | Complete fix |

**OR**

| Step | Time | Description |
|------|------|-------------|
| 1. Create .env | 1min | Copy and edit |
| 2. Update PM2 config | 1min | Add env_file |
| 3. Reload PM2 | 1min | Apply changes |
| 4. Verify | 1min | Check logs/health |
| **Total** | **4min** | Manual fix |

---

## Summary

**Problem**: PM2 doesn't load .env → Service can't connect to database

**Solution**: Add `env_file: './.env'` to PM2 config → Reload PM2

**Quick Fix**: Run `bash fix-mcp-core-connection.sh`

**Verification**: Check logs, test health endpoint

**Prevention**: Always include .env setup in deployment

---

**Last Updated**: 2025-11-22  
**Version**: 1.0  
**Fix Time**: 1-5 minutes
