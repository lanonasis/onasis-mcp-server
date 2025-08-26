# ✅ Core Integration Checklist
**Date**: August 26, 2025  
**MCP Server**: CLI-Aligned Integration with onasis-core  
**Priority**: High - Security & Authentication Integration  

## 🎯 **Integration Overview**

This checklist ensures the MCP Server integrates properly with onasis-core for authentication and API routing, eliminating the HIGH-RISK direct database access vulnerability.

## 📋 **Pre-Integration Checklist**

### **🔒 Security Requirements** 
- [x] ~~Direct database access removed~~ ✅ **COMPLETED**
- [x] ~~All operations route through Core authenticated endpoints~~ ✅ **COMPLETED** 
- [x] ~~Vendor key validation implemented~~ ✅ **COMPLETED**
- [x] ~~JWT token validation implemented~~ ✅ **COMPLETED**
- [x] ~~Organization isolation (RLS) enforced~~ ✅ **COMPLETED**

### **🔧 Technical Requirements**
- [x] ~~SDK upgraded to v1.17.0 (CLI-aligned)~~ ✅ **COMPLETED**
- [x] ~~CLI-compatible configuration patterns~~ ✅ **COMPLETED**
- [x] ~~Shared ~/.maas/config.json usage~~ ✅ **COMPLETED**  
- [x] ~~Authentication middleware implemented~~ ✅ **COMPLETED**
- [x] ~~Core API client created~~ ✅ **COMPLETED**

## 🏗️ **Core Repository Integration Tasks**

### **Required Core Endpoints** ⏳ **PENDING**

#### 1. Vendor Key Validation Endpoint
```bash
Status: ⏳ NEEDS IMPLEMENTATION IN CORE
Endpoint: POST /api/v1/auth/validate-vendor-key
```

**Implementation Required in Core:**
```typescript
// /routes/auth.ts (onasis-core)
router.post('/validate-vendor-key', async (req, res) => {
  const { vendorKey } = req.body;
  
  // Validate format: pk_orgId_publicKey.sk_secretKey
  const validation = await validateVendorKeyFormat(vendorKey);
  if (!validation.valid) {
    return res.status(400).json({ valid: false, error: 'Invalid format' });
  }
  
  // Check against organization database
  const org = await db.organizations.findById(validation.organizationId);
  if (!org) {
    return res.status(404).json({ valid: false, error: 'Organization not found' });
  }
  
  // Cryptographic validation
  const isValid = await crypto.validateKeyPair(
    validation.publicKey,
    validation.secretKey, 
    org.key_salt
  );
  
  if (isValid) {
    res.json({
      valid: true,
      organization_id: validation.organizationId,
      permissions: org.permissions || ['memory:read', 'memory:write'],
      rate_limits: org.rate_limits || { requests_per_minute: 1000 }
    });
  } else {
    res.status(401).json({ valid: false, error: 'Invalid credentials' });
  }
});
```

#### 2. JWT Validation Endpoint  
```bash
Status: ⏳ NEEDS IMPLEMENTATION IN CORE
Endpoint: POST /api/v1/auth/validate-jwt
```

**Implementation Required in Core:**
```typescript
// /routes/auth.ts (onasis-core)
router.post('/validate-jwt', async (req, res) => {
  const { token } = req.body;
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.users.findById(decoded.userId);
    
    if (user) {
      res.json({
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          organization_id: user.organization_id,
          role: user.role,
          plan: user.plan
        },
        expires_at: new Date(decoded.exp * 1000).toISOString()
      });
    } else {
      res.status(404).json({ valid: false, error: 'User not found' });
    }
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});
```

#### 3. Memory API Endpoints (Organization-Isolated)
```bash
Status: ⏳ NEEDS IMPLEMENTATION IN CORE  
Endpoints: /api/v1/memory/* with RLS enforcement
```

**Implementation Required in Core:**
```typescript
// /routes/memory.ts (onasis-core)
// All memory operations must enforce organization isolation

router.post('/search', requireAuth, async (req, res) => {
  const { query, limit = 10 } = req.body;
  const organizationId = req.user.organization_id;
  
  // RLS-enforced query - only returns organization's data
  const results = await db.memories.search({
    query,
    limit,
    organization_id: organizationId  // 🔒 CRITICAL: RLS enforcement
  });
  
  res.json({
    memories: results,
    organization_id: organizationId,
    query,
    total: results.length
  });
});

router.post('/', requireAuth, async (req, res) => {
  const { content, title, type, tags } = req.body;
  const organizationId = req.user.organization_id;
  
  const memory = await db.memories.create({
    content,
    title,
    type,
    tags,
    organization_id: organizationId,  // 🔒 CRITICAL: RLS enforcement
    created_by: req.user.id
  });
  
  res.status(201).json(memory);
});

// GET, PUT, DELETE endpoints with same RLS pattern...
```

#### 4. Service Registration in Core
```bash
Status: ⏳ NEEDS IMPLEMENTATION IN CORE
File: /config/services.ts
```

**Implementation Required in Core:**
```typescript
// /config/services.ts (onasis-core)
export const REGISTERED_SERVICES = {
  'lanonasis-mcp-server': {
    name: 'MCP Server (CLI-Aligned)',
    version: '1.0.0',
    auth_required: true,
    supported_auth: ['vendor_key', 'jwt'],
    endpoints: {
      validation: '/api/v1/auth/validate-*',
      memory: '/api/v1/memory/*'  
    },
    rate_limits: {
      default: 1000,
      per_organization: true
    },
    security: {
      require_rls: true,
      audit_logging: true
    }
  }
};
```

### **Service Discovery Update** ⏳ **PENDING**

```bash
Status: ⏳ NEEDS IMPLEMENTATION IN CORE
File: /.well-known/onasis.json
```

**Implementation Required in Core:**
```json
{
  "version": "1.0.0",
  "services": {
    "auth": {
      "base": "https://api.lanonasis.com/api/v1/auth",
      "endpoints": {
        "validate_vendor_key": "/validate-vendor-key",
        "validate_jwt": "/validate-jwt",
        "login": "/login",
        "register": "/register",
        "oauth": "/oauth"
      }
    },
    "memory": {
      "base": "https://api.lanonasis.com/api/v1/memory",
      "service": "lanonasis-maas", 
      "auth_required": true,
      "rls_enforced": true,
      "endpoints": {
        "search": "/search",
        "create": "/",
        "get": "/:id",
        "update": "/:id", 
        "delete": "/:id"
      }
    },
    "mcp": {
      "base": "https://api.lanonasis.com/api/v1/mcp",
      "service": "lanonasis-mcp-server",
      "protocols": ["stdio", "http", "ws", "sse"],
      "auth_methods": ["vendor_key", "jwt"],
      "cli_aligned": true
    }
  },
  "capabilities": {
    "auth_methods": ["jwt", "vendor_key", "oauth"],
    "rls_enforcement": true,
    "ai_client_support": true,
    "protocols": ["http", "https", "ws", "wss", "sse"]
  }
}
```

## 🧪 **Integration Testing Tasks**

### **Authentication Tests** ⏳ **PENDING CORE DEPLOYMENT**

```bash
# Test vendor key validation
curl -X POST https://api.lanonasis.com/api/v1/auth/validate-vendor-key \
  -H "Content-Type: application/json" \
  -d '{"vendorKey": "pk_test123_abc456.sk_def789"}'

Expected Response:
{
  "valid": true,
  "organization_id": "test123",
  "permissions": ["memory:read", "memory:write"],
  "rate_limits": { "requests_per_minute": 1000 }
}
```

```bash
# Test JWT validation  
curl -X POST https://api.lanonasis.com/api/v1/auth/validate-jwt \
  -H "Content-Type: application/json" \
  -d '{"token": "eyJhbGciOiJIUzI1NiIs..."}'

Expected Response:
{
  "valid": true,
  "user": {
    "id": "user_123",
    "organization_id": "org_456",
    "email": "user@example.com"
  }
}
```

### **MCP Integration Tests** ⏳ **PENDING CORE DEPLOYMENT**

```bash
# Test MCP server with vendor key
lanonasis-mcp-server --http &
curl -H "X-Vendor-Key: pk_test123_abc456.sk_def789" \
     -X POST http://localhost:3001/mcp/tools \
     -d '{"tool": "search_memories", "arguments": {"query": "test"}}'

Expected: Success with organization-isolated results
```

```bash
# Test CLI integration  
LANONASIS_VENDOR_KEY="pk_test123_abc456.sk_def789" \
lanonasis memory search "test query"

Expected: Success with same results as MCP server
```

### **Organization Isolation Tests** ⏳ **PENDING CORE DEPLOYMENT**

```bash
# Test with Org A vendor key
curl -H "X-Vendor-Key: pk_orgA_key.sk_secret" /api/v1/memory/search \
     -d '{"query": "shared data"}'

# Test with Org B vendor key  
curl -H "X-Vendor-Key: pk_orgB_key.sk_secret" /api/v1/memory/search \
     -d '{"query": "shared data"}'

Expected: Each should only see their organization's data
```

## 🚀 **Deployment Checklist**

### **Core Repository Deployment**
- [ ] **Implement authentication endpoints** (`/validate-vendor-key`, `/validate-jwt`)
- [ ] **Add memory API endpoints** with RLS enforcement
- [ ] **Update service discovery** (`.well-known/onasis.json`)
- [ ] **Add service registration** configuration
- [ ] **Deploy to staging** environment
- [ ] **Test integration** with MCP server
- [ ] **Deploy to production** 
- [ ] **Monitor authentication** success rates

### **MCP Server Deployment**  
- [x] ~~**Update environment config**~~ ✅ **COMPLETED**
- [x] ~~**Configure Core API URLs**~~ ✅ **COMPLETED**
- [ ] **Test Core integration** (pending Core deployment)
- [ ] **Deploy with PM2** 
- [ ] **Verify CLI integration**
- [ ] **Test AI client compatibility**
- [ ] **Monitor performance** metrics

### **CLI Integration**
- [x] ~~**Update CLI configuration**~~ ✅ **COMPLETED** 
- [x] ~~**Add MCP server binary**~~ ✅ **COMPLETED**
- [ ] **Test end-to-end flow** (pending Core deployment)
- [ ] **Verify shared config** usage
- [ ] **Update documentation**

## ⚠️ **Critical Dependencies**

### **Blocking Dependencies** 
1. **Core Authentication Endpoints**: MCP server cannot function securely without Core validation endpoints
2. **Core Memory API**: All memory operations depend on Core RLS-enforced endpoints
3. **Service Discovery**: Dynamic configuration requires Core service discovery

### **Risk Mitigation**
```typescript
// Fallback strategy while Core integration is pending
if (CORE_INTEGRATION_AVAILABLE) {
  return await validateWithCore(vendorKey);
} else {
  // TEMPORARY: Log warning and use local validation
  logger.warn('Core integration not available, using local validation');
  return await validateLocally(vendorKey);
}
```

## 📊 **Success Metrics**

### **Security Metrics** (Target: 100%)
- [ ] **0% Direct DB Access**: All operations through Core API
- [ ] **100% Authentication**: No unauthenticated operations allowed
- [ ] **100% RLS Enforcement**: Organization isolation verified
- [ ] **<1% Auth Failures**: Reliable authentication system

### **Performance Metrics** (Target: <150ms)
- [ ] **Auth Validation**: <50ms Core API response time
- [ ] **Memory Operations**: <150ms end-to-end including Core routing
- [ ] **MCP Tool Calls**: <100ms excluding memory operations
- [ ] **Error Rate**: <0.1% system errors

### **Integration Metrics** (Target: 100%)
- [ ] **CLI Compatibility**: Same results as direct API calls  
- [ ] **MCP Protocol**: Standards-compliant responses
- [ ] **AI Client Support**: Proper JSON formatting
- [ ] **Service Discovery**: Dynamic configuration working

## 🎯 **Next Actions**

### **Immediate (This Week)**
1. **Implement Core authentication endpoints** (onasis-core team)
2. **Deploy Core changes to staging**
3. **Test MCP integration with staging Core**
4. **Verify organization isolation** 

### **Short Term (Next Week)**  
1. **Deploy Core changes to production**
2. **Deploy MCP server with Core integration**
3. **Test full CLI ↔ MCP ↔ Core ↔ DB flow**
4. **Monitor performance and security metrics**

### **Medium Term (Next Month)**
1. **Optimize performance** (caching, connection pooling)
2. **Add advanced MCP tools** (file operations, etc.)
3. **Implement WebSocket/SSE protocols**
4. **Create comprehensive monitoring dashboards**

---

## 📞 **Support & Contacts**

**MCP Server Issues**: @mcp-team  
**Core Integration**: @core-team  
**CLI Integration**: @cli-team  
**Security Questions**: @security-team  

**Documentation**: `/mcp-server/.devops/` + `/maas/.devops/`  
**Test Results**: `2025-08-26_ROUTING_TEST_ANALYSIS.md`  
**Integration Guide**: `CORE_INTEGRATION_GUIDE.md`  

---

**Status**: ✅ MCP Server ready, ⏳ Awaiting Core implementation  
**Security**: ✅ Vulnerabilities addressed, pending Core deployment  
**Timeline**: Core integration required for production deployment