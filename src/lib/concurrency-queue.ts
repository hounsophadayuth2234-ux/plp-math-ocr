/**
 * Bounded Concurrency Queue for Resource-Intensive Processing Tasks
 *
 * Guarantees that at most `maxConcurrent` jobs (default: 4) process simultaneously.
 * Additional jobs are safely placed into a FIFO waiting queue with positional telemetry.
 * Supports cancellation via AbortSignal both while waiting in queue and during execution.
 */

export interface QueueStatus {
  position: number; // 1-indexed position in waiting queue (0 if currently active)
  totalQueued: number;
  activeCount: number;
  maxConcurrent: number;
}

export interface EnqueueOptions {
  id?: string;
  signal?: AbortSignal;
  onQueueStatus?: (status: QueueStatus) => void;
}

interface QueuedTask<T> {
  id: string;
  fn: (signal?: AbortSignal) => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
  onQueueStatus?: (status: QueueStatus) => void;
  enqueuedAt: number;
}

export class ConcurrencyQueue {
  private readonly maxConcurrent: number;
  private activeCount = 0;
  private waitingQueue: QueuedTask<unknown>[] = [];
  private taskCounter = 0;

  constructor(maxConcurrent = 4) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  public getMaxConcurrent(): number {
    return this.maxConcurrent;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public getQueueLength(): number {
    return this.waitingQueue.length;
  }

  public getStatus(taskId?: string): QueueStatus {
    const idx = taskId ? this.waitingQueue.findIndex((t) => t.id === taskId) : -1;
    return {
      position: idx >= 0 ? idx + 1 : 0,
      totalQueued: this.waitingQueue.length,
      activeCount: this.activeCount,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /**
   * Enqueues a task. If active slots (< maxConcurrent) are available, executes immediately.
   * Otherwise, safely queues the task until a slot frees up.
   */
  public enqueue<T>(
    fn: (signal?: AbortSignal) => Promise<T>,
    options?: EnqueueOptions
  ): Promise<T> {
    const id = options?.id || `task_${Date.now()}_${++this.taskCounter}`;
    const signal = options?.signal;

    if (signal?.aborted) {
      const err = new Error("Task aborted by user before queueing.");
      err.name = "AbortError";
      return Promise.reject(err);
    }

    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id,
        fn,
        resolve: resolve as (val: unknown) => void,
        reject,
        signal,
        onQueueStatus: options?.onQueueStatus,
        enqueuedAt: performance.now(),
      };

      if (this.activeCount < this.maxConcurrent) {
        this.runTask(task as QueuedTask<unknown>);
      } else {
        // Handle abort while waiting in queue
        if (signal) {
          const onAbort = () => {
            const queueIdx = this.waitingQueue.findIndex((t) => t.id === id);
            if (queueIdx >= 0) {
              this.waitingQueue.splice(queueIdx, 1);
              this.broadcastQueuePositions();
              const err = new Error("Task aborted by user while waiting in queue.");
              err.name = "AbortError";
              reject(err);
            }
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }

        this.waitingQueue.push(task as QueuedTask<unknown>);
        options?.onQueueStatus?.({
          position: this.waitingQueue.length,
          totalQueued: this.waitingQueue.length,
          activeCount: this.activeCount,
          maxConcurrent: this.maxConcurrent,
        });
      }
    });
  }

  private async runTask(task: QueuedTask<unknown>): Promise<void> {
    if (task.signal?.aborted) {
      const err = new Error("Task aborted by user.");
      err.name = "AbortError";
      task.reject(err);
      this.dispatchNext();
      return;
    }

    this.activeCount++;
    task.onQueueStatus?.({
      position: 0,
      totalQueued: this.waitingQueue.length,
      activeCount: this.activeCount,
      maxConcurrent: this.maxConcurrent,
    });

    try {
      const result = await task.fn(task.signal);
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.dispatchNext();
    }
  }

  private dispatchNext(): void {
    if (this.waitingQueue.length === 0 || this.activeCount >= this.maxConcurrent) {
      return;
    }

    const nextTask = this.waitingQueue.shift();
    if (nextTask) {
      this.broadcastQueuePositions();
      this.runTask(nextTask);
    }
  }

  private broadcastQueuePositions(): void {
    for (let i = 0; i < this.waitingQueue.length; i++) {
      const task = this.waitingQueue[i];
      task.onQueueStatus?.({
        position: i + 1,
        totalQueued: this.waitingQueue.length,
        activeCount: this.activeCount,
        maxConcurrent: this.maxConcurrent,
      });
    }
  }

  /**
   * Clears all waiting tasks, rejecting them with AbortError.
   */
  public clear(): void {
    const waiting = [...this.waitingQueue];
    this.waitingQueue = [];
    for (const t of waiting) {
      const err = new Error("Queue cleared.");
      err.name = "AbortError";
      t.reject(err);
    }
  }
}

/**
 * Global singleton queue limiting active background removal processing to 4 concurrent users
 */
export const bgRemovalQueue = new ConcurrencyQueue(4);

/**
 * General high-throughput bounded queue for image processing (4 concurrent)
 */
export const imageProcessingQueue = new ConcurrencyQueue(4);
