  #!/bin/bash
  BASE_URL="http://localhost:3001"
  REPO_URL="https://github.com/jonasyr/gitray.git"

  echo "=== Testing GitRay API ==="

  echo -e "\n1. Health Check"
  curl -s $BASE_URL/health | jq

  echo -e "\n2. Detailed Health"
  curl -s $BASE_URL/health/detailed | jq

  echo -e "\n3. Repository Summary"
  curl -s -X GET "${BASE_URL}/api/repositories/summary?repoUrl=${REPO_URL}" \
    -H "Content-Type: application/json" \
    -H "X-Requested-With: XMLHttpRequest" | jq

  echo -e "\n4. Get Commits (page 1, limit 5)"
  curl -s -X GET "${BASE_URL}/api/commits?repoUrl=${REPO_URL}&page=1&limit=5" \
    -H "Content-Type: application/json" \
    -H "X-Requested-With: XMLHttpRequest" | jq

  echo -e "\n5. File Analysis"
  curl -s -X GET "${BASE_URL}/api/commits/file-analysis?repoUrl=${REPO_URL}" \
    -H "Content-Type: application/json" \
    -H "X-Requested-With: XMLHttpRequest" | jq

  echo -e "\n6. Cache Statistics (if admin auth disabled)"
  curl -s -X GET "${BASE_URL}/api/commits/cache/stats" \
    -H "Content-Type: application/json" \
    -H "X-Requested-With: XMLHttpRequest" | jq

  echo -e "\n=== Tests Complete ==="
