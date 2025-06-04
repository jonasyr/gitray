import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import logger from '../services/logger';

// Simple file-based lock mechanism for cross-process coordination
const LOCK_ROOT =
  process.env.LOCK_DIR || path.join(os.tmpdir(), 'gitray-locks');
const DEFAULT_TIMEOUT = Number(process.env.CACHE_LOCK_TIMEOUT_MS) || 120000; // 2 min

const inflight = new Map<string, Promise<unknown>>();

async function ensureDir(): Promise<void> {
  await fs.mkdir(LOCK_ROOT, { recursive: true });
}

async function tryRemoveIfStale(
  lockPath: string,
  timeout: number
): Promise<void> {
  try {
    const stat = await fs.stat(lockPath);
    if (Date.now() - stat.mtimeMs > timeout) {
      await fs.unlink(lockPath);
    }
  } catch {
    // ignore
  }
}

async function acquire(
  lockKey: string,
  timeout = DEFAULT_TIMEOUT
): Promise<fs.FileHandle> {
  await ensureDir();
  const lockPath = path.join(LOCK_ROOT, encodeURIComponent(lockKey));
  const start = Date.now();
  while (true) {
    try {
      return await fs.open(lockPath, 'wx');
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
      await tryRemoveIfStale(lockPath, timeout);
      if (Date.now() - start > timeout) {
        throw new Error(`Lock timeout for ${lockKey}`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

async function release(handle: fs.FileHandle, lockKey: string): Promise<void> {
  const lockPath = path.join(LOCK_ROOT, encodeURIComponent(lockKey));
  try {
    await handle.close();
  } catch (err) {
    logger.warn('Failed to close lock handle', { lockKey, err });
  }
  try {
    await fs.unlink(lockPath);
  } catch (err) {
    logger.warn('Failed to remove lock file', { lockKey, err });
  }
}

export async function withKeyLock<T>(
  key: string,
  fn: () => Promise<T>,
  timeout = DEFAULT_TIMEOUT
): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const handle = await acquire(key, timeout);
    try {
      return await fn();
    } finally {
      await release(handle, key);
    }
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}
