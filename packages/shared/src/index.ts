/**
 * @veris/shared — VERIS general-purpose utilities.
 *
 * ## Package invariants (from SPEC-010 §3):
 * - F2: @veris/shared imports from @veris/core only
 * - F3: No network calls in utility functions
 * - F4: I/O is abstracted behind interfaces
 *
 * @module @veris/shared
 */

// Core shared types
export type { Disposable, AsyncDisposable } from './types/index.js';
export { using, usingAsync } from './types/index.js';
export type { Some, None, Option } from './types/index.js';
export {
  some,
  none,
  fromNullable,
  isSome,
  isNone,
  unwrap,
  unwrapOr,
  map,
  tap,
} from './types/index.js';
export { CancellationToken, CancellationTokenSource, CancelledError } from './types/index.js';
export type { CancellationReason } from './types/index.js';

// Dependency Injection
export type { Factory, ServiceLifetime } from './di/index.js';
export { Container, createContainer } from './di/index.js';

// Collections
export { TrackingMap, uniqueBy, groupBy, unique, zip, partition } from './collections/index.js';

// Hashing
export {
  sha256,
  computeContentHash,
  hashString,
  hashBuffer,
  deterministicId,
} from './hashing/index.js';

// Serialization
export {
  toJSON,
  toJSONPretty,
  tryParseJSON,
  jsonClone,
  isPlainObject,
  deepMerge,
} from './serialization/index.js';

// FS
export {
  readFile,
  readTextFile,
  exists,
  isFile,
  isDirectory,
  fileSize,
  readDirectory,
  walkDirectory,
  stat,
  withTempDir,
} from './fs/index.js';

// Path
export {
  normalizeToForward,
  normalizePath,
  join,
  resolve,
  dirname,
  basename,
  extname,
  isAbsolute,
  split,
  hasPathTraversal,
  safeResolve,
  relative,
} from './path/index.js';

// Platform
export type { OS, Arch, PlatformInfo } from './platform/index.js';
export { detectOS, detectArch, getPlatformInfo, hasCapability } from './platform/index.js';

// Result monad
export type { Ok, Err, Result } from './result/index.js';
export {
  ok,
  err,
  isOk,
  isErr,
  unwrap as resultUnwrap,
  unwrapOr as resultUnwrapOr,
  unwrapOrElse,
  map as resultMap,
  mapErr,
  andThen,
  tryCatch,
  tryCatchAsync,
  collect,
} from './result/index.js';

// Version
export type { Semver } from './version/index.js';
export { parseSemver, compareSemver, satisfies } from './version/index.js';
