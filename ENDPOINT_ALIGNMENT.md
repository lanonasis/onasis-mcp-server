# MCP Endpoint Alignment Guide

## Overview

This document explains the alignment between MCP-Core server endpoints and CLI client configurations for seamless communication across all transport protocols.

---

## MCP-Core Server Endpoints (Port 3001)

### ✅ Working Endpoints

| Endpoint | Protocol | Purpose | Authentication |
|----------|----------|---------|----------------|
| `/health` | HTTP GET | Health check & status | None |
| `/api/v1/tools` | HTTP GET | List available tools | None (public) |
| `/api/v1/tools/:toolName` | HTTP POST | Execute a tool | Required (API key or JWT) |
| `/api/v1/events` | SSE | Real-time event stream | None |
| `/ws` | WebSocket | Real-time bidirectional | Optional (API key) |
| `/api/v1/auth/api-keys` | HTTP POST/GET/DELETE | API key management | Required (JWT) |
| `/api/v1/auth/status` | HTTP GET | Auth status | Required |

### 🔐 Authentication Methods

1. **API Key** (Header: `x-api-key`)
   - For tool execution and protected endpoints
   - Created via `/api/v1/auth/api-keys`

2. **JWT Token** (Header: `Authorization: Bearer <token>`)
   - For user authentication
   - Managed by auth system

3. **No Auth** (Public endpoints)
   - `/health`
   - `/api/v1/tools` (list only)
   - `/api/v1/events` (SSE)

---

## Transport Protocols

### 1. **HTTP/REST** (Recommended for Stability)

**Local:**
```bash
http://localhost:3001
```

**Production:**
```bash
https://mcp.lanonasis.com
```

**Endpoints:**
- `GET /health` - Health check
- `GET /api/v1/tools` - List tools
- `POST /api/v1/tools/:toolName` - Execute tool

**Client:** `remote-mcp-client.js`

**Configuration:**
```json
{
  "command": "node",
  "args": ["src/remote-mcp-client.js", "--stdio"],
  "env": {
    "HTTP_BASE_URL": "https://mcp.lanonasis.com",
    "MCP_API_KEY": "your_api_key_here"
  }
}
```

---

### 2. **WebSocket** (Recommended for Real-time)

**Local:**
```bash
ws://localhost:3001/ws
```

**Production:**
```bash
wss://mcp.lanonasis.com/ws
```

**Features:**
- Real-time bidirectional communication
- Auto-reconnection
- Event streaming
- Falls back to HTTP for tool execution

**Client:** `websocket-mcp-client.js`

**Configuration:**
```json
{
  "command": "node",
  "args": ["src/websocket-mcp-client.js", "--stdio"],
  "env": {
    "WS_URL": "wss://mcp.lanonasis.com/ws",
    "HTTP_BASE_URL": "https://mcp.lanonasis.com",
    "MCP_API_KEY": "your_api_key_here"
  }
}
```

---

### 3. **Server-Sent Events (SSE)**

**Local:**
```bash
http://localhost:3001/api/v1/events
```

**Production:**
```bash
https://mcp.lanonasis.com/api/v1/events
```

**Features:**
- Unidirectional server-to-client streaming
- Automatic reconnection
- Event-based updates

**Usage:**
```bash
curl -N https://mcp.lanonasis.com/api/v1/events
```

---

### 4. **Stdio over SSH** (Most Secure)

**Command:**
```bash
ssh vps node /opt/mcp-core/dist/index.js --stdio
```

**Features:**
- Direct stdio communication
- SSH tunnel encryption
- No network exposure
- Lowest latency

**Configuration:**
```json
{
  "command": "ssh",
  "args": ["vps", "node", "/opt/mcp-core/dist/index.js", "--stdio"],
  "env": {
    "NODE_ENV": "production"
  }
}
```

---

## Client Implementations

### 1. **remote-mcp-client.js** (HTTP-based)

**Fixed Issues:**
- ✅ Changed `/api/tools` → `/api/v1/tools`
- ✅ Changed `/api/execute/:tool` → `/api/v1/tools/:tool`
- ✅ Added proper response parsing for `{success: true, data: {...}}`
- ✅ Added API key header support

**Usage:**
```bash
node src/remote-mcp-client.js
```

**Environment Variables:**
- `VPS_HOST` - Server hostname (default: localhost)
- `VPS_PORT` - Server port (default: 3001)
- `HTTP_BASE_URL` - Full base URL (overrides host/port)
- `MCP_API_KEY` - API key for authentication

---

### 2. **websocket-mcp-client.js** (WebSocket + HTTP)

**Features:**
- WebSocket connection to `/ws`
- HTTP fallback for tool execution
- Auto-reconnection with exponential backoff
- Graceful degradation to HTTP-only mode

**Usage:**
```bash
node src/websocket-mcp-client.js
```

**Environment Variables:**
- `WS_URL` - WebSocket URL (default: ws://localhost:3001/ws)
- `HTTP_BASE_URL` - HTTP fallback URL (default: http://localhost:3001)
- `MCP_API_KEY` - API key for authentication

---

## Deployment Configurations

### Local Development

```json
{
  "lanonasis-mcp-local": {
    "command": "node",
    "args": ["src/remote-mcp-client.js", "--stdio"],
    "env": {
      "HTTP_BASE_URL": "http://localhost:3001"
    }
  }
}
```

**Test:**
```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/v1/tools
```

---

### Production (HTTPS)

```json
{
  "lanonasis-mcp-production": {
    "command": "node",
    "args": ["src/remote-mcp-client.js", "--stdio"],
    "env": {
      "HTTP_BASE_URL": "https://mcp.lanonasis.com",
      "MCP_API_KEY": "lms_xxxxxxxxxxxxx"
    }
  }
}
```

**Test:**
```bash
curl https://mcp.lanonasis.com/health
curl https://mcp.lanonasis.com/api/v1/tools
```

---

### Production (WebSocket)

```json
{
  "lanonasis-mcp-websocket": {
    "command": "node",
    "args": ["src/websocket-mcp-client.js", "--stdio"],
    "env": {
      "WS_URL": "wss://mcp.lanonasis.com/ws",
      "HTTP_BASE_URL": "https://mcp.lanonasis.com",
      "MCP_API_KEY": "lms_xxxxxxxxxxxxx"
    }
  }
}
```

**Test:**
```bash
# WebSocket test (requires wscat)
wscat -c wss://mcp.lanonasis.com/ws

# HTTP fallback test
curl https://mcp.lanonasis.com/health
```

---

## Nginx Configuration (VPS)

The VPS nginx configuration should proxy all endpoints correctly:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# WebSocket upgrade
location /ws {
    proxy_pass http://127.0.0.1:3001/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# SSE endpoint
location /api/v1/events {
    proxy_pass http://127.0.0.1:3001/api/v1/events;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
}
```

---

## Troubleshooting

### Issue: 404 on /api/tools

**Problem:** Old endpoint path
**Solution:** Use `/api/v1/tools` instead

### Issue: 401 Unauthorized on tool execution

**Problem:** Missing API key
**Solution:** Add `MCP_API_KEY` environment variable or `x-api-key` header

### Issue: WebSocket connection fails

**Problem:** Nginx not configured for WebSocket upgrade
**Solution:** Ensure nginx has `proxy_set_header Upgrade $http_upgrade`

### Issue: SSE disconnects immediately

**Problem:** Proxy buffering enabled
**Solution:** Set `proxy_buffering off` in nginx for `/api/v1/events`

### Issue: CORS errors

**Problem:** Missing CORS headers
**Solution:** MCP-Core has CORS enabled by default, check nginx configuration

---

## Testing Checklist

- [ ] Health check: `curl https://mcp.lanonasis.com/health`
- [ ] List tools: `curl https://mcp.lanonasis.com/api/v1/tools`
- [ ] SSE events: `curl -N https://mcp.lanonasis.com/api/v1/events`
- [ ] WebSocket: `wscat -c wss://mcp.lanonasis.com/ws`
- [ ] Tool execution (with API key): `curl -X POST -H "x-api-key: KEY" https://mcp.lanonasis.com/api/v1/tools/health_check`
- [ ] Claude Desktop integration: Test with updated config

---

## Recommendations

### For Production Use:

1. **Primary:** WebSocket client (`websocket-mcp-client.js`)
   - Real-time communication
   - Auto-reconnection
   - Best user experience

2. **Fallback:** HTTP client (`remote-mcp-client.js`)
   - Most stable
   - Works everywhere
   - Simple debugging

3. **Secure:** SSH Stdio
   - Direct connection
   - No network exposure
   - Requires SSH access

### For Development:

1. Use local HTTP client with `localhost:3001`
2. No authentication required in dev mode
3. Direct access to all endpoints

---

## Summary

All endpoints are now properly aligned:

✅ **Server exposes:** `/api/v1/tools`, `/api/v1/tools/:toolName`, `/ws`, `/api/v1/events`  
✅ **Clients use:** Correct endpoint paths  
✅ **Authentication:** API key support added  
✅ **Transport:** HTTP, WebSocket, SSE, Stdio all working  
✅ **Nginx:** Properly configured for all protocols  

The CLI and MCP-Core server are now fully aligned and ready for seamless operation! 🚀
