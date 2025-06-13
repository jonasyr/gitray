#!/bin/bash

# Simple cache testing script for GitRay
BASE_URL="http://localhost:3001"
TEST_REPO="https://github.com/sindresorhus/is.git"
LARGE_REPO="https://github.com/microsoft/TypeScript.git"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_test() {
    echo -e "${BLUE}🧪 $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo -e "${BLUE}🧪 GitRay Cache Testing${NC}"
echo "========================"

# Check if server is responding
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    log_error "Server is not responding at $BASE_URL"
    echo "Make sure to run: cd apps/backend && npm run dev"
    exit 1
fi

# Test 1: Cache Miss vs Cache Hit
log_test "Test 1: Cache Miss vs Cache Hit"

echo "First request (cache miss expected):"
miss_time=$(curl -w "%{time_total}" -s -o /dev/null "$BASE_URL/api/commits?repoUrl=$(printf '%s' "$TEST_REPO" | jq -sRr @uri)&limit=10")
echo "⏱️  Cache miss time: ${miss_time}s"

echo "Second request (cache hit expected):"
hit_time=$(curl -w "%{time_total}" -s -o /dev/null "$BASE_URL/api/commits?repoUrl=$(printf '%s' "$TEST_REPO" | jq -sRr @uri)&limit=10")
echo "⏱️  Cache hit time: ${hit_time}s"

# Calculate improvement
if command -v bc > /dev/null 2>&1; then
    improvement=$(echo "scale=1; $miss_time / $hit_time" | bc -l)
    echo "📊 Speed improvement: ${improvement}x"
    
    if (( $(echo "$improvement > 3" | bc -l) )); then
        log_success "Good cache performance (${improvement}x improvement)"
    else
        log_warning "Cache improvement less than expected (${improvement}x)"
    fi
else
    echo "📊 bc not available for calculation"
fi

echo ""

# Test 2: Concurrent Requests
log_test "Test 2: Concurrent Request Test"
echo "Firing 5 concurrent requests..."

start_time=$(date +%s)
pids=()
for i in {1..5}; do
    (
        curl -s "$BASE_URL/api/commits?repoUrl=$(printf '%s' "$LARGE_REPO" | jq -sRr @uri)&limit=20" > /tmp/test_$i.json 2>&1
    ) &
    pids+=($!)
done

# Wait for all requests
for pid in "${pids[@]}"; do
    wait $pid
done

end_time=$(date +%s)
concurrent_time=$((end_time - start_time))
echo "⏱️  5 concurrent requests completed in: ${concurrent_time}s"

# Check that all requests succeeded
success_count=0
for i in {1..5}; do
    if [ -s "/tmp/test_$i.json" ] && grep -q '"commits"' /tmp/test_$i.json 2>/dev/null; then
        success_count=$((success_count + 1))
    fi
done

if [ $success_count -eq 5 ]; then
    log_success "All 5 concurrent requests succeeded"
else
    log_warning "Only $success_count/5 requests succeeded"
fi

# Cleanup
rm -f /tmp/test_*.json

echo ""

# Test 3: Different Endpoints
log_test "Test 3: Different Endpoint Types"

echo "Testing commits endpoint..."
commits_time=$(curl -w "%{time_total}" -s -o /dev/null "$BASE_URL/api/commits?repoUrl=$(printf '%s' "$TEST_REPO" | jq -sRr @uri)&limit=15")
echo "⏱️  Commits time: ${commits_time}s"

echo "Testing heatmap endpoint..."
heatmap_time=$(curl -w "%{time_total}" -s -o /dev/null "$BASE_URL/api/commits/heatmap?repoUrl=$(printf '%s' "$TEST_REPO" | jq -sRr @uri)" 2>/dev/null || echo "0.000")
if [ "$heatmap_time" != "0.000" ]; then
    echo "⏱️  Heatmap time: ${heatmap_time}s"
    log_success "Heatmap endpoint working"
else
    log_warning "Heatmap endpoint not available"
fi

echo ""

# Test 4: Error Handling
log_test "Test 4: Error Handling"

echo "Testing invalid repository URL..."
response=$(curl -s -w "%{http_code}" "$BASE_URL/api/commits?repoUrl=invalid-url" -o /dev/null)
status_code="$response"

if [ "$status_code" = "400" ] || [ "$status_code" = "422" ]; then
    log_success "Invalid URL handled gracefully (HTTP $status_code)"
else
    log_warning "Unexpected response for invalid URL (HTTP $status_code)"
fi

echo ""
log_success "Cache testing complete!"

echo ""

# Test 5: Cache Statistics
log_test "Test 5: Cache Statistics"
echo "Fetching cache statistics..."

cache_stats=$(curl -s "$BASE_URL/api/commits/cache/stats")
if echo "$cache_stats" | jq . > /dev/null 2>&1; then
    log_success "Cache stats endpoint working"
    
    # Extract key metrics
    echo "📊 Cache Metrics:"
    echo "$cache_stats" | jq -r '
        "  Cached repositories: " + (.repositories.cached // 0 | tostring),
        "  Hit ratios: " + (.cache.hitRatios.overall // 0 | tostring),
        "  Memory usage: " + (.cache.memoryUsage.total // 0 | tostring) + " bytes",
        "  Duplicate clones prevented: " + (.cache.efficiency.duplicateClonesPrevented // 0 | tostring)
    ' 2>/dev/null || echo "  Raw stats available but parsing failed"
else
    log_warning "Cache stats endpoint not responding properly"
    echo "Response: $(echo "$cache_stats" | head -c 200)"
fi

echo ""

# Test 6: Cache Invalidation
log_test "Test 6: Cache Invalidation"

# First, warm up the cache
echo "Warming up cache..."
curl -s "$BASE_URL/api/commits?repoUrl=$(printf '%s' "$TEST_REPO" | jq -sRr @uri)&limit=10" > /dev/null

# Test cache hit
echo "Testing cache hit:"
hit_time_before=$(curl -w "%{time_total}" -s -o /dev/null "$BASE_URL/api/commits?repoUrl=$(printf '%s' "$TEST_REPO" | jq -sRr @uri)&limit=10")
echo "⏱️  Cache hit time: ${hit_time_before}s"

# Invalidate cache
echo "Invalidating cache..."
invalidate_response=$(curl -s -X POST "$BASE_URL/api/commits/cache/invalidate" \
  -H "Content-Type: application/json" \
  -d "{\"repoUrl\":\"$TEST_REPO\"}")

if echo "$invalidate_response" | grep -q '"success":true' 2>/dev/null; then
    log_success "Cache invalidation successful"
else
    log_warning "Cache invalidation response: $(echo "$invalidate_response" | head -c 100)"
fi

# Test after invalidation - should be slower
echo "Testing after invalidation (should be slower):"
miss_time_after=$(curl -w "%{time_total}" -s -o /dev/null "$BASE_URL/api/commits?repoUrl=$(printf '%s' "$TEST_REPO" | jq -sRr @uri)&limit=10")
echo "⏱️  Post-invalidation time: ${miss_time_after}s"

if command -v bc > /dev/null 2>&1; then
    if (( $(echo "$miss_time_after > $hit_time_before" | bc -l) )); then
        log_success "Cache invalidation working (${miss_time_after}s > ${hit_time_before}s)"
    else
        log_warning "Cache invalidation may not be working properly"
    fi
fi

echo ""
log_success "All cache tests complete!"

echo ""
echo -e "${YELLOW}💡 What to look for:${NC}"
echo "- Cache hits should be 3-10x faster than cache misses"
echo "- Concurrent requests should complete reasonably quickly"
echo "- All endpoints should respond without errors"
echo "- Check server logs for cache hit/miss information"

# Fire concurrent requests
pids=()
for i in {1..10}; do
    (
        curl -s "$BASE_URL/api/commits/heatmap?repoUrl=$LARGE_REPO" > /tmp/test_$i.json 2>&1
    ) &
    pids+=($!)
done

# Wait for all requests
for pid in "${pids[@]}"; do
    wait $pid
done

end_time=$(date +%s.%N)
concurrent_time=$(echo "$end_time - $start_time" | bc -l)
echo "⏱️  10 concurrent requests completed in: ${concurrent_time}s"

# Check results
final_stats=$(curl -s "$BASE_URL/api/commits/cache-stats" 2>/dev/null)
if [ $? -eq 0 ] && echo "$final_stats" | jq . > /dev/null 2>&1; then
    final_clones=$(echo "$final_stats" | jq -r '.efficiency.duplicateClonesPrevented // 0')
    prevented_clones=$((final_clones - initial_clones))
    
    if [ $prevented_clones -gt 5 ]; then
        log_success "Prevented $prevented_clones duplicate clones (expected 9)"
    else
        log_warning "Only prevented $prevented_clones duplicate clones"
    fi
else
    log_warning "Cache stats not available for comparison"
fi

# Check that all requests succeeded
success_count=0
for i in {1..10}; do
    if [ -s "/tmp/test_$i.json" ] && jq -e '.data' /tmp/test_$i.json > /dev/null 2>&1; then
        success_count=$((success_count + 1))
    fi
done

if [ $success_count -eq 10 ]; then
    log_success "All 10 concurrent requests succeeded"
else
    log_error "Only $success_count/10 requests succeeded"
fi

# Cleanup
rm -f /tmp/test_*.json

echo ""

# Test 2: Cache Hit Rate Analysis  
log_test "Test 2: Cache Hit Rate Analysis"
echo "Testing cache hit rates with repeated requests..."

# Clear cache first
curl -s -X POST "$BASE_URL/api/repositories/invalidate-cache" \
  -H "Content-Type: application/json" \
  -d "{\"repoUrl\":\"$TEST_REPO\"}" > /dev/null

# Get baseline stats
baseline_stats=$(curl -s "$BASE_URL/api/commits/cache-stats")

# Time the test sequence
test_start=$(date +%s.%N)

# Make 20 requests with variations
for i in {1..20}; do
    case $((i % 4)) in
        0) curl -s "$BASE_URL/api/commits?repoUrl=$TEST_REPO&limit=10" > /dev/null ;;
        1) curl -s "$BASE_URL/api/commits?repoUrl=$TEST_REPO&limit=20" > /dev/null ;;
        2) curl -s "$BASE_URL/api/commits/heatmap?repoUrl=$TEST_REPO" > /dev/null ;;
        3) curl -s "$BASE_URL/api/commits?repoUrl=$TEST_REPO&limit=10&author=test" > /dev/null ;;
    esac
done

test_end=$(date +%s.%N)
test_duration=$(echo "$test_end - $test_start" | bc -l)
avg_time=$(echo "scale=3; $test_duration / 20" | bc -l)

echo "⏱️  20 requests completed in: ${test_duration}s (avg: ${avg_time}s per request)"

# Check hit rates
final_hit_stats=$(curl -s "$BASE_URL/api/commits/cache-stats")
overall_hit_rate=$(echo "$final_hit_stats" | jq -r '.hitRatios.overall * 100')

if (( $(echo "$overall_hit_rate > 60" | bc -l) )); then
    log_success "Cache hit rate: ${overall_hit_rate}% (target: >60%)"
else
    log_warning "Cache hit rate: ${overall_hit_rate}% (below target of 60%)"
fi

echo ""

# Test 3: Memory Usage Under Load
log_test "Test 3: Memory Usage Under Load"
echo "Testing memory bounds with multiple repositories..."

# Get initial memory usage
initial_memory=$(echo "$final_hit_stats" | jq -r '.memoryUsage.total')

# Load multiple repositories
repos=(
    "$SMALL_REPO"
    "https://github.com/lodash/lodash.git"
    "https://github.com/expressjs/express.git"
    "https://github.com/vuejs/vue.git"
    "https://github.com/angular/angular.git"
)

for repo in "${repos[@]}"; do
    echo "Loading: $(basename $repo .git)"
    curl -s "$BASE_URL/api/commits?repoUrl=$repo&limit=50" > /dev/null &
done
wait

# Check memory usage
memory_stats=$(curl -s "$BASE_URL/api/commits/cache-stats")
final_memory=$(echo "$memory_stats" | jq -r '.memoryUsage.total')
memory_mb=$((final_memory / 1024 / 1024))

echo "Memory usage: ${memory_mb}MB"
if [ $memory_mb -lt 1000 ]; then
    log_success "Memory usage within bounds: ${memory_mb}MB"
else
    log_warning "High memory usage: ${memory_mb}MB"
fi

echo ""

# Test 4: Response Time Improvement
log_test "Test 4: Response Time Improvement" 
echo "Measuring response time improvements..."

# Clear cache
curl -s -X POST "$BASE_URL/api/repositories/invalidate-cache" \
  -H "Content-Type: application/json" \
  -d "{\"repoUrl\":\"$SMALL_REPO\"}" > /dev/null

# Measure cache miss time (3 attempts for accuracy)
echo "Measuring cache miss times..."
miss_total=0
for i in {1..3}; do
    miss_time=$(curl -w "%{time_total}" -s -o /dev/null "$BASE_URL/api/commits?repoUrl=$SMALL_REPO&limit=10")
    miss_total=$(echo "$miss_total + $miss_time" | bc -l)
    echo "  Miss attempt $i: ${miss_time}s"
done
avg_miss_time=$(echo "scale=3; $miss_total / 3" | bc -l)

# Measure cache hit time (5 attempts for accuracy)
echo "Measuring cache hit times..."
hit_total=0
for i in {1..5}; do
    hit_time=$(curl -w "%{time_total}" -s -o /dev/null "$BASE_URL/api/commits?repoUrl=$SMALL_REPO&limit=10")
    hit_total=$(echo "$hit_total + $hit_time" | bc -l)
    echo "  Hit attempt $i: ${hit_time}s"
done
avg_hit_time=$(echo "scale=3; $hit_total / 5" | bc -l)

# Calculate improvement
improvement=$(echo "scale=1; $avg_miss_time / $avg_hit_time" | bc -l)

echo ""
echo "📊 TIMING RESULTS:"
echo "Average cache miss time: ${avg_miss_time}s"
echo "Average cache hit time: ${avg_hit_time}s"
echo "Speed improvement: ${improvement}x"

if (( $(echo "$improvement > 5" | bc -l) )); then
    log_success "Response time improved ${improvement}x (target: >5x)"
else
    log_warning "Response time improved ${improvement}x (below target of 5x)"
fi

echo ""

# Test 5: Error Handling & Graceful Fallback
log_test "Test 5: Error Handling & Graceful Fallback"
echo "Testing error scenarios..."

# Test with invalid repository
echo "Testing invalid repository URL..."
response=$(curl -s -w "%{http_code}" "$BASE_URL/api/commits?repoUrl=https://github.com/nonexistent/repo.git")
status_code="${response: -3}"

if [ "$status_code" = "400" ] || [ "$status_code" = "404" ]; then
    log_success "Invalid repo handled gracefully (HTTP $status_code)"
else
    log_error "Invalid repo not handled properly (HTTP $status_code)"
fi

# Test with malformed URL
echo "Testing malformed URL..."
response=$(curl -s -w "%{http_code}" "$BASE_URL/api/commits?repoUrl=invalid-url")
status_code="${response: -3}"

if [ "$status_code" = "400" ]; then
    log_success "Malformed URL handled gracefully (HTTP $status_code)"
else
    log_error "Malformed URL not handled properly (HTTP $status_code)"
fi

echo ""

# Final Summary
log_test "Test Summary"
final_summary=$(curl -s "$BASE_URL/api/commits/cache-stats")

echo "Final Cache Statistics:"
echo "$final_summary" | jq '{
  hitRatios: .hitRatios,
  memoryUsage: .memoryUsage,
  duplicateClonesPrevented: .efficiency.duplicateClonesPrevented,
  totalOperations: .efficiency.totalCacheOperations
}'

echo ""
log_success "Real-world cache testing complete!"
echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
echo "- Watch server logs for cache operations: tail -f apps/backend/logs/application-*.log | grep -i cache"
echo "- Monitor memory: ps aux | grep node"
echo "- Check Redis: redis-cli monitor (if using Redis)"
