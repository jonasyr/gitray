import Redis from 'ioredis';
import { getLogger } from './logger';
import {
  distributedCacheInvalidations,
  distributedCacheInvalidationLatency,
} from './metrics';
import { recordDetailedError } from './metrics';

const logger = getLogger();

/**
 * Message format for distributed cache invalidation
 */
interface InvalidationMessage {
  pattern: string;
  timestamp: number;
  processId: string;
  metadata?: {
    repoUrl?: string;
    reason?: string;
    keysCount?: number;
  };
}

/**
 * Distributed Cache Invalidation Service
 *
 * Coordinates cache invalidation across multiple process instances using Redis pub/sub.
 * Prevents stale cache data when one process invalidates cache but others aren't notified.
 */
export class DistributedCacheInvalidation {
  private redis: Redis | null = null;
  private subscriber: Redis | null = null;
  private isHealthy = false;
  private processId: string;
  private subscriptions = new Set<string>();
  private invalidationHandlers = new Map<
    string,
    (pattern: string, metadata?: any) => Promise<void>
  >();

  constructor(redisConfig?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  }) {
    this.processId = `${process.pid}-${Date.now()}`;

    if (redisConfig) {
      this.initializeRedis(redisConfig);
    }
  }

  /**
   * Initialize Redis connections for pub/sub
   */
  private initializeRedis(redisConfig: any): void {
    try {
      // Publisher connection
      this.redis = new Redis({
        ...redisConfig,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryDelayOnFailover: 100,
      });

      // Subscriber connection (separate connection required for pub/sub)
      this.subscriber = new Redis({
        ...redisConfig,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryDelayOnFailover: 100,
      });

      this.redis.on('ready', () => {
        this.isHealthy = true;
        logger.info('Distributed cache invalidation Redis publisher ready');
      });

      this.redis.on('error', (err) => {
        this.isHealthy = false;
        logger.warn('Distributed cache invalidation Redis publisher error', {
          err,
        });
        recordDetailedError('cache', err, {
          userImpact: 'degraded',
          recoveryAction: 'fallback',
          severity: 'warning',
        });
      });

      this.subscriber.on('ready', () => {
        logger.info('Distributed cache invalidation Redis subscriber ready');
        this.setupSubscriptions();
      });

      this.subscriber.on('error', (err) => {
        logger.warn('Distributed cache invalidation Redis subscriber error', {
          err,
        });
      });
    } catch (err) {
      logger.warn('Failed to initialize distributed cache invalidation Redis', {
        err,
      });
      this.isHealthy = false;
    }
  }

  /**
   * Set up Redis subscriptions for invalidation messages
   */
  private setupSubscriptions(): void {
    if (!this.subscriber) return;

    this.subscriber.subscribe('cache:invalidate');
    this.subscriptions.add('cache:invalidate');

    this.subscriber.on('message', async (channel, message) => {
      if (channel === 'cache:invalidate') {
        await this.handleInvalidationMessage(message);
      }
    });
  }

  /**
   * Handle incoming invalidation messages from other processes
   */
  private async handleInvalidationMessage(message: string): Promise<void> {
    const startTime = Date.now();

    try {
      const invalidationMsg: InvalidationMessage = JSON.parse(message);

      // Don't process our own messages to avoid infinite loops
      if (invalidationMsg.processId === this.processId) {
        distributedCacheInvalidations.inc({
          source: 'local',
          status: 'ignored',
        });
        return;
      }

      // Find and execute the appropriate invalidation handler
      const handler =
        this.invalidationHandlers.get('repository') ||
        this.invalidationHandlers.get('default');

      if (handler) {
        await handler(invalidationMsg.pattern, invalidationMsg.metadata);

        distributedCacheInvalidations.inc({
          source: 'remote',
          status: 'success',
        });

        logger.debug('Processed distributed cache invalidation', {
          pattern: invalidationMsg.pattern,
          fromProcess: invalidationMsg.processId,
          metadata: invalidationMsg.metadata,
        });
      } else {
        logger.warn('No handler found for distributed cache invalidation', {
          pattern: invalidationMsg.pattern,
        });
        distributedCacheInvalidations.inc({
          source: 'remote',
          status: 'failed',
        });
      }
    } catch (err) {
      logger.error('Failed to process distributed cache invalidation message', {
        message,
        err: err instanceof Error ? err.message : String(err),
      });
      distributedCacheInvalidations.inc({ source: 'remote', status: 'failed' });

      recordDetailedError(
        'cache',
        err instanceof Error ? err : new Error(String(err)),
        {
          userImpact: 'degraded',
          recoveryAction: 'fallback',
          severity: 'warning',
        }
      );
    } finally {
      const duration = (Date.now() - startTime) / 1000;
      distributedCacheInvalidationLatency.observe(duration);
    }
  }

  /**
   * Register a handler for specific invalidation patterns
   */
  public registerInvalidationHandler(
    pattern: string,
    handler: (pattern: string, metadata?: any) => Promise<void>
  ): void {
    this.invalidationHandlers.set(pattern, handler);
    logger.debug('Registered distributed cache invalidation handler', {
      pattern,
    });
  }

  /**
   * Broadcast cache invalidation to all process instances
   */
  public async invalidateGlobally(
    pattern: string,
    metadata?: {
      repoUrl?: string;
      reason?: string;
      keysCount?: number;
    }
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Always invalidate locally first
      await this.invalidateLocally(pattern, metadata);

      // Then broadcast to other instances if Redis is available
      if (this.redis && this.isHealthy) {
        const message: InvalidationMessage = {
          pattern,
          timestamp: Date.now(),
          processId: this.processId,
          metadata,
        };

        await this.redis.publish('cache:invalidate', JSON.stringify(message));

        distributedCacheInvalidations.inc({
          source: 'local',
          status: 'success',
        });

        logger.debug('Broadcasted distributed cache invalidation', {
          pattern,
          metadata,
          processId: this.processId,
        });
      } else {
        // Redis not available - local invalidation only
        logger.warn('Redis unavailable, cache invalidation local only', {
          pattern,
        });
        distributedCacheInvalidations.inc({
          source: 'local',
          status: 'failed',
        });
      }
    } catch (err) {
      logger.error('Failed to broadcast distributed cache invalidation', {
        pattern,
        err: err instanceof Error ? err.message : String(err),
      });
      distributedCacheInvalidations.inc({ source: 'local', status: 'failed' });

      recordDetailedError(
        'cache',
        err instanceof Error ? err : new Error(String(err)),
        {
          userImpact: 'degraded',
          recoveryAction: 'fallback',
          severity: 'warning',
        }
      );
    } finally {
      const duration = (Date.now() - startTime) / 1000;
      distributedCacheInvalidationLatency.observe(duration);
    }
  }

  /**
   * Perform local cache invalidation
   */
  private async invalidateLocally(
    pattern: string,
    metadata?: any
  ): Promise<void> {
    const handler =
      this.invalidationHandlers.get('repository') ||
      this.invalidationHandlers.get('default');

    if (handler) {
      await handler(pattern, metadata);
    } else {
      logger.warn('No local invalidation handler available', { pattern });
    }
  }

  /**
   * Check if the distributed invalidation service is healthy
   */
  public isServiceHealthy(): boolean {
    return this.isHealthy || !this.redis; // Healthy if Redis not configured or working
  }

  /**
   * Gracefully shutdown the service
   */
  public async shutdown(): Promise<void> {
    try {
      if (this.subscriber) {
        await this.subscriber.unsubscribe();
        await this.subscriber.quit();
      }

      if (this.redis) {
        await this.redis.quit();
      }

      this.subscriptions.clear();
      this.invalidationHandlers.clear();

      logger.info('Distributed cache invalidation service shutdown completed');
    } catch (err) {
      logger.error(
        'Error during distributed cache invalidation service shutdown',
        { err }
      );
    }
  }
}

// Global instance for the application
let distributedCacheInvalidation: DistributedCacheInvalidation | null = null;

/**
 * Get or create the global distributed cache invalidation instance
 */
export function getDistributedCacheInvalidation(
  redisConfig?: any
): DistributedCacheInvalidation {
  if (!distributedCacheInvalidation) {
    distributedCacheInvalidation = new DistributedCacheInvalidation(
      redisConfig
    );
  }
  return distributedCacheInvalidation;
}

/**
 * Shutdown the global distributed cache invalidation instance
 */
export async function shutdownDistributedCacheInvalidation(): Promise<void> {
  if (distributedCacheInvalidation) {
    await distributedCacheInvalidation.shutdown();
    distributedCacheInvalidation = null;
  }
}
