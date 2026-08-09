/**
 * Current File Panel — displays information about the file currently being processed.
 *
 * Shows:
 * - Filename
 * - Relative path
 * - Size
 * - File type
 * - Detected language
 * - Detected artifact type
 * - Current analyzer
 *
 * @module @veris/cli/scan/progress
 */

import { renderBox } from '../../ui/layout/index.js';
import { getSymbolSet } from '../../ui/renderer/index.js';
import { getResolvedTheme } from '../../ui/theme/index.js';
import { truncateStart } from '../../ui/utilities/index.js';
import type { CurrentFile } from '../scan-session.js';

/** Options for the current file panel. */
export interface FilePanelOptions {
  readonly width?: number;
  readonly maxPathWidth?: number;
}

/**
 * Render the current file panel as an array of lines.
 */
export function renderCurrentFilePanel(
  currentFile: CurrentFile | null,
  filesProcessed: number,
  totalFiles: number,
  options: FilePanelOptions = {},
): readonly string[] {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const width = options.width;
  const maxPathWidth = options.maxPathWidth ?? Math.max(20, (width ?? 80) - 20);

  if (!currentFile) {
    return renderBox([' No file being processed'], {
      title: `${symbols.file} Current File`,
      width,
      padding: 0,
      showBottomBorder: true,
    });
  }

  const contentLines: string[] = [];

  // Filename with icon
  const fileIcon = getFileIcon(currentFile.fileType);
  contentLines.push(` ${fileIcon} ${theme.ui.text}${currentFile.filename}\\x1b[0m`);

  // Relative path
  const path = truncateStart(currentFile.relativePath, maxPathWidth);
  contentLines.push(`   ${theme.ui.textDim}Path: ${path}\\x1b[0m`);

  // Size
  contentLines.push(`   ${theme.ui.textDim}Size: ${formatSize(currentFile.size)}\\x1b[0m`);

  // Type info
  const typeInfo: string[] = [];
  if (currentFile.fileType) typeInfo.push(currentFile.fileType);
  if (currentFile.language) typeInfo.push(currentFile.language);
  if (currentFile.artifactType) typeInfo.push(currentFile.artifactType);
  if (typeInfo.length > 0) {
    contentLines.push(`   ${theme.ui.textDim}Type: ${typeInfo.join(' \\u2192 ')}\\x1b[0m`);
  }

  // Current analyzer
  if (currentFile.currentAnalyzer) {
    contentLines.push(`   ${theme.ui.textDim}Analyzer: ${currentFile.currentAnalyzer}\\x1b[0m`);
  }

  // Progress
  if (totalFiles > 0) {
    const pct = ((filesProcessed / totalFiles) * 100).toFixed(1);
    contentLines.push(
      `   ${theme.ui.textDim}Progress: ${filesProcessed}/${totalFiles} (${pct}%)\\x1b[0m`,
    );
  }

  return renderBox(contentLines, {
    title: `${symbols.file} Current File`,
    width,
    padding: 0,
    showBottomBorder: true,
  });
}

/**
 * Get a file icon based on type.
 */
function getFileIcon(fileType: string): string {
  const symbols = getSymbolSet();
  const lower = fileType.toLowerCase();
  if (lower.includes('directory')) return symbols.directory;
  if (
    lower.includes('executable') ||
    lower.includes('pe') ||
    lower.includes('elf') ||
    lower.includes('macho')
  )
    return symbols.executable;
  if (lower.includes('archive') || lower.includes('zip') || lower.includes('tar'))
    return symbols.archive;
  if (
    lower.includes('script') ||
    lower.includes('shell') ||
    lower.includes('python') ||
    lower.includes('javascript')
  )
    return symbols.script;
  if (
    lower.includes('config') ||
    lower.includes('json') ||
    lower.includes('yaml') ||
    lower.includes('xml')
  )
    return symbols.config;
  if (lower.includes('image')) return symbols.image;
  if (lower.includes('document') || lower.includes('pdf') || lower.includes('office'))
    return symbols.document;
  return symbols.file;
}

/**
 * Format file size in human-readable format.
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
