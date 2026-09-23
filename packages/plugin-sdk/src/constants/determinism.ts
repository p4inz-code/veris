/**
 * Determinism Guidelines and Invariants.
 *
 * @module @veris/plugin-sdk/constants/determinism
 */

/**
 * Foundational determinism invariants that every VERIS plugin must honor.
 *
 * VERIS scanning is 100% deterministic: identical target inputs MUST yield
 * identical feature extractions, identical rule evaluations, and identical
 * scan report hashes across runs, platforms, and environments.
 */
export const DETERMINISM_INVARIANTS = {
  NO_RANDOMNESS: 'Plugins must not use Math.random() or unseeded random generators.',
  NO_WALL_CLOCK_TIME:
    'Plugins must not embed Date.now() or new Date() timestamps into feature values or metadata.',
  NO_FILESYSTEM_RACES:
    'Feature extraction must rely strictly on the provided target content buffer and context, never on global filesystem state.',
  NO_NETWORK:
    'Plugins must operate fully offline. Network queries during scan execution break determinism and security.',
  DECLARATIVE_RULES:
    'Rule packs must be pure declarative data ASTs without imperative executable code.',
  STABLE_ORDERING:
    'Outputs, feature lists, and dictionary keys must maintain deterministic ordering.',
} as const;

/**
 * Array of determinism rule summary messages.
 */
export const DETERMINISM_RULES: readonly string[] = Object.values(DETERMINISM_INVARIANTS);
