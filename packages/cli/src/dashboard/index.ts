/**
 * @veris/cli/dashboard — Visual investigation dashboard module.
 *
 * Implements ADR-017:
 * - Standalone HTML artifact generation
 * - Loopback local HTTP viewer server
 * - HTML sanitization and CSP compliance
 *
 * @module @veris/cli/dashboard
 */

export * from './types.js';
export * from './sanitizer.js';
export * from './template.js';
export * from './generator.js';
export * from './server.js';
