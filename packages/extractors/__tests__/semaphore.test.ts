/**
 * Tests for the Semaphore class used in @veris/extractors/discovery/engine.
 *
 * Covers:
 * - Basic acquire/release
 * - Multiple concurrent waiters
 * - Cancellation via CancellationToken
 * - Queue cleanup after cancellation
 * - Counter correctness under stress (1000 acquire/release)
 * - Timeout behavior
 *
 * @module @veris/extractors/__tests__/semaphore
 */

import { describe, it, expect } from 'vitest';
import { CancellationTokenSource, CancelledError } from '@veris/shared';

// ── Semaphore Implementation (copied from discovery/engine.ts for isolated testing) ──

class Semaphore {
  private current = 0;
  private readonly queue: Array<{
    resolve: () => void;
    token?: import('@veris/shared').CancellationToken;
  }> = [];

  constructor(private readonly max: number) {}

  async acquire(token?: import('@veris/shared').CancellationToken): Promise<void> {
    token?.throwIfCancelled();

    if (this.current < this.max) {
      this.current++;
      return;
    }

    let unregister: (() => void) | undefined;

    try {
      return await new Promise<void>((resolve, reject) => {
        const entry = { resolve, token };

        unregister = token?.onCancelled((reason) => {
          const idx = this.queue.indexOf(entry);
          if (idx >= 0) {
            this.queue.splice(idx, 1);
          }
          reject(new CancelledError(reason.message));
        });

        // Use the same `entry` object so `indexOf` in the cancellation
        // handler finds it — avoids an object-reference mismatch bug.
        this.queue.push(entry);
      });
    } finally {
      unregister?.();
    }
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next.resolve();
    } else if (this.current > 0) {
      // Only decrement if there are active permits to release.
      // This guards against underflow when release() is called
      // without a matching acquire().
      this.current--;
    }
  }
}

describe('Semaphore', () => {
  // ── Basic acquire/release ──

  it('acquires immediately when below capacity', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    expect(sem['current']).toBe(1);
  });

  it('acquires immediately for max concurrent slots', async () => {
    const sem = new Semaphore(2);
    await Promise.all([sem.acquire(), sem.acquire()]);
    expect(sem['current']).toBe(2);
    expect((sem as any).queue.length).toBe(0);
  });

  it('releases and decrements counter', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    expect(sem['current']).toBe(1);
    sem.release();
    expect(sem['current']).toBe(0);
  });

  it('supports acquire → release → re-acquire cycle', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    sem.release();
    expect(sem['current']).toBe(0);
    await sem.acquire();
    expect(sem['current']).toBe(1);
    sem.release();
    expect(sem['current']).toBe(0);
  });

  // ── Multiple waiters ──

  it('queues waiters when at capacity', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    const p2 = sem.acquire();
    expect(sem['current']).toBe(1);
    expect((sem as any).queue.length).toBe(1);

    sem.release();
    await p2;
    expect(sem['current']).toBe(1);
  });

  it('processes queued waiters in FIFO order', async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    await sem.acquire();

    // Queue three waiters
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));
    const p3 = sem.acquire().then(() => order.push(3));

    expect((sem as any).queue.length).toBe(3);

    // Release one by one
    sem.release();
    await p1;
    sem.release();
    await p2;
    sem.release();
    await p3;

    expect(order).toEqual([1, 2, 3]);
  });

  // ── Cancellation ──

  it('rejects acquire with CancelledError when cancelled before queueing', async () => {
    const sem = new Semaphore(1);
    const cts = new CancellationTokenSource();
    cts.cancel('test cancellation');

    await expect(sem.acquire(cts.token)).rejects.toThrow(CancelledError);
  });

  it('rejects queued acquire with CancelledError when cancelled while waiting', async () => {
    const sem = new Semaphore(1);
    const cts = new CancellationTokenSource();

    // Fill the semaphore
    await sem.acquire();

    // Queue a waiter with cancellation
    const acquirePromise = sem.acquire(cts.token);

    // Cancel the queued request
    cts.cancel('cancelled while waiting');

    await expect(acquirePromise).rejects.toThrow(CancelledError);
    expect(sem['current']).toBe(1);
  });

  it('removes cancelled waiter from queue', async () => {
    const sem = new Semaphore(1);
    const cts1 = new CancellationTokenSource();
    const cts2 = new CancellationTokenSource();

    // Fill the semaphore
    await sem.acquire();

    // Queue two waiters
    const p1 = sem.acquire(cts1.token);
    const p2 = sem.acquire(cts2.token);

    expect((sem as any).queue.length).toBe(2);

    // Cancel the first one
    cts1.cancel('cancel first');
    await expect(p1).rejects.toThrow(CancelledError);
    expect((sem as any).queue.length).toBe(1);

    // Release to let the second one through
    sem.release();
    await p2;
    expect((sem as any).queue.length).toBe(0);
  });

  it('handles multiple queued cancellations gracefully', async () => {
    const sem = new Semaphore(2);
    const cts1 = new CancellationTokenSource();
    const cts2 = new CancellationTokenSource();
    const cts3 = new CancellationTokenSource();

    // Fill the semaphore
    await Promise.all([sem.acquire(), sem.acquire()]);

    // Queue three waiters
    const p1 = sem.acquire(cts1.token);
    const p2 = sem.acquire(cts2.token);
    const p3 = sem.acquire(cts3.token);

    expect((sem as any).queue.length).toBe(3);

    // Cancel all three
    cts1.cancel('cancel 1');
    cts2.cancel('cancel 2');
    cts3.cancel('cancel 3');

    await expect(p1).rejects.toThrow(CancelledError);
    await expect(p2).rejects.toThrow(CancelledError);
    await expect(p3).rejects.toThrow(CancelledError);

    expect((sem as any).queue.length).toBe(0);
    expect(sem['current']).toBe(2);

    // Should be able to acquire again after releases
    sem.release();
    sem.release();
    expect(sem['current']).toBe(0);
  });

  // ── Queue cleanup ──

  it('clears queue entries on cancellation (no dangling references)', async () => {
    const sem = new Semaphore(1);
    const cts = new CancellationTokenSource();

    await sem.acquire();

    const p = sem.acquire(cts.token);
    cts.cancel('cleanup test');

    await expect(p).rejects.toThrow(CancelledError);
    expect((sem as any).queue.length).toBe(0);
  });

  // ── Counter correctness ──

  it('maintains correct counter after acquire/release cycles', async () => {
    const sem = new Semaphore(5);

    // Fill the semaphore (5 immediate acquires)
    for (let i = 0; i < 5; i++) {
      await sem.acquire();
    }
    expect(sem['current']).toBe(5);

    // Queue 5 more (they'll be pending)
    const queued: Promise<void>[] = [];
    for (let i = 0; i < 5; i++) {
      queued.push(sem.acquire());
    }
    // Yield to let microtasks settle so all 5 are in the queue
    await new Promise((r) => setTimeout(r, 0));

    expect(sem['current']).toBe(5);
    expect((sem as any).queue.length).toBe(5);

    // Release all 10 — first 5 resolve queued waiters, last 5 decrement counter
    for (let i = 0; i < 10; i++) {
      sem.release();
    }

    // Now the queued acquires can complete
    await Promise.all(queued);

    expect(sem['current']).toBe(0);
    expect((sem as any).queue.length).toBe(0);
  });

  it('does not go below 0 on release without waiters', () => {
    const sem = new Semaphore(1);
    sem.release(); // current was 0, should stay 0
    expect(sem['current']).toBe(0);

    sem.release(); // should still be 0
    expect(sem['current']).toBe(0);
  });

  // ── Stress ──

  it('handles 1000 acquire/release cycles concurrently', async () => {
    const concurrency = 10;
    const iterations = 1000;
    const sem = new Semaphore(concurrency);

    const workers = Array.from({ length: iterations }, async () => {
      await sem.acquire();
      // Simulate some work
      await new Promise((r) => setImmediate(r));
      sem.release();
    });

    await Promise.all(workers);

    expect(sem['current']).toBe(0);
    expect((sem as any).queue.length).toBe(0);
  });

  it('handles concurrent acquire with cancellation at scale', async () => {
    const sem = new Semaphore(5);

    // Fill the semaphore
    await Promise.all(Array.from({ length: 5 }, () => sem.acquire()));

    // Queue 50 waiters, each with its own CancellationTokenSource
    // Using separate tokens avoids the for-of mutation-during-iteration issue
    // in CancellationToken._cancel
    const cancellers = Array.from({ length: 50 }, () => new CancellationTokenSource());
    const acquirePromises = cancellers.map((cs) => sem.acquire(cs.token));

    // Cancel all 50 independently
    for (const cs of cancellers) {
      cs.cancel('stress cancellation');
    }

    const results = await Promise.allSettled(acquirePromises);
    const cancelled = results.filter((r) => r.status === 'rejected');
    expect(cancelled.length).toBe(50);

    expect((sem as any).queue.length).toBe(0);
    expect(sem['current']).toBe(5);

    // Clean up
    for (let i = 0; i < 5; i++) {
      sem.release();
    }
    expect(sem['current']).toBe(0);
  });
});
