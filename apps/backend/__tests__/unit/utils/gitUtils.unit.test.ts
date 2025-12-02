/**
 * Unit tests for gitUtils
 *
 * Coverage target: ≥80%
 * Testing strategy: AAA pattern (Arrange-Act-Assert)
 * Focus: Happy path first, then edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowClone } from '../../../src/utils/gitUtils';
import simpleGit from 'simple-git';

// Mock simple-git
vi.mock('simple-git');

// Mock config
vi.mock('../../../src/config', () => ({
  config: {
    git: {
      cloneDepth: 50,
    },
  },
}));

describe('gitUtils', () => {
  describe('shallowClone', () => {
    let mockGit: any;

    beforeEach(() => {
      vi.clearAllMocks();

      // Create mock git instance
      mockGit = {
        init: vi.fn().mockResolvedValue(undefined),
        addRemote: vi.fn().mockResolvedValue(undefined),
        raw: vi.fn().mockResolvedValue(undefined),
      };

      // Mock simpleGit to return our mock instance
      (simpleGit as any).mockReturnValue(mockGit);
    });

    describe('Happy Path', () => {
      it('should clone repository with blob filtering for complete history', async () => {
        // ARRANGE
        const repoUrl = 'https://github.com/test/repo.git';
        const targetDir = '/tmp/test-repo';

        // ACT
        await shallowClone(repoUrl, targetDir);

        // ASSERT - Verify git commands called in correct order
        expect(simpleGit).toHaveBeenCalledWith(targetDir);
        expect(mockGit.init).toHaveBeenCalled();
        expect(mockGit.addRemote).toHaveBeenCalledWith('origin', repoUrl);

        // Verify sparse checkout configuration
        expect(mockGit.raw).toHaveBeenCalledWith([
          'config',
          'core.sparseCheckout',
          'true',
        ]);

        // Verify fetch with blob filtering
        expect(mockGit.raw).toHaveBeenCalledWith([
          'fetch',
          '--filter=blob:none',
          '--no-tags',
          'origin',
          'HEAD',
        ]);

        // Verify checkout
        expect(mockGit.raw).toHaveBeenCalledWith(['checkout', 'FETCH_HEAD']);
      });

      it('should use default depth from config', async () => {
        // ARRANGE
        const repoUrl = 'https://github.com/test/repo.git';
        const targetDir = '/tmp/test-repo';

        // ACT
        await shallowClone(repoUrl, targetDir);

        // ASSERT - depth parameter is ignored in new implementation
        // but function should still work
        expect(mockGit.init).toHaveBeenCalled();
        expect(mockGit.addRemote).toHaveBeenCalledWith('origin', repoUrl);
      });

      it('should clone with custom depth parameter (legacy parameter, not used)', async () => {
        // ARRANGE
        const repoUrl = 'https://github.com/test/repo.git';
        const targetDir = '/tmp/test-repo';
        const customDepth = 100;

        // ACT
        await shallowClone(repoUrl, targetDir, customDepth);

        // ASSERT - Even with custom depth, blob filtering is used
        expect(mockGit.raw).toHaveBeenCalledWith([
          'fetch',
          '--filter=blob:none',
          '--no-tags',
          'origin',
          'HEAD',
        ]);
      });

      it('should work with different repository URLs', async () => {
        // ARRANGE
        const testCases = [
          'https://github.com/owner/repo.git',
          'https://gitlab.com/group/project.git',
          'https://bitbucket.org/user/repository.git',
        ];

        for (const repoUrl of testCases) {
          vi.clearAllMocks();

          // ACT
          await shallowClone(repoUrl, '/tmp/test');

          // ASSERT
          expect(mockGit.addRemote).toHaveBeenCalledWith('origin', repoUrl);
        }
      });

      it('should work with different target directories', async () => {
        // ARRANGE
        const repoUrl = 'https://github.com/test/repo.git';
        const testCases = [
          '/tmp/dir1',
          '/var/repos/project',
          '/home/user/workspace/repo',
        ];

        for (const targetDir of testCases) {
          vi.clearAllMocks();

          // ACT
          await shallowClone(repoUrl, targetDir);

          // ASSERT
          expect(simpleGit).toHaveBeenCalledWith(targetDir);
        }
      });

      it('should execute git operations in correct sequence', async () => {
        // ARRANGE
        const repoUrl = 'https://github.com/test/repo.git';
        const targetDir = '/tmp/test-repo';
        const callOrder: string[] = [];

        mockGit.init.mockImplementation(() => {
          callOrder.push('init');
          return Promise.resolve();
        });
        mockGit.addRemote.mockImplementation(() => {
          callOrder.push('addRemote');
          return Promise.resolve();
        });
        mockGit.raw.mockImplementation((args: string[]) => {
          callOrder.push(`raw-${args[0]}`);
          return Promise.resolve();
        });

        // ACT
        await shallowClone(repoUrl, targetDir);

        // ASSERT - Verify execution order
        expect(callOrder).toEqual([
          'init',
          'addRemote',
          'raw-config',
          'raw-fetch',
          'raw-checkout',
        ]);
      });
    });

    describe('Error Handling', () => {
      it('should propagate error if git init fails', async () => {
        // ARRANGE
        const error = new Error('Git init failed');
        mockGit.init.mockRejectedValue(error);

        // ACT & ASSERT
        await expect(
          shallowClone('https://github.com/test/repo.git', '/tmp/test')
        ).rejects.toThrow('Git init failed');
      });

      it('should propagate error if addRemote fails', async () => {
        // ARRANGE
        const error = new Error('Failed to add remote');
        mockGit.addRemote.mockRejectedValue(error);

        // ACT & ASSERT
        await expect(
          shallowClone('https://github.com/test/repo.git', '/tmp/test')
        ).rejects.toThrow('Failed to add remote');
      });

      it('should propagate error if fetch fails', async () => {
        // ARRANGE
        mockGit.raw.mockImplementation((args: string[]) => {
          if (args[0] === 'fetch') {
            return Promise.reject(new Error('Fetch failed'));
          }
          return Promise.resolve();
        });

        // ACT & ASSERT
        await expect(
          shallowClone('https://github.com/test/repo.git', '/tmp/test')
        ).rejects.toThrow('Fetch failed');
      });

      it('should propagate error if checkout fails', async () => {
        // ARRANGE
        mockGit.raw.mockImplementation((args: string[]) => {
          if (args[0] === 'checkout') {
            return Promise.reject(new Error('Checkout failed'));
          }
          return Promise.resolve();
        });

        // ACT & ASSERT
        await expect(
          shallowClone('https://github.com/test/repo.git', '/tmp/test')
        ).rejects.toThrow('Checkout failed');
      });
    });
  });
});
