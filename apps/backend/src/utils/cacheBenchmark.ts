import { HybridLRUCache } from '../utils/hybridLruCache';
import { performance } from 'perf_hooks';
import path from 'path';
import os from 'os';

interface TestData {
  id: string;
  data: string;
  timestamp: number;
  metadata: {
    size: number;
    chunks: string[];
  };
}

// Generate test data that will require significant serialization
function generateTestData(id: string, sizeKB: number = 10): TestData {
  const chunkSize = 1000;
  const chunks = [];
  const totalChars = sizeKB * 1024;

  for (let i = 0; i < Math.ceil(totalChars / chunkSize); i++) {
    chunks.push('x'.repeat(Math.min(chunkSize, totalChars - i * chunkSize)));
  }

  return {
    id,
    data: chunks.join(''),
    timestamp: Date.now(),
    metadata: {
      size: totalChars,
      chunks,
    },
  };
}

async function benchmarkPerformance() {
  const tmpDir = path.join(os.tmpdir(), 'hybrid-cache-benchmark');

  const cache = new HybridLRUCache<TestData>({
    maxEntries: 1000,
    memoryLimitBytes: 50 * 1024 * 1024, // 50MB
    diskPath: tmpDir,
    lockTimeoutMs: 30000,
  });

  try {
    console.log('🚀 Starting HybridLRUCache Performance Benchmark');
    console.log('================================================');

    // Test 1: Memory operations with different data sizes
    console.log('\n📊 Test 1: Memory Operations Performance');
    const memorySizes = [1, 5, 10, 50]; // KB

    for (const sizeKB of memorySizes) {
      const testData = generateTestData('memory-test', sizeKB);
      const iterations = 100;

      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        await cache.set(`memory-${sizeKB}kb-${i}`, testData);
      }

      const end = performance.now();
      const avgLatency = (end - start) / iterations;

      console.log(
        `  ${sizeKB}KB objects: ${avgLatency.toFixed(2)}ms avg latency (${iterations} ops)`
      );
    }

    // Test 2: Mixed operations (set/get) performance
    console.log('\n📊 Test 2: Mixed Operations Performance');
    const mixedTestData = generateTestData('mixed-test', 10);
    const mixedIterations = 200;

    const mixedStart = performance.now();

    for (let i = 0; i < mixedIterations; i++) {
      const key = `mixed-${i}`;
      await cache.set(key, mixedTestData);

      if (i % 2 === 0) {
        await cache.get(key);
      }
    }

    const mixedEnd = performance.now();
    const mixedAvgLatency = (mixedEnd - mixedStart) / mixedIterations;

    console.log(
      `  Mixed ops: ${mixedAvgLatency.toFixed(2)}ms avg latency (${mixedIterations} ops)`
    );

    // Test 3: Concurrent operations
    console.log('\n📊 Test 3: Concurrent Operations Performance');
    const concurrentData = generateTestData('concurrent-test', 5);
    const concurrentPromises = [];
    const concurrentStart = performance.now();

    for (let i = 0; i < 50; i++) {
      concurrentPromises.push(cache.set(`concurrent-${i}`, concurrentData));
    }

    await Promise.all(concurrentPromises);
    const concurrentEnd = performance.now();

    console.log(
      `  50 concurrent sets: ${(concurrentEnd - concurrentStart).toFixed(2)}ms total`
    );

    // Test 4: Serialization pool stress test
    console.log('\n📊 Test 4: Serialization Pool Stress Test');
    const largeData = generateTestData('large-test', 100); // 100KB
    const stressPromises = [];
    const stressStart = performance.now();

    for (let i = 0; i < 20; i++) {
      stressPromises.push(cache.set(`stress-${i}`, largeData));
    }

    await Promise.all(stressPromises);
    const stressEnd = performance.now();

    console.log(
      `  20 concurrent 100KB sets: ${(stressEnd - stressStart).toFixed(2)}ms total`
    );

    // Display final statistics
    console.log('\n📈 Final Cache Statistics');
    console.log('==========================');
    const stats = cache.getStats();
    console.log(
      `Memory: ${stats.memory.entries} entries, ${(stats.memory.usageBytes / 1024 / 1024).toFixed(2)}MB`
    );
    console.log(`Disk: ${stats.disk.entries} entries`);
    console.log(`Redis: ${stats.redis.healthy ? 'Healthy' : 'Unavailable'}`);
    console.log(`Serialization Pool:`);
    console.log(
      `  - Workers: ${stats.serialization.activeWorkers}/${stats.serialization.poolSize}`
    );
    console.log(`  - Queue: ${stats.serialization.queueLength} pending`);

    console.log('\n✅ Benchmark completed successfully!');
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
  } finally {
    // Clean up
    await cache.destroy();
  }
}

// Performance monitoring function
async function monitorPerformance() {
  console.log('\n🔍 Performance Monitoring Tips');
  console.log('===============================');
  console.log('1. Check serialization pool queue length during high load');
  console.log('2. Monitor worker thread count vs CPU cores');
  console.log('3. Watch for memory pressure warnings in logs');
  console.log('4. Verify async operations are not blocking the event loop');

  console.log('\n⚡ Performance Improvements Applied:');
  console.log('- ✅ Async JSON serialization using worker threads');
  console.log('- ✅ Non-blocking size calculations');
  console.log('- ✅ Optimized memory pressure handling');
  console.log('- ✅ Concurrent serialization with pool management');
  console.log('- ✅ Event loop protection for large objects');
}

// Main execution
if (require.main === module) {
  (async () => {
    await benchmarkPerformance();
    await monitorPerformance();
  })().catch(console.error);
}

export { benchmarkPerformance, monitorPerformance };
