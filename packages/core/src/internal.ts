/**
 * @veris/core internal API.
 *
 * These exports are UNSTABLE and may change without notice.
 * They are intended for cross-package use within the monorepo only.
 *
 * @module @veris/core/internal
 */

// Error serialization utilities (for cross-package error handling)
export { VerisError } from './errors/veris-error.js';
export type { SerializedError } from './errors/veris-error.js';

// Factory helpers (for internal use by other packages)
export { createSeverity } from './types/severity.js';
export { createSourceLocation } from './types/location.js';
export { createArtifact } from './types/artifact.js';
