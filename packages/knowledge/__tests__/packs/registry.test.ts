/**
 * Tests for Knowledge Pack Registry.
 */

import { describe, it, expect } from 'vitest';
import { PackRegistry } from '../../src/packs/registry.js';
import { MALWARE_FAMILIES_PACK } from '../../src/packs/data/malware-families.js';
import { LOBINS_PACK } from '../../src/packs/data/lolbins-pack.js';

describe('PackRegistry', () => {
  it('starts empty', () => {
    const registry = new PackRegistry();
    expect(registry.size).toBe(0);
    expect(registry.list()).toHaveLength(0);
  });

  it('loads a pack', () => {
    const registry = new PackRegistry();
    const result = registry.load(MALWARE_FAMILIES_PACK);
    expect(result.pack).toBeDefined();
    expect(registry.size).toBe(1);
    expect(registry.list()).toContain('malware-families');
  });

  it('prevents loading duplicate pack', () => {
    const registry = new PackRegistry();
    registry.load(MALWARE_FAMILIES_PACK);
    const result = registry.load(MALWARE_FAMILIES_PACK);
    expect(result.pack).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('ALREADY_LOADED');
  });

  it('looks up a pack by ID', () => {
    const registry = new PackRegistry();
    registry.load(MALWARE_FAMILIES_PACK);
    const pack = registry.lookup('malware-families');
    expect(pack).toBeDefined();
    expect(pack!.metadata.id).toBe('malware-families');
  });

  it('returns undefined for unknown pack', () => {
    const registry = new PackRegistry();
    expect(registry.lookup('nonexistent')).toBeUndefined();
  });

  it('unloads a pack', () => {
    const registry = new PackRegistry();
    registry.load(MALWARE_FAMILIES_PACK);
    expect(registry.unload('malware-families')).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('reloads a pack', () => {
    const registry = new PackRegistry();
    registry.load(MALWARE_FAMILIES_PACK);
    const result = registry.reload(MALWARE_FAMILIES_PACK);
    expect(result.pack).toBeDefined();
    expect(registry.size).toBe(1);
  });

  it('lists packs in load order', () => {
    const registry = new PackRegistry();
    registry.load(MALWARE_FAMILIES_PACK);
    registry.load(LOBINS_PACK);
    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toBe('malware-families');
    expect(list[1]).toBe('lolbins');
  });

  it('lists packs with metadata', () => {
    const registry = new PackRegistry();
    registry.load(MALWARE_FAMILIES_PACK);
    const meta = registry.listWithMetadata();
    expect(meta).toHaveLength(1);
    expect(meta[0].id).toBe('malware-families');
    expect(meta[0].version).toBe('1.0.0');
  });

  it('resolves dependencies', () => {
    const registry = new PackRegistry();
    registry.load(MALWARE_FAMILIES_PACK);
    const deps = registry.resolveDependencies('malware-families');
    expect(deps.satisfied).toBe(true);
    expect(deps.missing).toHaveLength(0);
  });

  it('detects missing dependencies', () => {
    const registry = new PackRegistry();
    const result = registry.resolveDependencies('nonexistent');
    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('nonexistent');
  });

  it('clears all packs', () => {
    const registry = new PackRegistry();
    registry.load(MALWARE_FAMILIES_PACK);
    registry.load(LOBINS_PACK);
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.list()).toHaveLength(0);
  });

  it('searches by category', () => {
    const registry = new PackRegistry();
    registry.load(MALWARE_FAMILIES_PACK);
    const results = registry.searchByCategory('credential-theft');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].metadata.id).toBe('malware-families');
  });

  it('searches by tag', () => {
    const registry = new PackRegistry();
    registry.load(MALWARE_FAMILIES_PACK);
    const results = registry.searchByTag('malware');
    expect(results.length).toBeGreaterThan(0);
  });

  it('emits events on load', () => {
    const registry = new PackRegistry();
    const events: string[] = [];
    registry.subscribe((event, packId) => {
      events.push(`${event}:${packId}`);
    });
    registry.load(MALWARE_FAMILIES_PACK);
    expect(events).toContain('pack-loaded:malware-families');
  });

  it('emits events on unload', () => {
    const registry = new PackRegistry();
    const events: string[] = [];
    registry.subscribe((event, packId) => {
      events.push(`${event}:${packId}`);
    });
    registry.load(MALWARE_FAMILIES_PACK);
    registry.unload('malware-families');
    expect(events).toContain('pack-unloaded:malware-families');
  });

  it('returns diagnostics', () => {
    const registry = new PackRegistry();
    registry.load(MALWARE_FAMILIES_PACK);
    const diag = registry.diagnostics;
    expect(diag.loadedPacks).toContain('malware-families');
    expect(diag.totalPacks).toBe(1);
  });

  it('provides unsubscribe from events', () => {
    const registry = new PackRegistry();
    let callCount = 0;
    const unsubscribe = registry.subscribe(() => {
      callCount++;
    });
    unsubscribe();
    registry.load(MALWARE_FAMILIES_PACK);
    expect(callCount).toBe(0);
  });
});
