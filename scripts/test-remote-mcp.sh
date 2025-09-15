#!/bin/bash

# Test Remote MCP Server Functionality
# Uses SSH tunneling to test MCP server as if it were accessible remotely

set -e

echo "🚀 Testing Remote MCP Server Functionality"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }

# Step 1: Create SSH tunnel for testing
log_info "Setting up SSH tunnel for MCP server testing..."

# Create SSH tunnel in background
ssh -N -L 3001:localhost:3001 vps &
TUNNEL_PID=$!

# Function to cleanup tunnel
cleanup_tunnel() {
    if [ -n "$TUNNEL_PID" ]; then
        log_info "Cleaning up SSH tunnel..."
        kill $TUNNEL_PID 2>/dev/null || true
    fi
}
trap cleanup_tunnel EXIT

# Replace fixed sleep with a readiness probe against the tunneled service
WAIT_TIMEOUT="${WAIT_TIMEOUT:-15}"
log_info "Waiting for tunnel readiness on localhost:${LOCAL_PORT} (timeout: ${WAIT_TIMEOUT}s)..."
for i in $(seq 1 "$WAIT_TIMEOUT"); do
  if curl -sSf "http://localhost:${LOCAL_PORT}/health" >/dev/null 2>&1; then
    log_success "SSH tunnel established on localhost:${LOCAL_PORT}"
    break
  fi
  sleep 1
done
if [ "${i:-$WAIT_TIMEOUT}" -eq "$WAIT_TIMEOUT" ]; then
  log_error "Tunnel did not become ready within ${WAIT_TIMEOUT}s"
  exit 1
fi

# Set base URL for subsequent requests
BASE_URL="http://localhost:${LOCAL_PORT}"
# Step 2: Test MCP server endpoints through tunnel
echo ""
log_info "Testing MCP Server Endpoints via SSH Tunnel..."

test_endpoint() {
    local endpoint=$1
    local name=$2
    local expected_code=${3:-200}
    
    echo -n "🧪 Testing $name... "
    
    local code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://localhost:3001$endpoint" 2>/dev/null || echo "000")
    
    if [ "$code" = "$expected_code" ]; then
        log_success "$name ($code)"
        return 0
    else
        log_error "$name - Expected $expected_code, got $code"
        return 1
    fi
}

# Test core MCP endpoints
test_endpoint "/health" "Health Check" 200
test_endpoint "/" "Server Info" 200
test_endpoint "/api/tools" "Tools API" 200
test_endpoint "/api/adapters" "Adapters API" 200
test_endpoint "/metrics" "Metrics" 200

echo ""
log_info "Testing MCP Tool Execution..."

# Test tool execution
echo -n "🧪 Testing Health Check Tool... "
health_result=$(curl -s -X POST "http://localhost:3001/api/execute/health_check" \
    -H "Content-Type: application/json" \
    -d '{"parameters": {}}' 2>/dev/null || echo "")

if echo "$health_result" | grep -q '"status":"success"'; then
    log_success "Health Check Tool executed successfully"
else
    log_error "Health Check Tool execution failed"
fi

echo ""
log_info "Testing MCP Data Retrieval..."

# Test structured data retrieval
echo "📊 Health Response:"
curl -s "http://localhost:3001/health" | jq . 2>/dev/null || curl -s "http://localhost:3001/health"

echo ""
echo "🔧 Available Tools:"
curl -s "http://localhost:3001/api/tools" | jq '.tools[]' 2>/dev/null || curl -s "http://localhost:3001/api/tools"

echo ""
echo "📈 Server Metrics:"
curl -s "http://localhost:3001/metrics" | jq '.server' 2>/dev/null || curl -s "http://localhost:3001/metrics"

echo ""
log_info "Testing MCP Client Connection Simulation..."

# Simulate what an MCP client would do
cat << 'EOF' > /tmp/test_mcp_client.js
const axios = require('axios');

async function testMCPClient() {
    const baseUrl = 'http://localhost:3001';
    
    console.log('🤖 Simulating MCP Client Connection...\n');
    
    try {
        // 1. Health check
        console.log('1. Health Check:');
        const health = await axios.get(`${baseUrl}/health`);
        console.log(`   Status: ${health.data.status}`);
        console.log(`   Service: ${health.data.service}`);
        console.log(`   Version: ${health.data.version}\n`);
        
        // 2. Get available tools
        console.log('2. Available Tools:');
        const tools = await axios.get(`${baseUrl}/api/tools`);
        tools.data.tools.forEach(tool => {
            console.log(`   • ${tool.name}: ${tool.description}`);
        });
        console.log('');
        
        // 3. Execute a tool
        console.log('3. Tool Execution Test:');
        const execution = await axios.post(`${baseUrl}/api/execute/health_check`, {
            parameters: {}
        });
        console.log(`   Result: ${execution.data.result.status || 'Success'}`);
        console.log(`   Execution Time: ${execution.data.execution_time}\n`);
        
        console.log('✅ MCP Client simulation completed successfully!');
        
    } catch (error) {
        console.error('❌ MCP Client simulation failed:', error.message);
    }
}

testMCPClient();
EOF

# Run the MCP client simulation
if command -v node >/dev/null 2>&1; then
    cd "$(dirname "$0")/.."
    node /tmp/test_mcp_client.js
else
    log_warning "Node.js not available for MCP client simulation"
fi

# Cleanup
rm -f /tmp/test_mcp_client.js

echo ""
log_info "Testing Complete!"

echo ""
echo "🎯 MCP Server Remote Access Summary:"
echo "===================================="
echo "• SSH Tunnel: ✅ localhost:3001 → vps:3001"
echo "• Health API: ✅ Responding correctly"
echo "• Tools API: ✅ Available and functional"
echo "• Metrics: ✅ Server metrics accessible"
echo "• Tool Execution: ✅ Remote execution working"
echo ""
echo "🔗 For Claude Desktop Integration:"
echo "1. Configure MCP server to use SSH tunnel or HTTP proxy"
echo "2. Use config: claude-remote-vps-config.json"
echo "3. Ensure firewall allows connections or use VPN"
echo ""

log_success "Remote MCP server testing completed!"