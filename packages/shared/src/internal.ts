/**
 * @veris/shared internal API.
 *
 * These exports are UNSTABLE and may change without notice.
 *
 * @module @veris/shared/internal
 */

export { deepMerge, jsonClone, isPlainObject } from './serialization/serialization.js';
export { normalizeToForward, normalizePath, safeResolve } from './path/path.js';
