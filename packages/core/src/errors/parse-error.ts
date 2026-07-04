import { VerisError } from './veris-error.js';

/**
 * ParseError — raised when parsing an artifact's content fails.
 *
 * Examples: syntax errors in scripts, malformed binary headers,
 * encoding errors, truncated input.
 */
export class ParseError extends VerisError {
  constructor(params: {
    code?: string;
    message: string;
    userMessage?: string;
    cause?: Error | null;
    metadata?: Record<string, unknown>;
  }) {
    super({
      code: params.code ?? 'PARSE_001',
      category: 'parse',
      message: params.message,
      userMessage: params.userMessage,
      cause: params.cause,
      metadata: params.metadata,
    });
    this.name = 'ParseError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Error codes for parse errors. */
export const ParseErrorCodes = {
  SYNTAX_ERROR: 'PARSE_001',
  ENCODING_ERROR: 'PARSE_002',
  TRUNCATED_INPUT: 'PARSE_003',
  INVALID_HEADER: 'PARSE_004',
  UNSUPPORTED_FORMAT: 'PARSE_005',
  UNICODE_NORMALIZATION: 'PARSE_006',
} as const;
