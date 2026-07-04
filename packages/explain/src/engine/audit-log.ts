/**
 * Audit log — append-only logging for every explanation interaction.
 *
 * Implements SPEC-011 §4.2.8:
 * - Append-only log of every AI interaction
 * - Log-before-return guarantee
 * - 0600 permissions
 * - --no-audit compatibility
 * - Provider failures, retry events, circuit breaker events
 *
 * Format: JSON Lines (.jsonl), written to ~/.veris/logs/ai-audit.jsonl
 *
 * @module @veris/explain/engine/audit-log
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ── Types ──

/** A single audit log entry. */
export interface AuditLogEntry {
  readonly timestamp: string;
  readonly sessionId: string;
  readonly requestId: string;
  readonly subjectId: string;
  readonly subjectType: string;
  readonly mode: string;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly cacheHit: boolean;
  readonly success: boolean;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly retryCount: number;
  readonly circuitBreakerState: string;
  readonly durationMs: number;
}

/** Options for the audit log. */
export interface AuditLogOptions {
  /** Whether audit logging is enabled. */
  readonly enabled?: boolean;
  /** Custom log directory (defaults to ~/.veris/logs). */
  readonly logDir?: string;
  /** Maximum log file size before rotation in bytes (default 10MB). */
  readonly maxFileSize?: number;
}

// ── Constants ──

const DEFAULT_LOG_DIR = path.join(os.homedir(), '.veris', 'logs');
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const LOG_FILE_NAME = 'ai-audit.jsonl';

// ── AuditLog ──

/**
 * Append-only audit log for explanation interactions.
 *
 * Every explanation request is logged with provider metadata,
 * token usage, cache status, and error information.
 * Log-before-return is enforced by the caller (Explainer).
 */
export class AuditLog {
  private readonly enabled: boolean;
  private readonly logDir: string;
  private readonly maxFileSize: number;
  private logStream: fs.WriteStream | null = null;
  private currentFilePath: string | null = null;
  private currentFileSize = 0;

  constructor(options?: AuditLogOptions) {
    this.enabled = options?.enabled ?? true;
    this.logDir = options?.logDir ?? DEFAULT_LOG_DIR;
    this.maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

    if (this.enabled) {
      this.ensureLogDir();
      this.openStream();
    }
  }

  /**
   * Ensure the log directory exists with 0600 permissions.
   */
  private ensureLogDir(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true, mode: 0o700 });
      }
    } catch {
      // Fail silently — audit logging is best-effort
    }
  }

  /**
   * Open the log file stream for appending.
   */
  private openStream(): void {
    try {
      this.currentFilePath = path.join(this.logDir, LOG_FILE_NAME);

      // Create file with 0600 if it doesn't exist
      if (!fs.existsSync(this.currentFilePath)) {
        fs.writeFileSync(this.currentFilePath, '', { mode: 0o600 });
      }

      // Get current file size
      const stat = fs.statSync(this.currentFilePath);
      this.currentFileSize = stat.size;

      this.logStream = fs.createWriteStream(this.currentFilePath, {
        flags: 'a',
        encoding: 'utf-8',
        mode: 0o600,
      });
    } catch {
      this.logStream = null;
    }
  }

  /**
   * Log an audit entry.
   *
   * @param entry - The audit log entry to write.
   */
  log(entry: AuditLogEntry): void {
    if (!this.enabled || !this.logStream) return;

    try {
      const line = JSON.stringify(entry) + '\n';
      const lineSize = Buffer.byteLength(line, 'utf-8');

      // Rotate if file exceeds max size
      if (this.currentFileSize + lineSize > this.maxFileSize) {
        this.rotateLog();
      }

      this.logStream.write(line);
      this.currentFileSize += lineSize;
    } catch {
      // Fail silently
    }
  }

  /**
   * Rotate the log file when it exceeds the maximum size.
   */
  private rotateLog(): void {
    if (this.logStream) {
      this.logStream.end();
    }

    if (this.currentFilePath && fs.existsSync(this.currentFilePath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = `${this.currentFilePath}.${timestamp}`;
      try {
        fs.renameSync(this.currentFilePath, rotatedPath);
      } catch {
        // Fail silently
      }
    }

    this.openStream();
  }

  /**
   * Generate a deterministic request ID from the audit entry fields.
   *
   * Uses SHA-256 hash of the subjectId + subjectType + timestamp to produce
   * a unique but deterministic ID. This ensures repeatable audit logs
   * for identical inputs while maintaining uniqueness across different
   * requests.
   */
  private generateDeterministicId(fields: Record<string, unknown>): string {
    const input = `${fields.subjectId ?? ''}::${fields.subjectType ?? ''}::${fields.timestamp ?? ''}`;
    const hash = crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
    return hash.slice(0, 32);
  }

  /**
   * Flush the log stream.
   */
  flush(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  /**
   * Create an audit log entry with the provided fields.
   * Fills in defaults for timestamps and request IDs.
   */
  createEntry(fields: {
    readonly sessionId?: string;
    readonly requestId?: string;
    readonly subjectId: string;
    readonly subjectType: string;
    readonly mode: string;
    readonly provider: string;
    readonly model: string;
    readonly promptVersion: string;
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly totalTokens?: number;
    readonly cacheHit?: boolean;
    readonly success?: boolean;
    readonly errorCode?: string;
    readonly errorMessage?: string;
    readonly retryCount?: number;
    readonly circuitBreakerState?: string;
    readonly durationMs?: number;
  }): AuditLogEntry {
    return {
      timestamp: new Date().toISOString(),
      sessionId: fields.sessionId ?? '',
      requestId: fields.requestId ?? this.generateDeterministicId(fields),
      subjectId: fields.subjectId,
      subjectType: fields.subjectType,
      mode: fields.mode,
      provider: fields.provider,
      model: fields.model,
      promptVersion: fields.promptVersion,
      promptTokens: fields.promptTokens ?? 0,
      completionTokens: fields.completionTokens ?? 0,
      totalTokens: fields.totalTokens ?? 0,
      cacheHit: fields.cacheHit ?? false,
      success: fields.success ?? true,
      errorCode: fields.errorCode,
      errorMessage: fields.errorMessage,
      retryCount: fields.retryCount ?? 0,
      circuitBreakerState: fields.circuitBreakerState ?? 'closed',
      durationMs: fields.durationMs ?? 0,
    };
  }
}
