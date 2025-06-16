import { Worker, isMainThread, parentPort } from 'worker_threads';
import { cpus } from 'os';

if (!isMainThread) {
  // Worker thread code
  parentPort?.on('message', (data: any) => {
    try {
      const json = JSON.stringify(data);
      const size = Buffer.byteLength(json, 'utf8');

      parentPort?.postMessage({
        success: true,
        json,
        size,
      });
    } catch (error) {
      parentPort?.postMessage({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown serialization error',
      });
    }
  });
}

export interface SerializationResult {
  success: true;
  json: string;
  size: number;
}

export interface SerializationError {
  success: false;
  error: string;
}

export type SerializationResponse = SerializationResult | SerializationError;

export interface SerializationTask<T> {
  data: T;
  resolve: (result: SerializationResult) => void;
  reject: (error: Error) => void;
}

/**
 * High-performance serialization pool using worker threads
 * Prevents JSON.stringify operations from blocking the main event loop
 */
export class SerializationPool {
  private workers: Worker[] = [];
  private queue: SerializationTask<any>[] = [];
  private activeTasks: Set<SerializationTask<any>> = new Set();
  private readonly poolSize: number;
  private readonly workerCode: string;
  private isDestroyed = false;
  private readonly useWorkers: boolean;

  constructor(poolSize = Math.max(2, Math.min(4, cpus().length))) {
    this.poolSize = poolSize;
    // Disable workers in test environment to avoid file extension issues
    this.useWorkers =
      process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true';

    // Inline worker code to avoid file extension issues
    this.workerCode = `
      const { parentPort } = require('worker_threads');
      
      parentPort?.on('message', (data) => {
        try {
          const json = JSON.stringify(data);
          const size = Buffer.byteLength(json, 'utf8');
          
          parentPort?.postMessage({
            success: true,
            json,
            size,
          });
        } catch (error) {
          parentPort?.postMessage({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown serialization error',
          });
        }
      });
    `;

    if (this.useWorkers) {
      this.initializeWorkers();
    }
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.poolSize; i++) {
      this.createWorker();
    }
  }

  private createWorker(): Worker | null {
    try {
      const worker = new Worker(this.workerCode, { eval: true });

      worker.on('error', (error) => {
        console.error('Serialization worker error:', error);
        // Remove failed worker and create a new one
        const index = this.workers.indexOf(worker);
        if (index > -1) {
          this.workers.splice(index, 1);
          if (!this.isDestroyed) {
            this.createWorker();
          }
        }
      });

      worker.on('exit', (code) => {
        if (code !== 0 && !this.isDestroyed) {
          console.warn(`Serialization worker exited with code ${code}`);
          // Remove and replace the worker if it wasn't a clean shutdown
          const index = this.workers.indexOf(worker);
          if (index > -1) {
            this.workers.splice(index, 1);
            this.createWorker();
          }
        }
      });

      this.workers.push(worker);
      return worker;
    } catch (error) {
      console.error('Failed to create worker:', error);
      // If worker creation fails, we'll fall back to sync mode
      return null;
    }
  }

  /**
   * Serialize data asynchronously using worker threads or fallback to sync
   */
  async serialize<T>(data: T): Promise<SerializationResult> {
    if (this.isDestroyed) {
      throw new Error('SerializationPool has been destroyed');
    }

    // Fallback to synchronous serialization in test environments or when workers are disabled
    if (!this.useWorkers || this.workers.length === 0) {
      try {
        const json = JSON.stringify(data);
        const size = Buffer.byteLength(json, 'utf8');
        return { success: true, json, size };
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : 'Unknown serialization error'
        );
      }
    }

    return new Promise<SerializationResult>((resolve, reject) => {
      const task: SerializationTask<T> = {
        data,
        resolve,
        reject,
      };

      this.queue.push(task);
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (
      this.queue.length === 0 ||
      this.workers.length === 0 ||
      !this.useWorkers
    ) {
      return;
    }

    const availableWorker = this.workers.find(
      (worker) => !worker.listenerCount('message')
    );
    if (!availableWorker) {
      return; // All workers are busy
    }

    const task = this.queue.shift()!;
    this.activeTasks.add(task);

    // Set up one-time listeners for this specific task
    const messageHandler = (response: SerializationResponse) => {
      availableWorker.off('message', messageHandler);
      availableWorker.off('error', errorHandler);
      this.activeTasks.delete(task);

      if (response.success) {
        task.resolve(response);
      } else {
        task.reject(new Error(response.error));
      }

      // Process next task if any
      this.processQueue();
    };

    const errorHandler = (error: Error) => {
      availableWorker.off('message', messageHandler);
      availableWorker.off('error', errorHandler);
      this.activeTasks.delete(task);
      task.reject(error);

      // Process next task if any
      this.processQueue();
    };

    availableWorker.once('message', messageHandler);
    availableWorker.once('error', errorHandler);

    // Send task to worker
    availableWorker.postMessage(task.data);
  }

  /**
   * Gracefully shutdown the worker pool
   */
  async destroy(): Promise<void> {
    this.isDestroyed = true;

    // Reject all pending tasks in queue
    for (const task of this.queue) {
      task.reject(new Error('SerializationPool destroyed'));
    }
    this.queue.length = 0;

    // Reject all active tasks being processed by workers
    for (const task of this.activeTasks) {
      task.reject(new Error('SerializationPool destroyed'));
    }
    this.activeTasks.clear();

    // Terminate all workers if using worker threads
    if (this.useWorkers) {
      await Promise.allSettled(
        this.workers.map((worker) => worker.terminate())
      );
    }
    this.workers.length = 0;
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      poolSize: this.poolSize,
      activeWorkers: this.useWorkers ? this.workers.length : 0,
      queueLength: this.queue.length,
      isDestroyed: this.isDestroyed,
      useWorkers: this.useWorkers,
    };
  }
}
