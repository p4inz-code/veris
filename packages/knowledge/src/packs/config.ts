/**
 * Knowledge Pack Configuration — controls which packs are enabled,
 * disabled, custom directories, and validation behavior.
 *
 * @module @veris/knowledge/packs/config
 */

/** Pack configuration for a single pack. */
export interface PackConfigEntry {
  /** Pack ID. */
  readonly id: string;
  /** Whether the pack is enabled. */
  readonly enabled: boolean;
  /** Optional custom path for pack file. */
  readonly path?: string;
}

/** Complete knowledge pack system configuration. */
export interface KnowledgePackConfig {
  /** Enabled packs (empty = all enabled). */
  readonly enabledPacks: readonly string[];
  /** Disabled packs. */
  readonly disabledPacks: readonly string[];
  /** Custom directories to search for packs. */
  readonly packDirectories: readonly string[];
  /** Whether to enable strict validation mode. */
  readonly strictMode: boolean;
  /** Whether to enable validation mode (validate all packs on load). */
  readonly validationMode: boolean;
  /** Whether to verify checksums on load. */
  readonly verifyChecksums: boolean;
  /** Whether to enable the immutable cache. */
  readonly enableCache: boolean;
  /** Maximum cache entries. */
  readonly maxCacheEntries: number;
}

/** Default knowledge pack configuration. */
export const DEFAULT_PACK_CONFIG: KnowledgePackConfig = Object.freeze({
  enabledPacks: [],
  disabledPacks: [],
  packDirectories: [],
  strictMode: false,
  validationMode: true,
  verifyChecksums: true,
  enableCache: true,
  maxCacheEntries: 50,
});

/**
 * Create a knowledge pack configuration with defaults merged with overrides.
 */
export function createPackConfig(overrides?: Partial<KnowledgePackConfig>): KnowledgePackConfig {
  return Object.freeze({
    ...DEFAULT_PACK_CONFIG,
    ...overrides,
  });
}

/**
 * Check if a pack is enabled based on configuration.
 */
export function isPackEnabled(packId: string, config: KnowledgePackConfig): boolean {
  // Explicitly disabled takes precedence
  if (config.disabledPacks.includes(packId)) return false;

  // If enabled list is non-empty, only those packs are enabled
  if (config.enabledPacks.length > 0) {
    return config.enabledPacks.includes(packId);
  }

  // Default: all packs enabled
  return true;
}

/**
 * Merge two pack configurations (overrides take precedence).
 */
export function mergePackConfigs(
  base: KnowledgePackConfig,
  overrides: Partial<KnowledgePackConfig>,
): KnowledgePackConfig {
  return Object.freeze({
    enabledPacks: overrides.enabledPacks ?? base.enabledPacks,
    disabledPacks: overrides.disabledPacks ?? base.disabledPacks,
    packDirectories: overrides.packDirectories ?? base.packDirectories,
    strictMode: overrides.strictMode ?? base.strictMode,
    validationMode: overrides.validationMode ?? base.validationMode,
    verifyChecksums: overrides.verifyChecksums ?? base.verifyChecksums,
    enableCache: overrides.enableCache ?? base.enableCache,
    maxCacheEntries: overrides.maxCacheEntries ?? base.maxCacheEntries,
  });
}
