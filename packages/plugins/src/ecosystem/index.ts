/**
 * @veris/plugins/ecosystem — Plugin marketplace, catalog, verification, and installation foundation.
 *
 * Implements ADR-018:
 * - Local-first catalog loading and filtering
 * - Cryptographic checksum verification
 * - Security capability auditing
 * - Installation and uninstallation lifecycle
 *
 * @module @veris/plugins/ecosystem
 */

export * from './types.js';
export * from './checksum.js';
export * from './catalog.js';
export * from './verifier.js';
export * from './installer.js';
