/**
 * Knowledge Pack Resolver — fast lookup for rules and extractors to query packs.
 *
 * @module @veris/knowledge/packs/resolver
 */

import type { KnowledgePack, KnowledgeEntry, ResolverMatch, KnowledgeIndicator } from './types.js';

/**
 * Immutable pack resolver.
 */
export class PackResolver {
  private readonly _packs: Map<string, KnowledgePack>;
  private readonly _entriesById: Map<string, { pack: KnowledgePack; entry: KnowledgeEntry }>;
  private readonly _entriesByCategory: Map<
    string,
    Array<{ pack: KnowledgePack; entry: KnowledgeEntry }>
  >;
  private readonly _entriesByTag: Map<
    string,
    Array<{ pack: KnowledgePack; entry: KnowledgeEntry }>
  >;
  private readonly _indicatorIndex: Record<
    string,
    Array<{ pack: KnowledgePack; entry: KnowledgeEntry; indicator: KnowledgeIndicator }>
  >;
  private readonly _mitreIndex: Map<string, Array<{ pack: KnowledgePack; entry: KnowledgeEntry }>>;
  private readonly _processed: boolean;

  constructor(packs: readonly KnowledgePack[]) {
    this._processed = true;
    this._packs = new Map();
    this._entriesById = new Map();
    this._entriesByCategory = new Map();
    this._entriesByTag = new Map();
    this._indicatorIndex = {};
    this._mitreIndex = new Map();

    for (const pack of packs) {
      this._packs.set(pack.metadata.id, pack);
      for (const entry of pack.entries) {
        const globalId = `${pack.metadata.id}:${entry.id}`;
        this._entriesById.set(globalId, { pack, entry });
        if (!this._entriesById.has(entry.id)) {
          this._entriesById.set(entry.id, { pack, entry });
        }

        const catList = this._entriesByCategory.get(entry.category) ?? [];
        catList.push({ pack, entry });
        this._entriesByCategory.set(entry.category, catList);

        for (const tag of entry.tags) {
          const tagList = this._entriesByTag.get(tag) ?? [];
          tagList.push({ pack, entry });
          this._entriesByTag.set(tag, tagList);
        }

        for (const indicator of entry.indicators) {
          const key = `${indicator.type}:${indicator.value}`;
          const idxList = this._indicatorIndex[key] ?? [];
          idxList.push({ pack, entry, indicator });
          this._indicatorIndex[key] = idxList;
        }

        for (const technique of entry.mitreTechniques) {
          const mitreList = this._mitreIndex.get(technique) ?? [];
          mitreList.push({ pack, entry });
          this._mitreIndex.set(technique, mitreList);
        }
      }
    }
  }

  get processed(): boolean {
    return this._processed;
  }

  get packCount(): number {
    return this._packs.size;
  }

  get entryCount(): number {
    let count = 0;
    for (const pack of this._packs.values()) {
      count += pack.entries.length;
    }
    return count;
  }

  getPacks(): readonly KnowledgePack[] {
    return Array.from(this._packs.values());
  }

  lookupEntry(globalId: string): { pack: KnowledgePack; entry: KnowledgeEntry } | undefined {
    return this._entriesById.get(globalId);
  }

  lookupPack(packId: string): KnowledgePack | undefined {
    return this._packs.get(packId);
  }

  resolveByIndicator(type: string, value: string): ResolverMatch[] {
    const key = `${type}:${value}`;
    const matches = this._indicatorIndex[key];
    if (!matches || matches.length === 0) return [];

    const results: ResolverMatch[] = matches.map((m) => ({
      entry: m.entry,
      pack: m.pack,
      confidence: m.indicator.confidence ?? 0.8,
      matchedIndicators: [m.indicator.value],
    }));

    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

  resolveByIndicators(indicators: ReadonlyArray<{ type: string; value: string }>): ResolverMatch[] {
    const matchMap = new Map<
      string,
      {
        entry: KnowledgeEntry;
        pack: KnowledgePack;
        totalConfidence: number;
        matched: string[];
      }
    >();

    for (const indicator of indicators) {
      const matches = this.resolveByIndicator(indicator.type, indicator.value);
      for (const match of matches) {
        const entryId = `${match.pack.metadata.id}:${match.entry.id}`;
        const existing = matchMap.get(entryId);
        if (existing) {
          existing.totalConfidence = Math.min(1, existing.totalConfidence + match.confidence * 0.3);
          existing.matched.push(
            ...match.matchedIndicators.filter((m) => !existing.matched.includes(m)),
          );
        } else {
          matchMap.set(entryId, {
            entry: match.entry,
            pack: match.pack,
            totalConfidence: match.confidence,
            matched: [...match.matchedIndicators],
          });
        }
      }
    }

    const results: ResolverMatch[] = Array.from(matchMap.values()).map((m) => ({
      entry: m.entry,
      pack: m.pack,
      confidence: Math.min(1, m.totalConfidence),
      matchedIndicators: m.matched,
    }));

    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

  getEntriesByCategory(category: string): Array<{ pack: KnowledgePack; entry: KnowledgeEntry }> {
    return this._entriesByCategory.get(category) ?? [];
  }

  getEntriesByTag(tag: string): Array<{ pack: KnowledgePack; entry: KnowledgeEntry }> {
    return this._entriesByTag.get(tag) ?? [];
  }

  getEntriesByMitreTechnique(
    technique: string,
  ): Array<{ pack: KnowledgePack; entry: KnowledgeEntry }> {
    return this._mitreIndex.get(technique) ?? [];
  }

  search(query: string): ResolverMatch[] {
    const lowerQuery = query.toLowerCase();
    const results: ResolverMatch[] = [];

    for (const pack of this._packs.values()) {
      for (const entry of pack.entries) {
        const nameMatch = entry.name.toLowerCase().includes(lowerQuery);
        const descMatch = entry.description.toLowerCase().includes(lowerQuery);
        const behaviorMatch = entry.behavior.toLowerCase().includes(lowerQuery);
        const tagMatch = entry.tags.some((t) => t.toLowerCase().includes(lowerQuery));

        if (nameMatch || descMatch || behaviorMatch || tagMatch) {
          results.push({
            entry,
            pack,
            confidence: nameMatch ? 0.9 : 0.7,
            matchedIndicators: [],
          });
        }
      }
    }
    return results;
  }

  resolveDependencyGraph(packId: string): { resolved: string[]; missing: string[] } {
    const resolved: string[] = [];
    const missing: string[] = [];
    const visited = new Set<string>();

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      const pack = this._packs.get(id);
      if (!pack) {
        missing.push(id);
        return;
      }
      for (const dep of pack.metadata.dependencies) {
        visit(dep.id);
      }
      resolved.push(id);
    };

    visit(packId);
    return { resolved, missing };
  }
}
