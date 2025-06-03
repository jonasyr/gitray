import os from 'os';
import path from 'path';
import { mkdtemp, rm, readdir } from 'fs/promises';
import HybridLRUCache from '../../src/utils/hybridLruCache';
import Redis from 'ioredis';

jest.mock('ioredis');

const mockRedisInstance = {
  on: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  quit: jest.fn(),
  disconnect: jest.fn(),
};

const capturedRedisHandlers: Record<string, ((err?: Error) => void)[]> = {};
(mockRedisInstance.on as jest.Mock).mockImplementation(
  (event: string, cb: (err?: Error) => void) => {
    if (!capturedRedisHandlers[event]) {
      capturedRedisHandlers[event] = [];
    }
    capturedRedisHandlers[event].push(cb);
    return mockRedisInstance;
  }
);

(Redis as unknown as jest.Mock).mockImplementation(() => mockRedisInstance);

async function createTempDir() {
  return await mkdtemp(path.join(os.tmpdir(), 'hybrid-cache-test-'));
}

describe('HybridLRUCache', () => {
  let tempDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const key in capturedRedisHandlers) delete capturedRedisHandlers[key];
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('stores and retrieves entries with LRU eviction', async () => {
    const cache = new HybridLRUCache<string>({
      maxEntries: 3,
      memoryLimitBytes: 1024,
      diskPath: tempDir,
    });

    await cache.set('a', '1');
    await cache.set('b', '2');
    await cache.set('c', '3');

    await cache.get('a');
    await cache.set('d', '4'); // should evict 'b' from memory only

    expect(await cache.get('b')).toBe('2'); // from disk, re-added to memory
    expect(await cache.get('a')).toBe('1');
    expect(await cache.get('c')).toBe('3');
    expect(await cache.get('d')).toBe('4');
  });

  test('enforces disk limit and persists across instances', async () => {
    const opts = { maxEntries: 2, memoryLimitBytes: 1024, diskPath: tempDir };
    const cache1 = new HybridLRUCache<string>(opts);
    await cache1.set('x', '1');
    await cache1.set('y', '2');
    await cache1.set('z', '3'); // should remove 'x' from disk
    await cache1.quit();

    const files = await readdir(tempDir);
    expect(files.length).toBe(2);

    const cache2 = new HybridLRUCache<string>(opts);
    await new Promise((r) => setTimeout(r, 10));
    expect(await cache2.get('y')).toBe('2');
    expect(await cache2.get('z')).toBe('3');
    expect(await cache2.get('x')).toBeNull();
  });

  test('quit closes redis connection if used', async () => {
    const cache = new HybridLRUCache<string>({
      maxEntries: 1,
      memoryLimitBytes: 1024,
      diskPath: tempDir,
      redisConfig: { host: 'localhost', port: 6379 },
    });

    if (capturedRedisHandlers['ready']) {
      capturedRedisHandlers['ready'].forEach((h) => h());
    }
    await cache.quit();
    expect(mockRedisInstance.quit).toHaveBeenCalled();
    expect(cache.isHealthy()).toBe(false);
  });
});
