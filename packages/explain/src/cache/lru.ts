/**
 * LRU — Least Recently Used eviction tracking.
 *
 * Maintains an ordered list of cache keys where the most recently accessed
 * key is at the end and the least recently accessed is at the front.
 * Provides O(1) touch and shift operations via a doubly-linked list pattern.
 *
 * @module @veris/explain/cache/lru
 */

// ── LRU Entry ──

/** A node in the LRU linked list. */
interface LruNode {
  readonly key: string;
  next: LruNode | null;
  prev: LruNode | null;
}

// ── LRU Tracker ──

/**
 * Tracks access order for LRU eviction.
 *
 * Maintains a doubly-linked list where:
 * - head = least recently used (first to evict)
 * - tail = most recently used (last to evict)
 */
export class LruTracker {
  private head: LruNode | null = null;
  private tail: LruNode | null = null;
  private readonly nodes = new Map<string, LruNode>();

  /**
   * Record an access to a key (move it to the tail).
   *
   * @param key - The accessed cache key.
   */
  touch(key: string): void {
    const existing = this.nodes.get(key);
    if (existing) {
      this.removeNode(existing);
      this.appendToTail(existing);
    } else {
      const node: LruNode = { key, next: null, prev: null };
      this.nodes.set(key, node);
      this.appendToTail(node);
    }
  }

  /**
   * Remove a key from the LRU tracking entirely.
   *
   * @param key - The key to remove.
   */
  remove(key: string): void {
    const node = this.nodes.get(key);
    if (node) {
      this.removeNode(node);
      this.nodes.delete(key);
    }
  }

  /**
   * Get the least recently used key (head of the list).
   *
   * @returns The LRU key, or undefined if empty.
   */
  getLeastRecentlyUsed(): string | undefined {
    return this.head?.key;
  }

  /**
   * Evict and return the least recently used key.
   *
   * @returns The evicted key, or undefined if empty.
   */
  evictLru(): string | undefined {
    if (!this.head) return undefined;

    const evicted = this.head;
    this.removeNode(evicted);
    this.nodes.delete(evicted.key);
    return evicted.key;
  }

  /**
   * Check if a key is tracked.
   *
   * @param key - The key to check.
   * @returns True if the key is in the LRU tracker.
   */
  has(key: string): boolean {
    return this.nodes.has(key);
  }

  /**
   * Get the number of tracked keys.
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Clear all tracked keys.
   */
  clear(): void {
    this.head = null;
    this.tail = null;
    this.nodes.clear();
  }

  /**
   * Get all keys in order from LRU to MRU.
   */
  keys(): string[] {
    const result: string[] = [];
    let current = this.head;
    while (current) {
      result.push(current.key);
      current = current.next;
    }
    return result;
  }

  // ── Internal Helpers ──

  /**
   * Remove a node from the linked list.
   */
  private removeNode(node: LruNode): void {
    const prev = node.prev;
    const next = node.next;

    if (prev) {
      prev.next = next;
    } else {
      // Removing head
      this.head = next;
    }

    if (next) {
      next.prev = prev;
    } else {
      // Removing tail
      this.tail = prev;
    }

    node.prev = null;
    node.next = null;
  }

  /**
   * Append a node to the tail (most recently used position).
   */
  private appendToTail(node: LruNode): void {
    if (!this.tail) {
      // Empty list
      this.head = node;
      this.tail = node;
    } else {
      this.tail.next = node;
      node.prev = this.tail;
      this.tail = node;
    }
  }
}
