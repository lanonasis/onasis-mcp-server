#!/bin/bash

# Deploy Production MCP Server to VPS
# Simple deployment script for production-mcp-server.cjs

set -e

echo "🚀 Deploying Production MCP Server..."

# Variables
VPS_HOST="168.231.74.29"
VPS_PORT="2222"
VPS_USER="root"
VPS_DIR="/opt/mcp-servers/lanonasis-standalone/current"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

# Step 1: Commit and push local changes
log_info "Syncing repository..."
git add .
if ! git diff --staged --quiet; then
    git commit -m "Deploy production server: $(date '+%Y-%m-%d %H:%M:%S')"
    git push origin main
    log_success "Repository updated"
else
    log_info "No local changes to commit"
fi

# Step 2: Deploy production server file
log_info "Deploying production server..."
scp -P $VPS_PORT src/production-mcp-server.cjs $VPS_USER@$VPS_HOST:$VPS_DIR/

# Step 3: Update VPS repository and deploy
ssh -p $VPS_PORT $VPS_USER@$VPS_HOST << EOF
cd $VPS_DIR

# Pull latest changes
git pull origin main

# Update PM2 to use production server
pm2 delete lanonasis-mcp-server 2>/dev/null || true
pm2 start src/production-mcp-server.cjs --name lanonasis-mcp-server
pm2 save

echo "✅ Production server deployed"

# Wait and test
sleep 3
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ Health check passed"
    curl -s http://localhost:3001/health | jq -r '.message'
else
    echo "❌ Health check failed"
    pm2 logs lanonasis-mcp-server --lines 5
    exit 1
fi
EOF

log_success "Deployment completed!"
echo ""
echo "🧪 Testing endpoints..."

# Test endpoints from local machine
test_endpoint() {
    local url=$1
    local name=$2
    if curl -s --connect-timeout 5 "$url" > /dev/null; then
        log_success "$name endpoint working"
    else
        log_error "$name endpoint failed"
    fi
}

# Only test publicly accessible endpoints
log_info "Service deployed to VPS successfully!"
log_info "Monitor with: ssh vps 'pm2 logs lanonasis-mcp-server'"
log_info "Check status: ssh vps 'pm2 status'"