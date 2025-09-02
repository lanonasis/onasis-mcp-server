# Claude Desktop MCP Integration Guide

## Overview
This guide explains how to integrate the Lanonasis MCP Server with Claude Desktop.

## Option 1: SSH Tunnel Method (Recommended)

### Configuration
Add this to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "lanonasis-tunnel": {
      "command": "node",
      "args": [
        "/Users/seyederick/DevOps/_project_folders/onasis-mcp-standalone/src/tunnel-mcp-client.js"
      ],
      "env": {
        "TUNNEL_PORT": "3001",
        "VPS_HOST": "vps"
      }
    }
  }
}
```

### How it works:
1. Creates SSH tunnel: `vps:3001 → localhost:3001`
2. Provides MCP protocol interface to Claude
3. Forwards all tool calls to production server
4. Returns structured responses

## Option 2: Direct SSH Method

```json
{
  "mcpServers": {
    "lanonasis-direct": {
      "command": "ssh",
      "args": [
        "vps",
        "node",
        "/opt/mcp-servers/lanonasis-standalone/current/src/production-mcp-server.cjs",
        "--stdio"
      ]
    }
  }
}
```

## Available Tools

1. **health_check** - Check server health status
2. **search_memories** - Search through stored memories
3. **create_memory** - Create new memories
4. **get_metrics** - Get server performance metrics

## Testing the Integration

1. Save configuration to Claude Desktop settings
2. Restart Claude Desktop
3. Verify connection in Claude Desktop logs
4. Test with: "Can you check the health of the MCP server?"

## Troubleshooting

- Ensure SSH key access to VPS is configured
- Check that port 3001 is not in use locally
- Verify VPS server is running: `ssh vps "pm2 status"`
- Check tunnel: `ssh vps -L 3001:localhost:3001`

## Security Notes

- All communication is encrypted via SSH tunnel
- No direct internet exposure of MCP server
- VPS firewall provides additional protection
- Authentication handled by SSH keys
