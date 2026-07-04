import { describe, it, expect } from 'vitest';
import { using, usingAsync } from '../src/types/disposable.js';

describe('Disposable', () => {
  it('disposes resource after use', () => {
    let disposed = false;
    const resource = {
      dispose: () => {
        disposed = true;
      },
    };
    const result = using(resource, (r) => {
      expect(disposed).toBe(false);
      return 42;
    });
    expect(result).toBe(42);
    expect(disposed).toBe(true);
  });

  it('disposes even on throw', () => {
    let disposed = false;
    const resource = {
      dispose: () => {
        disposed = true;
      },
    };
    expect(() =>
      using(resource, () => {
        throw new Error('fail');
      }),
    ).toThrow();
    expect(disposed).toBe(true);
  });
});

describe('AsyncDisposable', () => {
  it('disposes async resource after use', async () => {
    let disposed = false;
    const resource = {
      dispose: async () => {
        disposed = true;
      },
    };
    const result = await usingAsync(resource, async (r) => {
      expect(disposed).toBe(false);
      return 42;
    });
    expect(result).toBe(42);
    expect(disposed).toBe(true);
  });
});
