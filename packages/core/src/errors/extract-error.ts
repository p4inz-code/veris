import { VerisError } from './veris-error.js';

/**
 * ExtractError — raised when an extractor fails to process an artifact.
 *
 * Examples: archive extraction failure, unsupported archive format,
 * resource limits exceeded, security violation (zip bomb, path traversal).
 */
export class ExtractError extends VerisError {
  constructor(params: {
    code?: string;
    message: string;
    userMessage?: string;
    cause?: Error | null;
    metadata?: Record<string, unknown>;
  }) {
    super({
      code: params.code ?? 'EXTRACT_001',
      category: 'extract',
      message: params.message,
      userMessage: params.userMessage,
      cause: params.cause,
      metadata: params.metadata,
    });
    this.name = 'ExtractError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Error codes for extract errors. */
export const ExtractErrorCodes = {
  EXTRACTION_FAILED: 'EXTRACT_001',
  UNSUPPORTED_TYPE: 'EXTRACT_002',
  SECURITY_VIOLATION: 'EXTRACT_003',
  LIMIT_EXCEEDED: 'EXTRACT_004',
  ARCHIVE_CORRUPTED: 'EXTRACT_005',
  PARSER_TIMEOUT: 'EXTRACT_006',
} as const;
