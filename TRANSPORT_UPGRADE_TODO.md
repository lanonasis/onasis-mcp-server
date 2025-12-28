# Transport Upgrade TODO

**Created**: 2025-12-28
**Status**: Pending - For Future Implementation

## Current State

The Standalone MCP server is running `production-mcp-server.cjs` which only supports:
- **HTTP REST API** (port 3104) - ACTIVE

## Available but Not Active

The `unified-mcp-server.ts` supports additional transports that are NOT currently running:

| Transport | Port | Config Variable | Status |
|-----------|------|-----------------|--------|
| HTTP | 3104 | `PORT` | Active |
| WebSocket | 3105 | `MCP_WS_PORT` | Configured, not running |
| SSE | 3106 | `MCP_SSE_PORT` | Configured, not running |
| stdio | N/A | CLI flag `--stdio` | Available in unified server |

## To Enable Full Transport Support

### Option 1: Build and run unified-mcp-server.ts

```bash
# Build TypeScript
cd /opt/lanonasis/mcp-monorepo/packages/standalone-mcp-submodule
bun run build

# Update systemd service
sudo nano /etc/systemd/system/standalone-mcp.service
# Change ExecStart to:
ExecStart=/usr/bin/node dist/unified-mcp-server.js --http

# Or for all transports (HTTP + WebSocket + SSE):
ExecStart=/usr/bin/node dist/unified-mcp-server.js

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart standalone-mcp
```

### Option 2: Run separate transport instances

For full CRUD service separation, consider running each transport as its own PM2/systemd process:

```bash
# HTTP-only (current - for simulations)
pm2 start unified-mcp-server.js --name mcp-http -- --http

# WebSocket-only (for real-time clients)
pm2 start unified-mcp-server.js --name mcp-ws -- --ws

# SSE-only (for streaming)
pm2 start unified-mcp-server.js --name mcp-sse -- --sse
```

## Why Separate Transports?

- **HTTP**: Best for request/response, simulations, testing
- **WebSocket**: Best for bidirectional real-time communication
- **SSE**: Best for server-push events, streaming responses
- **stdio**: Best for local CLI/IDE integrations

## Related Files

- Production server: `src/production-mcp-server.cjs`
- Full server: `src/unified-mcp-server.ts`
- Systemd config: `/etc/systemd/system/standalone-mcp.service`
- PM2 ecosystem: `ecosystem.config.cjs`
