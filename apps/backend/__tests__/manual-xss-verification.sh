#!/bin/bash
# Manual XSS verification script for Issue #96
# This script tests that XSS payloads are NOT reflected in 404 responses

echo "🔒 Testing XSS Prevention in 404 Responses"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3001"

# Test payloads from the issue
PAYLOADS=(
    "/%3Csvg%2Fonload%3Dalert(1)%3E"
    "/%22%3E%3C%2Fscript%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E"
    "/%27%3E%3Cimg%20src%3D%22x%22%3E"
    "/<svg/onload=alert(1)>"
    "/\"><script>alert(1)</script>"
)

echo "Testing ${#PAYLOADS[@]} XSS payloads..."
echo ""

PASS_COUNT=0
FAIL_COUNT=0

for payload in "${PAYLOADS[@]}"; do
    echo "Testing: $payload"
    
    # Get response
    RESPONSE=$(curl -s "${BASE_URL}${payload}")
    CONTENT_TYPE=$(curl -sI "${BASE_URL}${payload}" | grep -i "content-type:" | tr -d '\r')
    
    # Check 1: Response should be JSON
    if echo "$CONTENT_TYPE" | grep -q "application/json"; then
        echo -e "  ${GREEN}✓${NC} Content-Type is application/json"
    else
        echo -e "  ${RED}✗${NC} Content-Type is NOT application/json: $CONTENT_TYPE"
        ((FAIL_COUNT++))
        continue
    fi
    
    # Check 2: Response should be the standard error object
    if [ "$RESPONSE" = '{"error":"Not Found","code":"NOT_FOUND"}' ]; then
        echo -e "  ${GREEN}✓${NC} Response is correct error format"
    else
        echo -e "  ${RED}✗${NC} Response format unexpected: $RESPONSE"
        ((FAIL_COUNT++))
        continue
    fi
    
    # Check 3: Response should NOT contain any part of the payload
    if echo "$RESPONSE" | grep -q -E "(svg|script|img|alert|onload)"; then
        echo -e "  ${RED}✗${NC} Response contains payload fragments (VULNERABLE!)"
        ((FAIL_COUNT++))
        continue
    else
        echo -e "  ${GREEN}✓${NC} Payload NOT reflected in response"
    fi
    
    ((PASS_COUNT++))
    echo ""
done

echo "=========================================="
echo ""
echo "Results:"
echo -e "  ${GREEN}Passed:${NC} $PASS_COUNT/${#PAYLOADS[@]}"
echo -e "  ${RED}Failed:${NC} $FAIL_COUNT/${#PAYLOADS[@]}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ All XSS tests passed! The vulnerability is fixed.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. XSS vulnerability may still exist.${NC}"
    exit 1
fi
