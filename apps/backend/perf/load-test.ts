import { check, sleep } from 'k6';
import { Options } from 'k6/options';
import http from 'k6/http';
import { SharedArray } from 'k6/data';
import { Rate, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';

// Custom metrics for tracking performance and failures
const gitOperationDuration = new Trend('git_operation_duration', true);
const cacheHitRate = new Rate('cache_hit_rate');
const errorRate = new Rate('http_req_failed');

// Load test repository URLs
const testRepos = new SharedArray('testRepos', () => [
  { repoUrl: 'https://github.com/torvalds/linux.git' },
  { repoUrl: 'https://github.com/facebook/react.git' },
  { repoUrl: 'https://github.com/vuejs/vue.git' },
  { repoUrl: 'https://github.com/angular/angular.git' },
  { repoUrl: 'https://github.com/microsoft/vscode.git' },
  { repoUrl: 'https://github.com/nodejs/node.git' },
  { repoUrl: 'https://github.com/kubernetes/kubernetes.git' },
  { repoUrl: 'https://github.com/tensorflow/tensorflow.git' },
  { repoUrl: 'https://github.com/rust-lang/rust.git' },
  { repoUrl: 'https://github.com/golang/go.git' },
]);

// Environment variables
const SCENARIO = __ENV.SCENARIO;
const MULTIPLIER = parseFloat(__ENV.MULTIPLIER || '1');
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options: Options = {
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    'http_req_duration{scenario:health_check}': ['p(95)<50'],
    'http_req_duration{scenario:cached}': ['p(95)<100'],
    http_req_failed: ['rate<0.05'],
    cache_hit_rate: ['rate>0.5'],
  },
  scenarios: SCENARIO
    ? { [SCENARIO]: getScenarioConfig(SCENARIO) }
    : {
        health_check: getScenarioConfig('health_check'),
        get_commits: getScenarioConfig('get_commits'),
        get_heatmap: getScenarioConfig('get_heatmap'),
        full_data: getScenarioConfig('full_data'),
      },
};

function getScenarioConfig(name: string) {
  const base = {
    executor: 'constant-arrival-rate',
    timeUnit: '1m',
    duration: '240s',
    tags: { scenario: name },
    gracefulStop: '30s',
  } as any;
  const rates = {
    health_check: { rate: 10, vusMin: 2, vusMax: 10, exec: 'healthCheck' },
    get_commits: {
      rate: 40,
      vusMin: 10,
      vusMax: 50,
      exec: 'getRepositoryCommits',
    },
    get_heatmap: { rate: 30, vusMin: 8, vusMax: 40, exec: 'getHeatmapData' },
    full_data: { rate: 20, vusMin: 5, vusMax: 30, exec: 'getFullData' },
  };
  const cfg = rates[name] || rates.health_check;
  return {
    ...base,
    rate: cfg.rate * MULTIPLIER,
    preAllocatedVUs: Math.ceil(cfg.vusMin * MULTIPLIER),
    maxVUs: Math.ceil(cfg.vusMax * MULTIPLIER),
    exec: cfg.exec,
  };
}

function getRandomRepo(): string {
  return testRepos[Math.floor(Math.random() * testRepos.length)].repoUrl;
}

function generateRequestId(): string {
  return `k6-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Performs a simple health check against the backend's `/health` endpoint.
 * Used by k6 to verify the service is running before executing other tests.
 */
export function healthCheck() {
  let res;
  try {
    res = http.get(`${BASE_URL}/health`, {
      headers: { 'X-Request-ID': generateRequestId() },
    });
  } catch (err) {
    console.error(`Health check failed: ${err}`);
    errorRate.add(1);
    sleep(1);
    return;
  }
  errorRate.add(res.status !== 200);

  let body: any;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = {};
  }

  check(res, {
    'status is 200': () => res.status === 200,
    'body.status==healthy': () => body.status === 'healthy',
  });
  sleep(1);
}

/**
 * Requests the commit list for a randomly selected repository.
 * Measures request duration and records cache hit metrics.
 */
export function getRepositoryCommits() {
  const repoUrl = getRandomRepo();
  const start = Date.now();
  let res;
  try {
    res = http.post(
      `${BASE_URL}/api/repositories`,
      JSON.stringify({ repoUrl }),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': generateRequestId(),
        },
      }
    );
  } catch (err) {
    console.error(`Commits request failed: ${err}`);
    errorRate.add(1);
    sleep(1);
    return;
  }
  const duration = Date.now() - start;
  gitOperationDuration.add(duration);
  errorRate.add(res.status !== 200);

  const cache = res.headers['X-Cache-Status'];
  if (cache) cacheHitRate.add(cache === 'HIT');

  let body: any;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = {};
  }

  check(res, {
    'status is 200': () => res.status === 200,
    'returns commits array': () => Array.isArray(body.commits),
  });
  if (duration > 5000) console.log(`Slow: ${repoUrl} took ${duration}ms`);
  sleep(Math.random() * 2 + 1);
}

/**
 * Requests aggregated heatmap data for a randomly chosen repository.
 * Tracks cache performance and validates the returned structure.
 */
export function getHeatmapData() {
  const repoUrl = getRandomRepo();
  const url = `${BASE_URL}/api/commits/heatmap?repoUrl=${encodeURIComponent(repoUrl)}`;
  let res;
  try {
    res = http.get(url, { headers: { 'X-Request-ID': generateRequestId() } });
  } catch (err) {
    console.error(`Heatmap request failed: ${err}`);
    errorRate.add(1);
    sleep(1);
    return;
  }
  errorRate.add(res.status !== 200);
  const cache = res.headers['X-Cache-Status'];
  if (cache) cacheHitRate.add(cache === 'HIT');

  let body: any;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = {};
  }

  check(res, {
    'status is 200': () => res.status === 200,
    'valid heatmap data': () => body.timePeriod && Array.isArray(body.data),
  });
  sleep(Math.random() * 2 + 1);
}

/**
 * Fetches both commit and heatmap data in a single request. Useful for
 * exercising the most expensive backend endpoint under load.
 */
export function getFullData() {
  const repoUrl = getRandomRepo();
  const start = Date.now();
  let res;
  try {
    res = http.post(
      `${BASE_URL}/api/repositories/full-data`,
      JSON.stringify({ repoUrl, timePeriod: 'day' }),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': generateRequestId(),
        },
      }
    );
  } catch (err) {
    console.error(`Full-data request failed: ${err}`);
    errorRate.add(1);
    sleep(1);
    return;
  }
  const duration = Date.now() - start;
  gitOperationDuration.add(duration);
  errorRate.add(res.status !== 200);

  let body: any;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = {};
  }

  check(res, {
    'status is 200': () => res.status === 200,
    'has commits+heatmap': () =>
      Array.isArray(body.commits) && body.heatmapData,
  });
  sleep(Math.random() * 3 + 2);
}

/**
 * Generates HTML and JSON summaries after a k6 run.
 * The reports are saved to the `perf` directory.
 */
export function handleSummary(data: any) {
  return {
    'perf/report.html': htmlReport(data),
    'perf/report.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
