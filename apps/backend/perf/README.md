# Backend Performance Testing Guide

## Setup

1. Install k6

   ```bash
   # macOS
   brew install k6

   # Windows (using Chocolatey)
   choco install k6

   # Linux (Debian/Ubuntu)
   sudo apt update
   sudo apt install snapd
   sudo snap install snapd
   sudo snap install k6
   ```

2. Install dependencies

   ```bash
   pnpm install
   ```

3. Ensure Redis is running

   ```bash
   docker run -d -p 6379:6379 redis:alpine
   ```

4. Start the backend server

   ```bash
   pnpm dev
   ```

## Running Performance Tests

### Basic Load Test

```bash
# Run the default test scenario
pnpm test:perf

# Or run k6 directly
k6 run perf/load-test.ts
```

### Generate HTML Report

```bash
# This automatically generates an HTML report at perf/report.html
pnpm test:perf:report

# Or with k6 directly
k6 run --out json=perf/raw-results.json perf/load-test.ts
```

### Custom Scenarios

#### Test with higher load

```bash
# Double the arrival rates
k6 run --env MULTIPLIER=2 perf/load-test.ts

# Custom VU count and duration
k6 run --vus 100 --duration 5m perf/load-test.ts
```

#### Test specific endpoint

```bash
# Run only health check scenario
k6 run --env SCENARIO=health_check perf/load-test.ts

# Test against different environment
k6 run --env BASE_URL=https://staging.example.com perf/load-test.ts
```

#### Quick smoke test

```bash
# Run a 30-second smoke test with 5 VUs
k6 run --vus 5 --duration 30s perf/load-test.ts
```

## Performance Targets

The test suite enforces these performance thresholds:

- **Overall**:
  - 95th percentile < 5s
  - 99th percentile < 10s
  - Error rate < 5%
- **Health Check**: < 50ms response time (95th percentile)
- **Cached Requests**: < 100ms response time (95th percentile)
- **Cache Hit Rate**: > 50%
- **Repository Clone**: < 5s for average repos
- **Heatmap Generation**: < 2s for 1000 commits

## Test Scenarios

The load test simulates realistic usage patterns with weighted scenarios:

1. **Health Check** (10% of traffic)

   - Simple GET requests to `/health`
   - Validates service availability

2. **Get Repository Commits** (40% of traffic)

   - POST requests to `/api/repositories`
   - Tests git cloning and commit retrieval

3. **Get Heatmap Data** (30% of traffic)

   - GET requests to `/api/commits/heatmap`
   - Tests data aggregation and caching

4. **Full Data Request** (20% of traffic)
   - POST requests to `/api/repositories/full-data`
   - Tests combined operations

## Load Phases

The test runs through these phases:

1. **Warm-up**: 30s ramping to 5 requests/second
2. **Ramp-up**: 60s ramping to 20 requests/second
3. **Sustained Load**: 120s at 50 requests/second
4. **Cool-down**: 30s ramping down to 0

## Monitoring During Tests

### Real-time Metrics

k6 provides real-time metrics in the console:

- Request rate
- Response times (min/med/max/p90/p95)
- Error rate
- Active VUs (Virtual Users)

### Application Monitoring

1. **Prometheus Metrics**: <http://localhost:3001/metrics>
2. **Health Check**: <http://localhost:3001/health/detailed>
3. **Application Logs**: Check console output

## Key Metrics to Watch

- `http_req_duration`: Response time distribution
- `http_req_failed`: Failed request rate
- `git_operation_duration`: Git operation performance
- `cache_hit_rate`: Cache effectiveness
- `http_reqs`: Requests per second

## Understanding Results

After running tests, check:

1. **Console Output**: Real-time metrics and final summary
2. **HTML Report** (`perf/report.html`): Visual charts and detailed metrics
3. **JSON Report** (`perf/report.json`): Raw data for further analysis

### Interpreting the HTML Report

The HTML report includes:

- **Summary**: Overall test statistics
- **Metrics Over Time**: Visual charts showing performance trends
- **Thresholds**: Pass/fail status for each threshold
- **Checks**: Success rate for response validations
- **HTTP Failures**: Detailed error breakdown

## Troubleshooting

### High Response Times

- Check `cache_hit_rate` - low rates indicate caching issues
- Monitor `git_operation_duration` for slow git operations
- Review concurrent request handling in logs

### High Error Rate

- Check Redis connection health
- Verify repository URLs in test data
- Review rate limiting configuration

### Memory Issues

- Monitor Node.js heap usage during tests
- Check for memory leaks in long-running tests
- Review temp directory cleanup

### Running Out of VUs

If you see "insufficient VUs" errors:

```bash
# Increase pre-allocated VUs
k6 run --vus 100 perf/load-test.ts
```

## Advanced Usage

### Custom Metrics

The test tracks custom metrics:

- `git_operation_duration`: Time spent on git operations
- `cache_hit_rate`: Percentage of cache hits

### Debugging Slow Requests

Slow requests (>5s) are logged automatically. To debug:

1. Check the console for "Slow request detected" messages
2. Review the repository URL that caused the slowdown
3. Test that specific repository manually

### CI/CD Integration

```yaml
# Example GitHub Actions job
performance-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Setup k6
      run: |
        sudo apt update
        sudo apt install snapd
        sudo snap install snapd
        sudo snap install k6
    - name: Run Performance Tests
      run: k6 run perf/load-test.ts
    - name: Upload Reports
      uses: actions/upload-artifact@v4
      with:
        name: performance-reports
        path: perf/report.*
```
