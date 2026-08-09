/**
 * @veris/cli/ui/terminal — Terminal capability detection.
 *
 * Detects terminal features so UI components can adapt to
 * the current environment (color depth, Unicode, dimensions, etc.).
 *
 * @module @veris/cli/ui/terminal
 */

export {
  detectTerminal,
  isInteractive,
  resetTerminalCache,
  type ColorDepth,
  type TerminalEmulator,
  type CiEnvironment,
  type TerminalCapabilities,
} from './capabilities.js';

export { hasCapability, contentWidth, contentHeight } from './detection.js';
