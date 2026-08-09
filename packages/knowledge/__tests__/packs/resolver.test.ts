/**
 * Tests for Knowledge Pack Resolver.
 */

import { describe, it, expect } from 'vitest';
import { PackResolver } from '../../src/packs/resolver.js';
import { MALWARE_FAMILIES_PACK } from '../../src/packs/data/malware-families.js';
import { LOBINS_PACK } from '../../src/packs/data/lolbins-pack.js';

describe('PackResolver', () => {
  it('resolves from empty packs', () => {
    const resolver = new PackResolver([]);
    expect(resolver.packCount).toBe(0);
    expect(resolver.entryCount).toBe(0);
  });

  it('indexes packs', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    expect(resolver.packCount).toBe(1);
    expect(resolver.entryCount).toBe(MALWARE_FAMILIES_PACK.entries.length);
  });

  it('looks up entry by global ID', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const result = resolver.lookupEntry('malware-families:mimikatz');
    expect(result).toBeDefined();
    expect(result!.entry.name).toBe('Mimikatz');
  });

  it('looks up entry by short ID', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const result = resolver.lookupEntry('mimikatz');
    expect(result).toBeDefined();
    expect(result!.entry.name).toBe('Mimikatz');
  });

  it('looks up pack by ID', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const pack = resolver.lookupPack('malware-families');
    expect(pack).toBeDefined();
    expect(pack!.metadata.name).toBe('Malware Families');
  });

  it('resolves by indicator value', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const matches = resolver.resolveByIndicator('string-pattern', 'sekurlsa::logonpasswords');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].entry.name).toBe('Mimikatz');
    expect(matches[0].confidence).toBeGreaterThan(0);
  });

  it('resolves by multiple indicators', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const matches = resolver.resolveByIndicators([
      { type: 'string-pattern', value: 'sekurlsa::logonpasswords' },
      { type: 'process-name', value: 'mimikatz.exe' },
    ]);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].entry.name).toBe('Mimikatz');
  });

  it('returns empty for unknown indicator', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const matches = resolver.resolveByIndicator('hash-sha256', 'nonexistent');
    expect(matches).toHaveLength(0);
  });

  it('gets entries by category', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const entries = resolver.getEntriesByCategory('credential-theft');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.entry.name === 'Mimikatz')).toBe(true);
  });

  it('gets entries by tag', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const entries = resolver.getEntriesByTag('credentials');
    expect(entries.length).toBeGreaterThan(0);
  });

  it('gets entries by MITRE technique', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const entries = resolver.getEntriesByMitreTechnique('T1003.001');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.entry.name === 'Mimikatz')).toBe(true);
  });

  it('searches entries by name', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK, LOBINS_PACK]);
    const results = resolver.search('Mimikatz');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.name.toLowerCase()).toContain('mimikatz');
  });

  it('searches entries by description', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const results = resolver.search('credential');
    expect(results.length).toBeGreaterThan(0);
  });

  it('resolves dependency graph', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const graph = resolver.resolveDependencyGraph('malware-families');
    expect(graph.resolved).toContain('malware-families');
    expect(graph.missing).toHaveLength(0);
  });

  it('detects missing dependencies in graph', () => {
    const resolver = new PackResolver([]);
    const graph = resolver.resolveDependencyGraph('nonexistent');
    expect(graph.missing).toContain('nonexistent');
  });

  it('gets all packs', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK, LOBINS_PACK]);
    const packs = resolver.getPacks();
    expect(packs).toHaveLength(2);
  });

  it('returns processed as true after construction', () => {
    const resolver = new PackResolver([]);
    expect(resolver.processed).toBe(true);
  });
});
