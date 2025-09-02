#!/bin/bash

# Comprehensive VPS Service Endpoint Testing
# Tests all active services and endpoints for functionality and performance

set -e

# Variables
VPS_HOST="168.231.74.29"
PORTS_TO_TEST=(80 3001 8080 8081)
TIMEOUT=10

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_test() { echo -e "${CYAN}🧪 Testing: $1${NC}"; }

# Test results tracking
declare -A results
total_tests=0
passed_tests=0
failed_tests=0

# Function to test HTTP endpoint
test_http_endpoint() {
    local url=$1
    local description=$2
    local expected_code=${3:-200}
    
    total_tests=$((total_tests + 1))
    log_test "$description - $url"
    
    # Test with curl
    local start_time=$(date +%s%N)
    local response_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout $TIMEOUT --max-time $TIMEOUT "$url" 2>/dev/null || echo "000")
    local end_time=$(date +%s%N)
    local response_time=$(( (end_time - start_time) / 1000000 ))
    
    if [ "$response_code" = "$expected_code" ]; then
        log_success "$description (${response_time}ms)"
        results["$description"]="✅ $response_code (${response_time}ms)"
        passed_tests=$((passed_tests + 1))
        return 0
    else
        log_error "$description - Expected $expected_code, got $response_code"
        results["$description"]="❌ $response_code"
        failed_tests=$((failed_tests + 1))
        return 1
    fi
}

# Function to test JSON endpoint and validate structure
test_json_endpoint() {
    local url=$1
    local description=$2
    local required_field=$3
    
    total_tests=$((total_tests + 1))
    log_test "$description - $url"
    
    local start_time=$(date +%s%N)
    local response=$(curl -s --connect-timeout $TIMEOUT --max-time $TIMEOUT "$url" 2>/dev/null)
    local end_time=$(date +%s%N)
    local response_time=$(( (end_time - start_time) / 1000000 ))
    
    if [ -n "$response" ] && echo "$response" | jq -e ".$required_field" >/dev/null 2>&1; then
        local value=$(echo "$response" | jq -r ".$required_field")
        log_success "$description - $required_field: $value (${response_time}ms)"
        results["$description"]="✅ Valid JSON (${response_time}ms)"
        passed_tests=$((passed_tests + 1))
        return 0
    else
        log_error "$description - Invalid JSON or missing $required_field"
        results["$description"]="❌ Invalid response"
        failed_tests=$((failed_tests + 1))
        return 1
    fi
}

# Function to test service availability via SSH
test_ssh_service() {
    local service=$1
    local description=$2
    
    total_tests=$((total_tests + 1))
    log_test "$description"
    
    local status=$(ssh vps "systemctl is-active $service 2>/dev/null || echo 'inactive'")
    
    if [ "$status" = "active" ]; then
        log_success "$description - Service is active"
        results["$description"]="✅ Active"
        passed_tests=$((passed_tests + 1))
        return 0
    else
        log_error "$description - Service is $status"
        results["$description"]="❌ $status"
        failed_tests=$((failed_tests + 1))
        return 1
    fi
}

echo "🚀 Starting Comprehensive VPS Service Testing"
echo "Target: $VPS_HOST"
echo "Timeout: ${TIMEOUT}s per test"
echo "======================================"

# Test 1: Basic connectivity
log_info "Testing basic connectivity..."
if ping -c 1 -W $TIMEOUT $VPS_HOST >/dev/null 2>&1; then
    log_success "VPS is reachable"
else
    log_error "VPS is not reachable"
    exit 1
fi

# Test 2: SSH connectivity
log_info "Testing SSH connectivity..."
if ssh vps "echo 'SSH connection successful'" >/dev/null 2>&1; then
    log_success "SSH connection working"
else
    log_error "SSH connection failed"
    exit 1
fi

echo ""
echo "🔧 Testing System Services..."
echo "=============================="

# Test system services
test_ssh_service "nginx" "Nginx Web Server"
test_ssh_service "redis-server" "Redis Cache Server"
test_ssh_service "ssh" "SSH Service"

echo ""
echo "🌐 Testing HTTP Endpoints..."
echo "============================"

# Test direct MCP server endpoints
test_json_endpoint "http://$VPS_HOST:3001/health" "MCP Server Health (Direct)" "status"
test_json_endpoint "http://$VPS_HOST:3001/" "MCP Server Info" "name"
test_json_endpoint "http://$VPS_HOST:3001/api/tools" "MCP API Tools" "tools"
test_json_endpoint "http://$VPS_HOST:3001/api/adapters" "MCP API Adapters" "adapters"
test_json_endpoint "http://$VPS_HOST:3001/metrics" "MCP Server Metrics" "server"

# Test nginx proxy endpoints
test_json_endpoint "http://$VPS_HOST:8080/health" "MCP Health via Nginx 8080" "status"
test_json_endpoint "http://$VPS_HOST:8081/health" "MCP Health via Nginx 8081" "status"
test_json_endpoint "http://$VPS_HOST:80/health" "MCP Health via Nginx 80" "status"

echo ""
echo "🧠 Testing MCP Tool Execution..."
echo "==============================="

# Test tool execution endpoints
test_http_endpoint "http://$VPS_HOST:3001/api/execute/health_check" "Execute Health Check Tool" 200
test_http_endpoint "http://$VPS_HOST:3001/api/execute/nonexistent_tool" "Execute Invalid Tool" 404

echo ""
echo "🔍 Testing Error Handling..."
echo "============================"

# Test 404 handling
test_http_endpoint "http://$VPS_HOST:3001/nonexistent/path" "404 Error Handling" 404

echo ""
echo "⚡ Testing Performance & Load..."
echo "==============================="

# Performance test - multiple concurrent requests
log_test "Concurrent request handling"
start_time=$(date +%s)

# Make 5 concurrent requests
for i in {1..5}; do
    curl -s "http://$VPS_HOST:3001/health" >/dev/null &
done
wait

end_time=$(date +%s)
duration=$((end_time - start_time))

if [ $duration -lt 5 ]; then
    log_success "Concurrent requests handled efficiently (${duration}s)"
    results["Concurrent Requests"]="✅ ${duration}s"
    passed_tests=$((passed_tests + 1))
else
    log_warning "Concurrent requests took longer than expected (${duration}s)"
    results["Concurrent Requests"]="⚠️ ${duration}s"
fi
total_tests=$((total_tests + 1))

echo ""
echo "📊 Testing Service Status via SSH..."
echo "==================================="

# Test PM2 services
log_test "PM2 Service Status"
pm2_output=$(ssh vps "pm2 jlist 2>/dev/null | jq -r '.[] | select(.name==\"lanonasis-mcp-server\") | .pm2_env.status' 2>/dev/null || echo 'not_found'")
if [ "$pm2_output" = "online" ]; then
    log_success "PM2 MCP Server is online"
    results["PM2 MCP Service"]="✅ Online"
    passed_tests=$((passed_tests + 1))
else
    log_error "PM2 MCP Server status: $pm2_output"
    results["PM2 MCP Service"]="❌ $pm2_output"
    failed_tests=$((failed_tests + 1))
fi
total_tests=$((total_tests + 1))

# Test Redis connection
log_test "Redis Connection"
redis_test=$(ssh vps "redis-cli ping 2>/dev/null || echo 'FAILED'")
if [ "$redis_test" = "PONG" ]; then
    log_success "Redis connection working"
    results["Redis Connection"]="✅ PONG"
    passed_tests=$((passed_tests + 1))
else
    log_error "Redis connection failed: $redis_test"
    results["Redis Connection"]="❌ $redis_test"
    failed_tests=$((failed_tests + 1))
fi
total_tests=$((total_tests + 1))

echo ""
echo "📋 TEST RESULTS SUMMARY"
echo "======================="
echo "Total Tests: $total_tests"
echo "Passed: $passed_tests"
echo "Failed: $failed_tests"
echo "Success Rate: $(( passed_tests * 100 / total_tests ))%"
echo ""

# Display detailed results
echo "📊 DETAILED RESULTS:"
echo "==================="
for test in "${!results[@]}"; do
    echo "  $test: ${results[$test]}"
done

echo ""

if [ $failed_tests -eq 0 ]; then
    log_success "🎉 All tests passed! VPS services are fully operational."
    exit 0
else
    log_warning "⚠️ $failed_tests test(s) failed. Review the results above."
    
    # Show recommendations
    echo ""
    echo "🔧 RECOMMENDATIONS:"
    echo "=================="
    echo "• Check PM2 logs: ssh vps 'pm2 logs lanonasis-mcp-server'"
    echo "• Restart services: ssh vps 'pm2 restart all && systemctl restart nginx'"
    echo "• Check nginx config: ssh vps 'nginx -t'"
    echo "• Monitor resources: ssh vps 'htop'"
    
    exit 1
fi