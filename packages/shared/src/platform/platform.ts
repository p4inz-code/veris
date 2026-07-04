/**
 * Platform detection and OS-level helpers.
 *
 * Provides runtime detection of the operating system, CPU architecture,
 * and Node.js runtime capabilities.
 *
 * @module @veris/shared/platform
 */

/** Operating system identifier. */
export type OS = 'linux' | 'darwin' | 'win32' | 'unknown';

/** CPU architecture identifier. */
export type Arch = 'x64' | 'arm64' | 'ia32' | 'unknown';

/** Platform information snapshot. */
export interface PlatformInfo {
  readonly os: OS;
  readonly arch: Arch;
  readonly nodeVersion: string;
  readonly isWindows: boolean;
  readonly isMacOS: boolean;
  readonly isLinux: boolean;
}

/**
 * Detect the current operating system.
 */
export function detectOS(): OS {
  const p = process.platform;
  if (p === 'linux' || p === 'darwin' || p === 'win32') return p;
  return 'unknown';
}

/**
 * Detect the current CPU architecture.
 */
export function detectArch(): Arch {
  const a = process.arch;
  if (a === 'x64' || a === 'arm64' || a === 'ia32') return a;
  return 'unknown';
}

/**
 * Get a snapshot of current platform information.
 */
export function getPlatformInfo(): PlatformInfo {
  const os = detectOS();
  return {
    os,
    arch: detectArch(),
    nodeVersion: process.version,
    isWindows: os === 'win32',
    isMacOS: os === 'darwin',
    isLinux: os === 'linux',
  };
}

/**
 * Check if the current process has the given file system capability.
 */
export function hasCapability(name: string): boolean {
  const supported: Record<string, boolean> = {
    symlinks: process.platform !== 'win32',
    fileMode: process.platform !== 'win32',
    unixSockets: process.platform !== 'win32',
    caseSensitiveFS: process.platform !== 'darwin' && process.platform !== 'win32',
  };
  return supported[name] ?? false;
}
