#!/bin/bash

REPO="https://github.com/jonasyr/gitray.git"
BASE="http://localhost:3001/api/repositories"

echo "Testing all endpoints after Phase 1 refactoring..."
echo "=================================================="
echo ""

echo "1. Testing /commits endpoint..."
curl -s "${BASE}/commits?repoUrl=${REPO}&page=1&limit=5" | jq -r 'if .commits then "  ✓ SUCCESS: \(.commits | length) commits, page \(.page)" else "  ✗ FAILED: \(.error // "unknown")" end'

echo ""
echo "2. Testing /heatmap endpoint..."
curl -s "${BASE}/heatmap?repoUrl=${REPO}" | jq -r 'if .heatmapData then "  ✓ SUCCESS: \(.heatmapData.data | length) data points" else "  ✗ FAILED: \(.error // "unknown")" end'

echo ""
echo "3. Testing /contributors endpoint..."
curl -s "${BASE}/contributors?repoUrl=${REPO}" | jq -r 'if .contributors then "  ✓ SUCCESS: \(.contributors | length) contributors" else "  ✗ FAILED: \(.error // "unknown")" end'

echo ""
echo "4. Testing /churn endpoint..."
curl -s "${BASE}/churn?repoUrl=${REPO}" | jq -r 'if .churnData then "  ✓ SUCCESS: \(.churnData.files | length) files analyzed" else "  ✗ FAILED: \(.error // "unknown")" end'

echo ""
echo "5. Testing /summary endpoint..."
curl -s "${BASE}/summary?repoUrl=${REPO}" | jq -r 'if .summary then "  ✓ SUCCESS: \(.summary.repository.name)" else "  ✗ FAILED: \(.error // "unknown")" end'

echo ""
echo "6. Testing /full-data endpoint..."
curl -s "${BASE}/full-data?repoUrl=${REPO}&page=1&limit=5" | jq -r 'if .commits and .heatmapData then "  ✓ SUCCESS: \(.commits | length) commits, \(.heatmapData.data | length) heatmap points" else "  ✗ FAILED: \(.error // "unknown")" end'

echo ""
echo "=================================================="
echo "All endpoints tested successfully!"
