/**
 * Plugin Diagnostics Collector for VERIS V2 Plugin Host.
 *
 * Collects and organizes structured diagnostic records during plugin
 * discovery, validation, loading, lifecycle execution, and error handling.
 *
 * @module @veris/plugins/diagnostics
 */

import type { PluginDiagnostic, PluginDiagnosticSeverity } from './types.js';

export class PluginDiagnosticsCollector {
  private readonly _diagnostics: PluginDiagnostic[] = [];

  /**
   * Record a structured diagnostic entry.
   */
  record(diagnostic: PluginDiagnostic): void {
    this._diagnostics.push(Object.freeze({ ...diagnostic }));
  }

  /**
   * Record an informational diagnostic.
   */
  info(
    pluginId: string,
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ): void {
    this.record({
      code,
      severity: 'info',
      pluginId,
      message,
      timestamp: Date.now(),
      details,
    });
  }

  /**
   * Record a warning diagnostic.
   */
  warn(
    pluginId: string,
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ): void {
    this.record({
      code,
      severity: 'warning',
      pluginId,
      message,
      timestamp: Date.now(),
      details,
    });
  }

  /**
   * Record an error diagnostic.
   */
  error(
    pluginId: string,
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ): void {
    this.record({
      code,
      severity: 'error',
      pluginId,
      message,
      timestamp: Date.now(),
      details,
    });
  }

  /**
   * Get all recorded diagnostics.
   */
  getAll(): readonly PluginDiagnostic[] {
    return Object.freeze([...this._diagnostics]);
  }

  /**
   * Get diagnostics for a specific plugin ID.
   */
  getByPluginId(pluginId: string): readonly PluginDiagnostic[] {
    return Object.freeze(this._diagnostics.filter((d) => d.pluginId === pluginId));
  }

  /**
   * Get diagnostics filtered by severity.
   */
  getBySeverity(severity: PluginDiagnosticSeverity): readonly PluginDiagnostic[] {
    return Object.freeze(this._diagnostics.filter((d) => d.severity === severity));
  }

  /**
   * Check if any error diagnostics have been recorded.
   */
  hasErrors(): boolean {
    return this._diagnostics.some((d) => d.severity === 'error');
  }

  /**
   * Clear all recorded diagnostics.
   */
  clear(): void {
    this._diagnostics.length = 0;
  }
}
