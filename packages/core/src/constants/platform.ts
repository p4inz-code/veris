/**
 * Platform detection constants and helpers.
 *
 * @module @veris/core/constants/platform
 */

/** Supported operating systems. */
export type PlatformOS = 'linux' | 'darwin' | 'win32';

/** Supported CPU architectures. */
export type PlatformArch = 'x64' | 'arm64' | 'ia32';

/** Combined platform info. */
export interface PlatformInfo {
  readonly os: PlatformOS;
  readonly arch: PlatformArch;
  readonly nodeVersion: string;
}

/** Current schema version for the canonical data model. */
export const SCHEMA_VERSION = '1.0.0';

/** Current VERIS engine version. */
export const ENGINE_VERSION = '0.1.0';

/**
 * Detect the current platform OS.
 * Normalizes to the PlatformOS union type.
 */
export function detectOS(): PlatformOS {
  const os = process.platform;
  if (os === 'linux' || os === 'darwin' || os === 'win32') {
    return os;
  }
  // Fallback: treat all other platforms as linux
  return 'linux';
}

/**
 * Detect the current CPU architecture.
 */
export function detectArch(): PlatformArch {
  const arch = process.arch;
  if (arch === 'x64' || arch === 'arm64' || arch === 'ia32') {
    return arch;
  }
  return 'x64';
}

/**
 * Get a snapshot of the current platform information.
 */
export function getPlatformInfo(): PlatformInfo {
  return {
    os: detectOS(),
    arch: detectArch(),
    nodeVersion: process.version,
  };
}

/**
 * Check if the current platform is Windows.
 */
export function isWindows(): boolean {
  return detectOS() === 'win32';
}

/**
 * Check if the current platform is macOS.
 */
export function isMacOS(): boolean {
  return detectOS() === 'darwin';
}

/**
 * Check if the current platform is Linux.
 */
export function isLinux(): boolean {
  return detectOS() === 'linux';
}
