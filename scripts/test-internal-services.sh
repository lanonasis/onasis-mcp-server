#!/bin/bash

# Internal VPS Service Testing (run via SSH)
# Tests all services from within the VPS to avoid firewall issues

echo "🚀 Internal VPS Service Testing"
echo "==============================="

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

# Counters
total_tests=0
passed_tests=0
failed_tests=0

test_http() {
    local url=$1
    local name=$2
    local expected_code=${3:-200}
    
    total_tests=$((total_tests + 1))
    echo -n "🧪 Testing $name... "
    
    local code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url" 2>/dev/null || echo "000")
    
    if [ "$code" = "$expected_code" ]; then
        log_success "$name ($code)"
        passed_tests=$((passed_tests + 1))
    else
        log_error "$name - Expected $expected_code, got $code"
        failed_tests=$((failed_tests + 1))
    fi
}

test_service() {
    local service=$1
    local name=$2
    
    total_tests=$((total_tests + 1))
    echo -n "🔧 Testing $name... "
    
    if systemctl is-active "$service" >/dev/null 2>&1; then
        log_success "$name is active"
        passed_tests=$((passed_tests + 1))
    else
        log_error "$name is not active"
        failed_tests=$((failed_tests + 1))
    fi
}

test_command() {
    local cmd=$1
    local name=$2
    local expected=$3
    
    total_tests=$((total_tests + 1))
    echo -n "⚡ Testing $name... "
    
    local result=$(eval "$cmd" 2>/dev/null)
    
    if echo "$result" | grep -q "$expected"; then
        log_success "$name ($result)"
        passed_tests=$((passed_tests + 1))
    else
        log_error "$name - Expected '$expected', got '$result'"
        failed_tests=$((failed_tests + 1))
    fi
}

echo ""
log_info "Testing System Services..."
test_service "nginx" "Nginx Web Server"
test_service "redis-server" "Redis Cache"
test_service "ssh" "SSH Service"

echo ""
log_info "Testing MCP Server Endpoints..."
test_http "http://localhost:3001/health" "MCP Health Direct"
test_http "http://localhost:3001/" "MCP Server Info"
test_http "http://localhost:3001/api/tools" "MCP Tools API"
test_http "http://localhost:3001/api/adapters" "MCP Adapters API"
test_http "http://localhost:3001/metrics" "MCP Metrics"

echo ""
log_info "Testing Nginx Proxy Endpoints..."
test_http "http://localhost:8080/health" "MCP via Nginx 8080"
test_http "http://localhost:8081/health" "MCP via Nginx 8081" 
test_http "http://localhost:80/health" "MCP via Nginx 80"

echo ""
log_info "Testing Tool Execution..."
test_http "http://localhost:3001/api/execute/health_check" "Health Check Tool"
test_http "http://localhost:3001/api/execute/invalid_tool" "Invalid Tool" 404

echo ""  
log_info "Testing Error Handling..."
test_http "http://localhost:3001/nonexistent" "404 Handling" 404

echo ""
log_info "Testing Service Connections..."
test_command "redis-cli ping" "Redis Connection" "PONG"
test_command "pm2 jlist | grep -c '\"status\":\"online\"'" "PM2 Online Services" "2"

echo ""
log_info "Performance Tests..."
echo -n "🏃 Testing response time... "
start_time=$(date +%s%N)
curl -s http://localhost:3001/health >/dev/null
end_time=$(date +%s%N)
response_time=$(( (end_time - start_time) / 1000000 ))

if [ $response_time -lt 500 ]; then
    log_success "Response time: ${response_time}ms"
    passed_tests=$((passed_tests + 1))
else
    log_warning "Slow response: ${response_time}ms"
fi
total_tests=$((total_tests + 1))

echo ""
log_info "Resource Usage..."
echo "💾 Memory Usage:"
free -h | head -2

echo ""
echo "💿 Disk Usage:"
df -h / | tail -1

echo ""
echo "⚡ Load Average:"
uptime

echo ""
echo "📊 PM2 Process Status:"
pm2 status --no-color

echo ""
echo "🔍 Recent MCP Logs (last 3 lines):"
pm2 logs lanonasis-mcp-server --lines 3 --no-color 2>/dev/null | tail -3

echo ""
echo "📋 FINAL RESULTS"
echo "================"
echo "Total Tests: $total_tests"
echo "Passed: $passed_tests" 
echo "Failed: $failed_tests"

if [ $total_tests -gt 0 ]; then
    success_rate=$(( passed_tests * 100 / total_tests ))
    echo "Success Rate: ${success_rate}%"
fi

echo ""
if [ $failed_tests -eq 0 ]; then
    log_success "🎉 All services are fully operational!"
    echo ""
    echo "🔗 Available Endpoints (internal):"
    echo "  • Health: http://localhost:3001/health"
    echo "  • API: http://localhost:3001/api/tools"  
    echo "  • Metrics: http://localhost:3001/metrics"
    echo "  • Nginx Proxy: http://localhost:8080/health"
    exit 0
else
    log_error "⚠️ Some services have issues."
    echo ""
    echo "🔧 Suggested fixes:"
    echo "  • Check logs: pm2 logs lanonasis-mcp-server"
    echo "  • Restart services: pm2 restart all"
    echo "  • Check nginx: nginx -t && systemctl restart nginx"
    exit 1
fi