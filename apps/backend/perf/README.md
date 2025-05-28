# Backend Performance Testing Guide

## Setup

1. Install dependencies

   ```bash
   pnpm install
   ```

2. Ensure Redis is running

   ```bash
   docker run -d -p 6379:6379 redis:alpine
   ```

3. Start the backend server

   ```bash
   pnpm dev
   ```

## Running Performance Tests

### Basic Load Test

```bash
pnpm test:perf
```

### Generate HTML Report

```bash
pnpm test:perf:report
```

### Custom Scenarios

#### Test with higher load

```bash
artillery run perf/load-test.yml \
  --overrides '{"config": {"phases": [{"duration": 60, "arrivalRate": 100}]}}'
```

#### Test specific endpoint

```bash
artillery quick --count 100 --num 10 http://localhost:3001/health
```

## Performance Targets

- **Health Check**: < 50ms response time
- **Cached Requests**: < 100ms response time
- **Repository Clone**: < 5s for average repos
- **Heatmap Generation**: < 2s for 1000 commits

## Monitoring During Tests

1. **Prometheus Metrics**: <http://localhost:3001/metrics>
2. **Health Check**: <http://localhost:3001/health/detailed>
3. **Application Logs**: Check console output

## Key Metrics to Watch

- `http_request_duration_seconds`: Response time distribution
- `git_operation_duration_seconds`: Git operation performance
- `cache_hits_total` / `cache_misses_total`: Cache effectiveness
- `temp_directories_count`: Resource cleanup
- `cleanup_queue_size`: Cleanup backlog

## Troubleshooting

### High Memory Usage

- Check `temp_directories_count` - might indicate cleanup issues
- Review `cleanup_queue_size` for backlog

### Slow Response Times

- Check cache hit rates
- Monitor Redis connection health
- Review concurrent git operations

### Rate Limiting

- Default: 100 requests per 15 minutes per IP
- Adjust in `config.ts` if needed for testing
