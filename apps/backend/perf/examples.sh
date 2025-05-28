#!/bin/bash

# k6 Performance Test Examples
# Run from apps/backend directory

echo "k6 Performance Test Examples"
echo "============================"
echo ""

echo "1. Basic test run:"
echo "   pnpm test:perf"
echo ""

echo "2. Quick smoke test (30s with 5 VUs):"
echo "   pnpm test:perf:smoke"
echo ""

echo "3. Stress test (2x normal load):"
echo "   pnpm test:perf:stress"
echo ""

echo "4. Test specific scenario only:"
echo "   k6 run --env SCENARIO=health_check perf/load-test.ts"
echo "   k6 run --env SCENARIO=get_commits perf/load-test.ts"
echo "   k6 run --env SCENARIO=get_heatmap perf/load-test.ts"
echo "   k6 run --env SCENARIO=full_data perf/load-test.ts"
echo ""

echo "5. Test with custom load multiplier:"
echo "   k6 run --env MULTIPLIER=0.5 perf/load-test.ts  # Half load"
echo "   k6 run --env MULTIPLIER=3 perf/load-test.ts    # Triple load"
echo ""

echo "6. Test against different environment:"
echo "   k6 run --env BASE_URL=https://staging.example.com perf/load-test.ts"
echo ""

echo "7. Extended test with custom duration:"
echo "   k6 run --duration 10m perf/load-test.ts"
echo ""

echo "8. Debug mode with more detailed output:"
echo "   k6 run --verbose --http-debug perf/load-test.ts"
echo ""

echo "9. Export metrics to CSV:"
echo "   k6 run --out csv=perf/metrics.csv perf/load-test.ts"
echo ""

echo "10. Run with custom thresholds:"
echo "    k6 run --summary-trend-stats='min,avg,med,max,p(95),p(99)' perf/load-test.ts"
echo ""

echo "Reports are automatically generated at:"
echo "  - perf/report.html (visual report)"
echo "  - perf/report.json (raw data)"
echo "  - Console output (summary)"
