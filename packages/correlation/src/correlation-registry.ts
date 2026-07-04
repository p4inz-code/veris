/**
 * CorrelationRegistry — registry for correlation patterns.
 *
 * @module @veris/correlation/correlation-registry
 */

import { validatePatternDefinition, clearValidationState } from './correlation-validator.js';
import type { CorrelationPattern, CorrelationCategory, ICorrelationRegistry } from './types.js';

/** Category priority ordering (lower = higher priority). */
const CATEGORY_ORDER: Record<string, number> = {
  'process-injection': 0,
  persistence: 1,
  'credential-theft': 2,
  obfuscation: 3,
  'download-execution': 4,
  'living-off-the-land': 5,
  'script-obfuscation': 6,
  'macro-execution': 7,
  'suspicious-certificate': 8,
  'archive-execution-chain': 9,
  'defense-evasion': 10,
  'privilege-escalation': 11,
  discovery: 12,
  exfiltration: 13,
  'container-breakout': 14,
  'supply-chain': 15,
  'lateral-movement': 16,
  'command-and-control': 17,
};

/**
 * Priority-ordered registry for correlation patterns.
 */
export class CorrelationRegistry implements ICorrelationRegistry {
  private readonly _patterns = new Map<string, CorrelationPattern>();
  private _dirty = true;
  private _orderedCache: readonly CorrelationPattern[] = Object.freeze([]);

  register(...patterns: CorrelationPattern[]): void {
    for (const pattern of patterns) {
      clearValidationState();
      const validation = validatePatternDefinition(pattern);

      if (this._patterns.has(pattern.id)) {
        throw new Error(
          `CorrelationRegistry: duplicate pattern ID "${pattern.id}" — already registered`,
        );
      }

      if (!validation.valid) {
        const msgs = validation.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
        throw new Error(`CorrelationRegistry: invalid pattern "${pattern.id}": ${msgs}`);
      }

      this._patterns.set(pattern.id, pattern);
      this._dirty = true;
    }
  }

  unregister(patternId: string): boolean {
    const removed = this._patterns.delete(patternId);
    if (removed) this._dirty = true;
    return removed;
  }

  lookup(patternId: string): CorrelationPattern | undefined {
    return this._patterns.get(patternId);
  }

  getAll(): readonly CorrelationPattern[] {
    this._maybeRebuildCache();
    return this._orderedCache;
  }

  getByCategory(category: CorrelationCategory): readonly CorrelationPattern[] {
    return Object.freeze(this.getAll().filter((p) => p.category === category));
  }

  get size(): number {
    return this._patterns.size;
  }

  clear(): void {
    this._patterns.clear();
    this._dirty = true;
    this._orderedCache = Object.freeze([]);
  }

  has(patternId: string): boolean {
    return this._patterns.has(patternId);
  }

  get ids(): readonly string[] {
    return Object.freeze([...this._patterns.keys()]);
  }

  private _maybeRebuildCache(): void {
    if (!this._dirty) return;
    this._dirty = false;

    const sorted = [...this._patterns.values()].sort((a, b) => {
      const catOrderA = CATEGORY_ORDER[a.category] ?? 99;
      const catOrderB = CATEGORY_ORDER[b.category] ?? 99;
      if (catOrderA !== catOrderB) return catOrderA - catOrderB;
      return a.id.localeCompare(b.id);
    });

    this._orderedCache = Object.freeze(sorted);
  }
}
