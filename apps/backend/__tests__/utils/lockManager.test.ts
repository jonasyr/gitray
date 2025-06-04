import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { withKeyLock } from '../../src/utils/lockManager';

describe('withKeyLock', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'locktest-'));
    process.env.LOCK_DIR = tempDir;
  });

  afterEach(async () => {
    delete process.env.LOCK_DIR;
    await rm(tempDir, { recursive: true, force: true });
  });

  test('serializes concurrent calls for the same key', async () => {
    let counter = 0;
    const fn = async () => {
      counter += 1;
      await new Promise((r) => setTimeout(r, 50));
      return counter;
    };

    const [a, b] = await Promise.all([
      withKeyLock('repo', fn),
      withKeyLock('repo', fn),
    ]);

    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(counter).toBe(1);
  });
});
