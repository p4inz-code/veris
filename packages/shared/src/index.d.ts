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
export type { Factory, ServiceLifetime } from './di/index.js';
export { Container, createContainer } from './di/index.js';
export { TrackingMap, uniqueBy, groupBy, unique, zip, partition } from './collections/index.js';
export {
  sha256,
  computeContentHash,
  hashString,
  hashBuffer,
  deterministicId,
} from './hashing/index.js';
export {
  toJSON,
  toJSONPretty,
  tryParseJSON,
  jsonClone,
  isPlainObject,
  deepMerge,
} from './serialization/index.js';
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
export type { OS, Arch, PlatformInfo } from './platform/index.js';
export { detectOS, detectArch, getPlatformInfo, hasCapability } from './platform/index.js';
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
export type { Semver } from './version/index.js';
export { parseSemver, compareSemver, satisfies } from './version/index.js';
//# sourceMappingURL=index.d.ts.map
