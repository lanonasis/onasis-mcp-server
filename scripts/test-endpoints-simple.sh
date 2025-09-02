#!/bin/bash

# Simple VPS Service Endpoint Testing
# Compatible with all shell versions

set -e

# Variables
VPS_HOST="168.231.74.29"
TIMEOUT=10

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
total_tests=0
passed_tests=0
failed_tests=0

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_test() { echo -e "${BLUE}🧪 Testing: $1${NC}"; }

# Test function
test_endpoint() {
    local url=$1
    local description=$2
    local expected_code=${3:-200}
    
    total_tests=$((total_tests + 1))
    log_test "$description"
    
    local response_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout $TIMEOUT --max-time $TIMEOUT "$url" 2>/dev/null || echo "000")
    
    if [ "$response_code" = "$expected_code" ]; then
        log_success "$description ($response_code)"
        passed_tests=$((passed_tests + 1))
    else
        log_error "$description - Expected $expected_code, got $response_code"
        failed_tests=$((failed_tests + 1))
    fi
}

echo "🚀 VPS Service Testing"
echo "Target: $VPS_HOST"
echo "====================="

# Basic connectivity
log_info "Testing basic connectivity..."
if ping -c 1 -W $TIMEOUT $VPS_HOST >/dev/null 2>&1; then
    log_success "VPS is reachable"
else
    log_error "VPS is not reachable"
    exit 1
fi

# SSH connectivity
if ssh vps "echo 'SSH OK'" >/dev/null 2>&1; then
    log_success "SSH connection working"
else
    log_error "SSH connection failed"
    exit 1
fi

echo ""
echo "🌐 Testing HTTP Endpoints"
echo "========================="

# Test main endpoints
test_endpoint "http://$VPS_HOST:3001/health" "MCP Server Health (Direct)" 200
test_endpoint "http://$VPS_HOST:3001/" "MCP Server Info" 200
test_endpoint "http://$VPS_HOST:3001/api/tools" "MCP API Tools" 200
test_endpoint "http://$VPS_HOST:3001/api/adapters" "MCP API Adapters" 200
test_endpoint "http://$VPS_HOST:3001/metrics" "MCP Server Metrics" 200

# Test nginx proxy endpoints
test_endpoint "http://$VPS_HOST:8080/health" "MCP via Nginx 8080" 200
test_endpoint "http://$VPS_HOST:8081/health" "MCP via Nginx 8081" 200
test_endpoint "http://$VPS_HOST:80/health" "MCP via Nginx 80" 200

# Test tool execution
test_endpoint "http://$VPS_HOST:3001/api/execute/health_check" "Execute Health Check" 200
test_endpoint "http://$VPS_HOST:3001/api/execute/invalid_tool" "Execute Invalid Tool" 404

# Test error handling  
test_endpoint "http://$VPS_HOST:3001/nonexistent" "404 Error Handling" 404

echo ""
echo "🔧 Testing System Services via SSH"
echo "=================================="

# Test system services
log_test "Nginx Service"
if ssh vps "systemctl is-active nginx" | grep -q "active"; then
    log_success "Nginx service is active"
    passed_tests=$((passed_tests + 1))
else
    log_error "Nginx service issue"
    failed_tests=$((failed_tests + 1))
fi
total_tests=$((total_tests + 1))

log_test "Redis Service"  
if ssh vps "systemctl is-active redis-server" | grep -q "active"; then
    log_success "Redis service is active"
    passed_tests=$((passed_tests + 1))
else
    log_error "Redis service issue"
    failed_tests=$((failed_tests + 1))
fi
total_tests=$((total_tests + 1))

log_test "PM2 MCP Service"
if ssh vps "pm2 jlist 2>/dev/null | grep -q 'lanonasis-mcp-server' && pm2 jlist 2>/dev/null | grep -q '\"status\":\"online\"'"; then
    log_success "PM2 MCP service is online"
    passed_tests=$((passed_tests + 1))
else
    log_error "PM2 MCP service issue"
    failed_tests=$((failed_tests + 1))
fi
total_tests=$((total_tests + 1))

log_test "Redis Connection"
if ssh vps "redis-cli ping 2>/dev/null" | grep -q "PONG"; then
    log_success "Redis connection working"
    passed_tests=$((passed_tests + 1))
else
    log_error "Redis connection failed"
    failed_tests=$((failed_tests + 1))
fi
total_tests=$((total_tests + 1))

echo ""
echo "📊 RESULTS SUMMARY"
echo "=================="
echo "Total Tests: $total_tests"  
echo "Passed: $passed_tests"
echo "Failed: $failed_tests"
if [ $total_tests -gt 0 ]; then
    echo "Success Rate: $(( passed_tests * 100 / total_tests ))%"
fi

echo ""
if [ $failed_tests -eq 0 ]; then
    log_success "🎉 All tests passed! VPS services are fully operational."
    
    echo ""
    echo "🔍 Service Details:"
    echo "=================="
    ssh vps "echo '📊 PM2 Status:' && pm2 status --no-color 2>/dev/null | head -10"
    echo ""
    ssh vps "echo '💾 System Resources:' && free -h | head -2 && df -h / | tail -1"
    echo ""
    ssh vps "echo '🌐 Health Response:' && curl -s http://localhost:3001/health | head -1"
    
    exit 0
else
    log_error "⚠️ $failed_tests test(s) failed."
    
    echo ""
    echo "🔧 Diagnostics:"
    echo "=============="
    ssh vps "echo '📊 PM2 Status:' && pm2 status --no-color 2>/dev/null || echo 'PM2 issue'"
    ssh vps "echo '🔍 Recent logs:' && pm2 logs lanonasis-mcp-server --lines 5 --no-color 2>/dev/null || echo 'Log issue'"
    
    exit 1
fi