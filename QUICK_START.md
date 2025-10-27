# 🚀 MCP Quick Start Guide

## Choose Your Connection Method

### 🌐 Option 1: HTTP (Recommended for Stability)

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "lanonasis-mcp": {
      "command": "node",
      "args": [
        "/Users/onasis/dev-hub/mcp-monorepo/packages/standalone-mcp-submodule/src/remote-mcp-client.cjs",
        "--stdio"
      ],
      "env": {
        "HTTP_BASE_URL": "https://mcp.lanonasis.com",
        "MCP_API_KEY": ""
      }
    }
  }
}
```

---

### ⚡ Option 2: WebSocket (Real-time)

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "lanonasis-mcp": {
      "command": "node",
      "args": [
        "/Users/onasis/dev-hub/mcp-monorepo/packages/standalone-mcp-submodule/src/websocket-mcp-client.cjs",
        "--stdio"
      ],
      "env": {
        "WS_URL": "wss://mcp.lanonasis.com/ws",
        "HTTP_BASE_URL": "https://mcp.lanonasis.com",
        "MCP_API_KEY": ""
      }
    }
  }
}
```

---

### 🔒 Option 3: SSH Stdio (Most Secure)

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "lanonasis-mcp": {
      "command": "ssh",
      "args": [
        "vps",
        "node",
        "/opt/mcp-core/dist/index.js",
        "--stdio"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

---

### 💻 Option 4: Local Development

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "lanonasis-mcp": {
      "command": "node",
      "args": [
        "/Users/onasis/dev-hub/mcp-monorepo/packages/standalone-mcp-submodule/src/remote-mcp-client.cjs",
        "--stdio"
      ],
      "env": {
        "HTTP_BASE_URL": "http://localhost:3001"
      }
    }
  }
}
```

---

## 📋 Quick Test Commands

```bash
# Test health
curl https://mcp.lanonasis.com/health

# List tools
curl https://mcp.lanonasis.com/api/v1/tools

# Test SSE
curl -N https://mcp.lanonasis.com/api/v1/events

# Run full test suite
cd packages/standalone-mcp-submodule
./test-endpoints.sh
```

---

## 🔑 Get API Key (Optional)

API keys are only needed for authenticated tool execution. Public endpoints (health, list tools, SSE) work without authentication.

**To create an API key:**
1. Contact your administrator
2. Or use the auth API if you have JWT token
3. Set in environment: `export MCP_API_KEY="lms_xxxxx"`

---

## 📚 Available Tools (17)

- **Memory:** create, search, get, update, delete, list
- **Docs:** search_lanonasis_docs
- **API Keys:** create, list, delete, revoke
- **Org:** get_organization, list_projects
- **System:** get_auth_status, get/set_config

---

## 🎯 Recommended Setup

**For Production:** Use HTTP client (Option 1)
**For Real-time:** Use WebSocket client (Option 2)
**For Security:** Use SSH Stdio (Option 3)
**For Development:** Use Local (Option 4)

---

## 📖 Full Documentation

- **Endpoint Details:** `ENDPOINT_ALIGNMENT.md`
- **Complete Summary:** `../ENDPOINT_ALIGNMENT_SUMMARY.md`
- **Production Config:** `claude-mcp-production-config.json`

---

## ✅ Verification

After setup, verify in Claude Desktop:
1. Restart Claude Desktop
2. Type: "List available MCP tools"
3. Should see 17 tools from lanonasis-mcp
4. Test: "Check MCP server health"

**You're all set! 🎉**
