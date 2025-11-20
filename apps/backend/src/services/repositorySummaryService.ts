import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import simpleGit, { SimpleGit } from 'simple-git';
import {
  CreatedDateSource,
  RepositoryPlatform,
  RepositoryStatus,
  RepositorySummary,
  RepositoryUrlInfo,
  ValidationError,
} from '@gitray/shared-types';
import { getLogger } from './logger';
import redis from './cache';
import { coordinatedOperation } from './repositoryCoordinator';
import {
  differenceInDays,
  differenceInMonths,
  formatDistanceToNow,
} from 'date-fns';

const logger = getLogger();

const SUMMARY_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h
const BANDWIDTH_SAVED_LABEL = '95-99% vs full clone';
const ALLOWED_SUMMARY_HOSTS = (
  process.env.ALLOWED_GIT_HOSTS ?? 'github.com,gitlab.com,bitbucket.org'
)
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

class RepositorySummaryService {
  async getRepositorySummary(repoUrl: string): Promise<RepositorySummary> {
    const normalizedUrl = repoUrl.trim();
    const cacheKey = this.buildCacheKey(normalizedUrl);

    const cached = await this.readFromCache(cacheKey);
    if (cached) {
      return {
        ...cached,
        metadata: { ...cached.metadata, cached: true, dataSource: 'cache' },
      };
    }

    return coordinatedOperation(normalizedUrl, 'summary', async () => {
      const repoInfo = this.parseRepositoryUrl(normalizedUrl);
      const { tempDir, git } = await this.performSparseClone(repoInfo.fullUrl);

      try {
        const summary = await this.buildSummaryFromClone(
          git,
          tempDir,
          repoInfo
        );
        await this.writeToCache(cacheKey, summary);
        return summary;
      } finally {
        await this.cleanup(tempDir);
      }
    });
  }

  private async buildSummaryFromClone(
    git: SimpleGit,
    tempDir: string,
    repoInfo: RepositoryUrlInfo
  ): Promise<RepositorySummary> {
    const now = new Date();
    const totalCommits = await this.getCommitCount(git);

    if (totalCommits === 0) {
      return {
        repository: {
          name: repoInfo.name,
          owner: repoInfo.owner,
          url: repoInfo.fullUrl,
          platform: repoInfo.platform,
        },
        created: {
          date: '',
          source: 'first-commit',
        },
        age: {
          years: 0,
          months: 0,
          formatted: '0.0y',
        },
        lastCommit: {
          date: '',
          relativeTime: 'no commits',
          sha: '',
          author: '',
        },
        stats: {
          totalCommits: 0,
          contributors: 0,
          status: 'empty',
        },
        metadata: {
          cached: false,
          dataSource: 'git-sparse-clone',
          createdDateAccuracy: 'approximate',
          bandwidthSaved: BANDWIDTH_SAVED_LABEL,
          lastUpdated: now.toISOString(),
        },
      };
    }

    const firstCommitDate = await this.getFirstCommitDate(git);
    const lastCommit = await this.getLastCommitInfo(git);
    const contributors = await this.getContributorCount(git);

    const ageInfo = firstCommitDate
      ? this.calculateAgeInfo(firstCommitDate)
      : { years: 0, months: 0, formatted: '0.0y' };
    const lastCommitDate = lastCommit?.date
      ? new Date(lastCommit.date)
      : new Date();
    const status = this.determineStatus(lastCommitDate, totalCommits);

    return {
      repository: {
        name: repoInfo.name,
        owner: repoInfo.owner,
        url: repoInfo.fullUrl,
        platform: repoInfo.platform,
      },
      created: {
        date: firstCommitDate ?? '',
        source: this.getCreatedDateSource(repoInfo.platform),
      },
      age: ageInfo,
      lastCommit: {
        date: lastCommit?.date ?? '',
        relativeTime: lastCommit?.date
          ? formatDistanceToNow(new Date(lastCommit.date), { addSuffix: true })
          : 'unknown',
        sha: lastCommit?.sha ?? '',
        author: lastCommit?.author ?? '',
      },
      stats: {
        totalCommits,
        contributors,
        status,
      },
      metadata: {
        cached: false,
        dataSource: 'git-sparse-clone',
        createdDateAccuracy: 'approximate',
        bandwidthSaved: BANDWIDTH_SAVED_LABEL,
        lastUpdated: now.toISOString(),
      },
    };
  }

  private async performSparseClone(repoUrl: string): Promise<{
    tempDir: string;
    git: SimpleGit;
  }> {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'gitray-summary-'));
    const git = simpleGit(tempDir);

    try {
      await git.init();
      await git.addRemote('origin', repoUrl);
      await git.raw(['config', 'core.sparseCheckout', 'true']);
      // Fetch all commits from default branch (commit graph) but exclude file contents (blobs)
      // This allows accurate commit counting and contributor analysis
      // while still saving 95-99% bandwidth vs full clone
      await git.raw([
        'fetch',
        '--filter=blob:none', // Exclude file contents, keep commit history
        '--no-tags', // Skip tags to reduce bandwidth
        'origin',
        'HEAD', // Fetch default branch with full history
      ]);
      await git.raw(['checkout', 'FETCH_HEAD']);
      return { tempDir, git };
    } catch (error) {
      await this.cleanup(tempDir);
      logger.error('Sparse clone failed', { repoUrl, error });
      throw error;
    }
  }

  private async cleanup(tempDir: string): Promise<void> {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn('Failed to clean up temp directory', { tempDir, error });
    }
  }

  private async getFirstCommitDate(git: SimpleGit): Promise<string | null> {
    try {
      const output = await git.raw([
        'log',
        '--reverse',
        '--format=%aI',
        '--max-count=1',
      ]);
      const trimmed = output.trim();
      return trimmed || null;
    } catch (error) {
      if (this.isEmptyRepositoryError(error)) {
        return null;
      }
      logger.error('Failed to read first commit date', { error });
      throw error;
    }
  }

  private async getLastCommitInfo(
    git: SimpleGit
  ): Promise<{ date: string; sha: string; author: string } | null> {
    try {
      const output = await git.raw(['log', '-1', '--format=%aI|%H|%an']);
      const [date, sha, author] = output.trim().split('|');
      if (!date || !sha || !author) {
        return null;
      }
      return { date, sha, author };
    } catch (error) {
      if (this.isEmptyRepositoryError(error)) {
        return null;
      }
      logger.error('Failed to read last commit info', { error });
      throw error;
    }
  }

  private async getCommitCount(git: SimpleGit): Promise<number> {
    try {
      const output = await git.raw(['rev-list', '--count', 'HEAD']);
      const parsed = Number.parseInt(output.trim(), 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    } catch (error) {
      if (this.isEmptyRepositoryError(error)) {
        return 0;
      }
      logger.error('Failed to count commits', { error });
      throw error;
    }
  }

  private async getContributorCount(git: SimpleGit): Promise<number> {
    try {
      const output = await git.raw(['shortlog', '-s', '-n', 'HEAD']);
      const lines = output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      return lines.length;
    } catch (error) {
      if (this.isEmptyRepositoryError(error)) {
        return 0;
      }
      logger.error('Failed to count contributors', { error });
      throw error;
    }
  }

  private determineStatus(
    lastCommitDate: Date,
    totalCommits: number
  ): RepositoryStatus {
    if (totalCommits === 0) return 'empty';

    const daysSinceLastCommit = differenceInDays(new Date(), lastCommitDate);

    if (daysSinceLastCommit <= 30) return 'active';
    if (daysSinceLastCommit <= 180) return 'inactive';
    return 'archived';
  }

  private calculateAgeInfo(createdDate: string): {
    years: number;
    months: number;
    formatted: string;
  } {
    const created = new Date(createdDate);
    const months = Math.max(differenceInMonths(new Date(), created), 0);
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    const formatted = `${(months / 12).toFixed(1)}y`;

    return {
      years,
      months: remainingMonths,
      formatted,
    };
  }

  private getCreatedDateSource(
    platform: RepositoryPlatform
  ): CreatedDateSource {
    if (platform === 'github') return 'first-commit';
    if (platform === 'gitlab') return 'first-commit';
    if (platform === 'bitbucket') return 'first-commit';
    return 'first-commit';
  }

  private parseRepositoryUrl(repoUrl: string): RepositoryUrlInfo {
    if (!repoUrl) {
      throw new ValidationError('Repository URL is required');
    }

    const trimmed = repoUrl.trim();

    if (trimmed.startsWith('git@')) {
      const match = trimmed.match(/^git@([^:]+):(.+?)(\.git)?$/);
      if (!match) {
        throw new ValidationError('Invalid SSH repository URL format');
      }
      const [, host, pathPart] = match;
      const [owner, name] = pathPart.split('/');
      const normalizedHost = host.toLowerCase();

      if (!owner || !name) {
        throw new ValidationError('Repository URL must include owner and name');
      }

      this.assertAllowedHost(normalizedHost);

      return {
        platform: this.getPlatform(normalizedHost),
        owner,
        name: name.replace(/\.git$/, ''),
        fullUrl: trimmed,
      };
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new ValidationError('Invalid repository URL');
    }

    const normalizedHost = parsed.hostname.toLowerCase();
    this.assertAllowedHost(normalizedHost);

    const pathname = parsed.pathname.replace(/^\/+/, '').replace(/\.git$/, '');
    const [owner, name] = pathname.split('/');

    if (!owner || !name) {
      throw new ValidationError('Repository URL must include owner and name');
    }

    // Safely remove trailing slashes without regex backtracking vulnerability
    const urlString = parsed.toString();
    let trimmedUrl = urlString;
    while (trimmedUrl.endsWith('/')) {
      trimmedUrl = trimmedUrl.slice(0, -1);
    }

    return {
      platform: this.getPlatform(normalizedHost),
      owner,
      name,
      fullUrl:
        parsed.pathname.endsWith('.git') || parsed.pathname === ''
          ? urlString
          : `${trimmedUrl}.git`,
    };
  }

  private assertAllowedHost(hostname: string): void {
    if (ALLOWED_SUMMARY_HOSTS.length === 0) return;

    if (!ALLOWED_SUMMARY_HOSTS.includes(hostname)) {
      throw new ValidationError(
        `Repository host ${hostname} is not allowed for summary`
      );
    }
  }

  private getPlatform(hostname: string): RepositoryPlatform {
    if (hostname.includes('github')) return 'github';
    if (hostname.includes('gitlab')) return 'gitlab';
    if (hostname.includes('bitbucket')) return 'bitbucket';
    return 'other';
  }

  private isEmptyRepositoryError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return (
      message.includes('does not have any commits yet') ||
      message.includes("bad revision 'head'")
    );
  }

  private buildCacheKey(repoUrl: string): string {
    // Use SHA-256 instead of MD5 for better security (non-cryptographic cache key)
    const hash = crypto.createHash('sha256').update(repoUrl).digest('hex');
    return `repo:summary:${hash}`;
  }

  private async readFromCache(
    cacheKey: string
  ): Promise<RepositorySummary | null> {
    try {
      const cached = await redis.get(cacheKey);
      return cached ? (JSON.parse(cached) as RepositorySummary) : null;
    } catch (error) {
      logger.warn('Cache read failed for repository summary', {
        cacheKey,
        error,
      });
      return null;
    }
  }

  private async writeToCache(
    cacheKey: string,
    summary: RepositorySummary
  ): Promise<void> {
    try {
      await redis.set(
        cacheKey,
        JSON.stringify(summary),
        'EX',
        SUMMARY_CACHE_TTL_SECONDS
      );
    } catch (error) {
      logger.warn('Cache write failed for repository summary', {
        cacheKey,
        error,
      });
    }
  }
}

export const repositorySummaryService = new RepositorySummaryService();
