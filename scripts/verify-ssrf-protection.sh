#!/bin/bash

# SSRF Protection Verification Script
# Tests all the attack vectors mentioned in Issue #97

echo "🔒 SSRF Protection Verification Script"
echo "======================================="
echo ""
echo "Note: This script requires the backend server to be running on localhost:3001"
echo "Start it with: pnpm dev:backend"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test URLs that should be BLOCKED
test_urls=(
  "http://127.0.0.1:18080/repo.git"           # Loopback IPv4
  "http://[::1]:18080/repo.git"                # Loopback IPv6
  "http://[::ffff:127.0.0.1]:18080/repo.git"  # IPv4-mapped IPv6
  "http://10.0.0.1/repo.git"                   # Private IPv4
  "http://[fc00::1]/repo.git"                  # IPv6 ULA
  "http://169.254.0.1/repo.git"                # Link-local
  "http://192.168.1.1/repo.git"                # Private network
  "http://172.16.0.1/repo.git"                 # Private network
  "https://github.com./malicious/repo.git"     # Trailing dot
  "https://user:pass@github.com/repo.git"      # Userinfo injection
  "https://github.com/repo"                    # Missing .git
)

# Test URLs that should be ALLOWED (if DNS resolves correctly)
valid_urls=(
  "https://github.com/torvalds/linux.git"
  "https://gitlab.com/gitlab-org/gitlab.git"
  "https://bitbucket.org/atlassian/python-bitbucket.git"
)

echo "📋 Testing BLOCKED URLs (should return 400 errors)"
echo "---------------------------------------------------"

blocked_count=0
for url in "${test_urls[@]}"; do
  echo -n "Testing: $url ... "
  
  response=$(curl -s -w "%{http_code}" -o /dev/null -X POST http://localhost:3001/api/repositories \
    -H "Content-Type: application/json" \
    -d "{\"repoUrl\":\"$url\"}" 2>&1)
  
  if [ "$response" = "400" ]; then
    echo -e "${GREEN}✓ BLOCKED (400)${NC}"
    ((blocked_count++))
  else
    echo -e "${RED}✗ FAILED (got $response, expected 400)${NC}"
  fi
done

echo ""
echo "📊 Results: $blocked_count/${#test_urls[@]} attack vectors properly blocked"
echo ""

echo "📋 Testing VALID URLs (should NOT return 400 for security reasons)"
echo "--------------------------------------------------------------------"
echo -e "${YELLOW}Note: These may fail for other reasons (repo access, auth, etc.)${NC}"
echo -e "${YELLOW}We're just checking they DON'T fail with 400 security errors${NC}"
echo ""

valid_count=0
for url in "${valid_urls[@]}"; do
  echo -n "Testing: $url ... "
  
  response=$(curl -s -w "%{http_code}" -o /dev/null -X POST http://localhost:3001/api/repositories \
    -H "Content-Type: application/json" \
    -d "{\"repoUrl\":\"$url\"}" 2>&1)
  
  if [ "$response" != "400" ]; then
    echo -e "${GREEN}✓ NOT BLOCKED (got $response)${NC}"
    ((valid_count++))
  else
    echo -e "${RED}✗ INCORRECTLY BLOCKED (400)${NC}"
  fi
done

echo ""
echo "📊 Results: $valid_count/${#valid_urls[@]} valid URLs not blocked by security"
echo ""

# Final summary
echo "======================================="
if [ "$blocked_count" -eq "${#test_urls[@]}" ] && [ "$valid_count" -eq "${#valid_urls[@]}" ]; then
  echo -e "${GREEN}✅ All tests passed! SSRF protection is working correctly.${NC}"
  exit 0
else
  echo -e "${RED}⚠️  Some tests failed. Review the results above.${NC}"
  exit 1
fi
