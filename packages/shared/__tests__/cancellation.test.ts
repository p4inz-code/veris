import { describe, it, expect } from 'vitest';
import { CancellationTokenSource } from '../src/types/cancellation.js';

describe('CancellationToken', () => {
  it('starts as not cancelled', () => {
    const source = new CancellationTokenSource();
    expect(source.isCancelled).toBe(false);
    expect(source.token.isCancelled).toBe(false);
  });

  it('becomes cancelled after cancel()', () => {
    const source = new CancellationTokenSource();
    source.cancel('Test reason');
    expect(source.isCancelled).toBe(true);
    expect(source.token.reason?.message).toBe('Test reason');
  });

  it('throwIfCancelled throws after cancellation', () => {
    const source = new CancellationTokenSource();
    expect(() => source.token.throwIfCancelled()).not.toThrow();
    source.cancel();
    expect(() => source.token.throwIfCancelled()).toThrow('Operation cancelled');
  });

  it('notifies listeners on cancellation', () => {
    const source = new CancellationTokenSource();
    let called = false;
    source.token.onCancelled(() => {
      called = true;
    });
    expect(called).toBe(false);
    source.cancel('reason');
    expect(called).toBe(true);
  });

  it('unregister prevents listener from being called', () => {
    const source = new CancellationTokenSource();
    let called = false;
    const unregister = source.token.onCancelled(() => {
      called = true;
    });
    unregister();
    source.cancel();
    expect(called).toBe(false);
  });

  it('linked source cancels when parent cancels', () => {
    const source = new CancellationTokenSource();
    const linked = source.createLinkedSource();
    expect(linked.isCancelled).toBe(false);
    source.cancel('parent cancelled');
    expect(linked.isCancelled).toBe(true);
  });
});
