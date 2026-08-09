/**
 * PE Sub-Analyzers — barrel export.
 *
 * @module @veris/analysis/pe/analyzers
 */

export { analyzeSections } from './sections.js';
export type { SectionFinding } from './sections.js';

export { analyzeImports } from './imports.js';
export type { ImportFinding, ImportGroup } from './imports.js';

export { detectPacker } from './packer-detector.js';

export { analyzeOverlay } from './overlay.js';
export type { OverlayFinding } from './overlay.js';

export { identifyCompiler } from './compiler.js';

export { analyzeTLS } from './tls.js';
export type { TLSFinding } from './tls.js';

export { analyzeResources } from './resources.js';
export type { ResourceFinding } from './resources.js';

export { analyzeSignature } from './signature.js';
export type { SignatureFinding } from './signature.js';

export { analyzeTimestamp } from './timestamp.js';
export type { TimestampFinding } from './timestamp.js';

export { analyzeEntryPoint } from './entrypoint.js';
export type { EntryPointFinding } from './entrypoint.js';
