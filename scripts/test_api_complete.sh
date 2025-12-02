#!/bin/bash
#
# Comprehensive API Test Suite
# Tests all GitRay API endpoints after refactoring
#

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

BASE_URL="http://localhost:3001"
REPO_URL="https://github.com/jonasyr/gitray.git"

TOTAL=0
PASSED=0
FAILED=0

echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║   Comprehensive API Test Suite for GitRay                     ║${NC}"
echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Repository: $REPO_URL"
echo "Base URL: $BASE_URL"
echo ""

# Clear cache and stale locks
echo -e "${YELLOW}► Clearing cache and locks...${NC}"
rm -rf apps/backend/cache/* 2>/dev/null || true
rm -rf apps/backend/locks/* 2>/dev/null || true
echo -e "${GREEN}  ✓ Cache and locks cleared${NC}"
echo ""

# Test function
test_api() {
    local name="$1"
    local url="$2"
    local expect_status="${3:-200}"
    
    TOTAL=$((TOTAL + 1))
    
    echo -e "${CYAN}► Test $TOTAL: ${name}${NC}"
    
    # Make request
    local temp_file=$(mktemp)
    local http_code=$(curl -s -w "%{http_code}" -o "$temp_file" "$url")
    local body=$(cat "$temp_file")
    rm -f "$temp_file"
    
    # Check status
    if [[ "$http_code" != "$expect_status" ]]; then
        echo -e "${RED}  ✗ FAIL: HTTP $http_code (expected $expect_status)${NC}"
        echo "  Response: $body" | head -c 200
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Validate JSON (only if expecting 200)
    if [[ "$expect_status" == "200" ]]; then
        if echo "$body" | python3 -m json.tool >/dev/null 2>&1; then
            echo -e "${GREEN}  ✓ PASS: HTTP $http_code, Valid JSON${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}  ✗ FAIL: Invalid JSON response${NC}"
            echo "  Response: $body" | head -c 200
            FAILED=$((FAILED + 1))
            return 1
        fi
    else
        echo -e "${GREEN}  ✓ PASS: HTTP $http_code (error scenario)${NC}"
        PASSED=$((PASSED + 1))
    fi
}

# REFACTORED ROUTES
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TESTING REFACTORED ROUTES (handleFilteredRoute helper)${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${BOLD}1. HEATMAP ROUTE${NC}"
test_api "Heatmap - No filters" \
    "${BASE_URL}/api/repositories/heatmap?repoUrl=${REPO_URL}"

test_api "Heatmap - From date" \
    "${BASE_URL}/api/repositories/heatmap?repoUrl=${REPO_URL}&fromDate=2024-01-01"

test_api "Heatmap - Date range" \
    "${BASE_URL}/api/repositories/heatmap?repoUrl=${REPO_URL}&fromDate=2024-01-01&toDate=2024-12-31"

test_api "Heatmap - With author" \
    "${BASE_URL}/api/repositories/heatmap?repoUrl=${REPO_URL}&author=jonas"

echo ""
echo -e "${BOLD}2. CONTRIBUTORS ROUTE${NC}"
test_api "Contributors - No filters" \
    "${BASE_URL}/api/repositories/contributors?repoUrl=${REPO_URL}"

test_api "Contributors - From date" \
    "${BASE_URL}/api/repositories/contributors?repoUrl=${REPO_URL}&fromDate=2024-01-01"

test_api "Contributors - Date range" \
    "${BASE_URL}/api/repositories/contributors?repoUrl=${REPO_URL}&fromDate=2024-01-01&toDate=2024-12-31"

echo ""
echo -e "${BOLD}3. CHURN ROUTE${NC}"
test_api "Churn - No filters" \
    "${BASE_URL}/api/repositories/churn?repoUrl=${REPO_URL}"

test_api "Churn - From date" \
    "${BASE_URL}/api/repositories/churn?repoUrl=${REPO_URL}&fromDate=2024-01-01"

test_api "Churn - Min changes" \
    "${BASE_URL}/api/repositories/churn?repoUrl=${REPO_URL}&minChanges=10"

test_api "Churn - Extensions" \
    "${BASE_URL}/api/repositories/churn?repoUrl=${REPO_URL}&extensions=ts,tsx"

test_api "Churn - All filters" \
    "${BASE_URL}/api/repositories/churn?repoUrl=${REPO_URL}&fromDate=2024-01-01&minChanges=5&extensions=ts"

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TESTING NON-REFACTORED ROUTES (Regression Check)${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${BOLD}4. FULL-DATA ROUTE${NC}"
test_api "Full-data - Default" \
    "${BASE_URL}/api/repositories/full-data?repoUrl=${REPO_URL}"

test_api "Full-data - With pagination" \
    "${BASE_URL}/api/repositories/full-data?repoUrl=${REPO_URL}&page=1&limit=10"

test_api "Full-data - With filters" \
    "${BASE_URL}/api/repositories/full-data?repoUrl=${REPO_URL}&fromDate=2024-01-01&page=1&limit=5"

echo ""
echo -e "${BOLD}5. COMMITS ROUTE${NC}"
test_api "Commits - Default" \
    "${BASE_URL}/api/repositories/commits?repoUrl=${REPO_URL}"

test_api "Commits - With pagination" \
    "${BASE_URL}/api/repositories/commits?repoUrl=${REPO_URL}&page=1&limit=20"

echo ""
echo -e "${BOLD}6. SUMMARY ROUTE${NC}"
test_api "Summary - Basic" \
    "${BASE_URL}/api/repositories/summary?repoUrl=${REPO_URL}"

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TESTING ERROR SCENARIOS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""

test_api "Missing repoUrl" \
    "${BASE_URL}/api/repositories/heatmap" \
    400

test_api "Invalid repoUrl format" \
    "${BASE_URL}/api/repositories/heatmap?repoUrl=not-a-url" \
    400

test_api "Invalid date format" \
    "${BASE_URL}/api/repositories/heatmap?repoUrl=${REPO_URL}&fromDate=invalid" \
    400

# SUMMARY
echo ""
echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║   TEST RESULTS${NC}"
echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Total Tests:  $TOTAL"
echo -e "${GREEN}Passed:       $PASSED${NC}"
echo -e "${RED}Failed:       $FAILED${NC}"

if [[ $TOTAL -gt 0 ]]; then
    pass_rate=$(awk "BEGIN {printf \"%.1f\", ($PASSED / $TOTAL) * 100}")
    echo "Pass Rate:    ${pass_rate}%"
fi

echo ""

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}✓✓✓ ALL TESTS PASSED ✓✓✓${NC}"
    echo -e "${GREEN}Refactored code working perfectly!${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}✗ SOME TESTS FAILED${NC}"
    exit 1
fi
