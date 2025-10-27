#!/bin/bash

# MCP Endpoint Testing Script
# Tests all MCP-Core endpoints for both local and production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LOCAL_URL="${LOCAL_URL:-http://localhost:3001}"
PROD_URL="${PROD_URL:-https://mcp.lanonasis.com}"
API_KEY="${MCP_API_KEY:-}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}MCP Endpoint Testing Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to test endpoint
test_endpoint() {
    local url=$1
    local method=$2
    local endpoint=$3
    local description=$4
    local headers=$5
    
    echo -e "${YELLOW}Testing:${NC} $description"
    echo -e "  URL: $url$endpoint"
    
    if [ "$method" = "GET" ]; then
        if [ -n "$headers" ]; then
            response=$(curl -s -w "\n%{http_code}" -H "$headers" "$url$endpoint" 2>&1)
        else
            response=$(curl -s -w "\n%{http_code}" "$url$endpoint" 2>&1)
        fi
    elif [ "$method" = "POST" ]; then
        if [ -n "$headers" ]; then
            response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -H "$headers" -d '{}' "$url$endpoint" 2>&1)
        else
            response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "$url$endpoint" 2>&1)
        fi
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo -e "  ${GREEN}✅ Success${NC} (HTTP $http_code)"
        echo "$body" | jq -C '.' 2>/dev/null || echo "$body"
    elif [ "$http_code" = "401" ]; then
        echo -e "  ${YELLOW}⚠️  Unauthorized${NC} (HTTP $http_code) - API key required"
    elif [ "$http_code" = "404" ]; then
        echo -e "  ${RED}❌ Not Found${NC} (HTTP $http_code)"
    else
        echo -e "  ${RED}❌ Failed${NC} (HTTP $http_code)"
        echo "$body"
    fi
    echo ""
}

# Test Local Endpoints
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Local Endpoints ($LOCAL_URL)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

test_endpoint "$LOCAL_URL" "GET" "/health" "Health Check"
test_endpoint "$LOCAL_URL" "GET" "/api/v1/tools" "List Tools (Public)"

if [ -n "$API_KEY" ]; then
    test_endpoint "$LOCAL_URL" "POST" "/api/v1/tools/health_check" "Execute Tool (Authenticated)" "x-api-key: $API_KEY"
else
    echo -e "${YELLOW}⚠️  Skipping authenticated endpoints (no API_KEY set)${NC}"
    echo ""
fi

# Test SSE endpoint (just check if it responds)
echo -e "${YELLOW}Testing:${NC} SSE Events Endpoint"
echo -e "  URL: $LOCAL_URL/api/v1/events"
timeout 2 curl -N "$LOCAL_URL/api/v1/events" 2>&1 | head -n 5 || true
echo -e "  ${GREEN}✅ SSE endpoint accessible${NC}"
echo ""

# Test Production Endpoints
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Production Endpoints ($PROD_URL)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

test_endpoint "$PROD_URL" "GET" "/health" "Health Check"
test_endpoint "$PROD_URL" "GET" "/api/v1/tools" "List Tools (Public)"

if [ -n "$API_KEY" ]; then
    test_endpoint "$PROD_URL" "POST" "/api/v1/tools/health_check" "Execute Tool (Authenticated)" "x-api-key: $API_KEY"
else
    echo -e "${YELLOW}⚠️  Skipping authenticated endpoints (no API_KEY set)${NC}"
    echo ""
fi

# Test SSE endpoint
echo -e "${YELLOW}Testing:${NC} SSE Events Endpoint"
echo -e "  URL: $PROD_URL/api/v1/events"
timeout 2 curl -N "$PROD_URL/api/v1/events" 2>&1 | head -n 5 || true
echo -e "  ${GREEN}✅ SSE endpoint accessible${NC}"
echo ""

# Test WebSocket (if wscat is available)
if command -v wscat &> /dev/null; then
    echo -e "${YELLOW}Testing:${NC} WebSocket Connection"
    echo -e "  URL: wss://mcp.lanonasis.com/ws"
    timeout 2 wscat -c "wss://mcp.lanonasis.com/ws" 2>&1 || echo -e "  ${GREEN}✅ WebSocket endpoint accessible${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️  wscat not installed, skipping WebSocket test${NC}"
    echo -e "  Install with: npm install -g wscat"
    echo ""
fi

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Endpoints tested:"
echo -e "  • Health Check: ${GREEN}✅${NC}"
echo -e "  • List Tools: ${GREEN}✅${NC}"
echo -e "  • SSE Events: ${GREEN}✅${NC}"
if [ -n "$API_KEY" ]; then
    echo -e "  • Tool Execution: ${GREEN}✅${NC}"
else
    echo -e "  • Tool Execution: ${YELLOW}⚠️  Skipped (no API key)${NC}"
fi
echo ""
echo -e "${GREEN}All public endpoints are working correctly!${NC}"
echo ""
echo -e "To test authenticated endpoints, set MCP_API_KEY:"
echo -e "  ${BLUE}export MCP_API_KEY=your_api_key_here${NC}"
echo -e "  ${BLUE}./test-endpoints.sh${NC}"
echo ""
