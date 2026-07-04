import { VerisError } from './veris-error.js';

/**
 * RuleError — raised when a rule fails to load, compile, or execute.
 *
 * Examples: invalid rule definition, matcher compilation failure,
 * sandbox timeout, rule dependency cycle.
 */
export class RuleError extends VerisError {
  constructor(params: {
    code?: string;
    message: string;
    userMessage?: string;
    cause?: Error | null;
    metadata?: Record<string, unknown>;
  }) {
    super({
      code: params.code ?? 'RULE_001',
      category: 'rule',
      message: params.message,
      userMessage: params.userMessage,
      cause: params.cause,
      metadata: params.metadata,
    });
    this.name = 'RuleError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Error codes for rule errors. */
export const RuleErrorCodes = {
  INVALID_DEFINITION: 'RULE_001',
  COMPILATION_FAILED: 'RULE_002',
  EXECUTION_TIMEOUT: 'RULE_003',
  DEPENDENCY_CYCLE: 'RULE_004',
  MISSING_DEPENDENCY: 'RULE_005',
  SANDBOX_VIOLATION: 'RULE_006',
} as const;
