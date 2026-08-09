/**
 * Tests for Knowledge Pack Evidence Enricher.
 */

import { describe, it, expect } from 'vitest';
import { PackResolver } from '../../src/packs/resolver.js';
import { EvidenceEnricher } from '../../src/packs/enricher.js';
import { MALWARE_FAMILIES_PACK } from '../../src/packs/data/malware-families.js';
import { LOBINS_PACK } from '../../src/packs/data/lolbins-pack.js';

describe('EvidenceEnricher', () => {
  it('enriches evidence matching a pack entry', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const enricher = new EvidenceEnricher(resolver);

    const result = enricher.enrich({
      id: 'ev_001',
      type: 'string-literal',
      category: 'executable',
      value: 'sekurlsa::logonpasswords',
    });

    expect(result.enriched).toBe(true);
    expect(result.enrichments.length).toBeGreaterThan(0);
    expect(result.enrichments[0].name).toBe('Mimikatz');
    expect(result.enrichments[0].severity).toBe('critical');
    expect(result.enrichments[0].matchConfidence).toBeGreaterThan(0);
  });

  it('returns no enrichment for non-matching evidence', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const enricher = new EvidenceEnricher(resolver);

    const result = enricher.enrich({
      id: 'ev_002',
      type: 'string-literal',
      category: 'executable',
      value: 'normal_function_call_12345',
    });

    expect(result.enriched).toBe(false);
    expect(result.enrichments).toHaveLength(0);
  });

  it('respects match threshold', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const enricher = new EvidenceEnricher(resolver, 0.99);

    const result = enricher.enrich({
      id: 'ev_003',
      type: 'string-literal',
      category: 'executable',
      value: 'sekurlsa::logonpasswords',
    });

    // The indicator has 0.95 confidence, so it shouldn't pass 0.99 threshold
    expect(result.enriched).toBe(false);
  });

  it('enriches evidence matching LOLBins pack', () => {
    const resolver = new PackResolver([LOBINS_PACK]);
    const enricher = new EvidenceEnricher(resolver);

    const result = enricher.enrich({
      id: 'ev_004',
      type: 'process-name',
      category: 'executable',
      value: 'powershell.exe',
    });

    expect(result.enriched).toBe(true);
    expect(result.enrichments.some((e) => e.name === 'PowerShell.exe')).toBe(true);
  });

  it('enriches multiple evidence items in batch', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK, LOBINS_PACK]);
    const enricher = new EvidenceEnricher(resolver);

    const results = enricher.enrichBatch([
      {
        id: 'ev_001',
        type: 'string-literal',
        category: 'executable',
        value: 'sekurlsa::logonpasswords',
      },
      { id: 'ev_002', type: 'string-literal', category: 'executable', value: 'normal_string' },
      { id: 'ev_003', type: 'process-name', category: 'process', value: 'powershell.exe' },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].enriched).toBe(true);
    expect(results[1].enriched).toBe(false);
    expect(results[2].enriched).toBe(true);
  });

  it('deduplicates unique enrichments', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK, LOBINS_PACK]);
    const enricher = new EvidenceEnricher(resolver);

    const results = enricher.enrichBatch([
      {
        id: 'ev_001',
        type: 'string-literal',
        category: 'executable',
        value: 'sekurlsa::logonpasswords',
      },
      { id: 'ev_002', type: 'process-name', category: 'process', value: 'mimikatz.exe' },
    ]);

    const unique = enricher.getUniqueEnrichments(results);
    // Both evidence items should point to the same entry (Mimikatz)
    expect(unique.length).toBeGreaterThanOrEqual(1);
  });

  it('provides enrichment details', () => {
    const resolver = new PackResolver([MALWARE_FAMILIES_PACK]);
    const enricher = new EvidenceEnricher(resolver);

    const result = enricher.enrich({
      id: 'ev_001',
      type: 'string-literal',
      category: 'executable',
      value: 'sekurlsa::logonpasswords',
    });

    const enrichment = result.enrichments[0];
    expect(enrichment.packId).toBe('malware-families');
    expect(enrichment.entryId).toBe('mimikatz');
    expect(enrichment.family).toBe('credential-theft');
    expect(enrichment.description.length).toBeGreaterThan(0);
    expect(enrichment.behavior.length).toBeGreaterThan(0);
    expect(enrichment.remediation.length).toBeGreaterThan(0);
    expect(enrichment.references.length).toBeGreaterThan(0);
    expect(enrichment.mitreTechniques.length).toBeGreaterThan(0);
    expect(enrichment.matchedIndicators.length).toBeGreaterThan(0);
  });
});
