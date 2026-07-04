/**
 * Validation result types for the deterministic validation pipeline (M6a).
 *
 * These types define the intermediate and final results produced by each
 * step of the validation pipeline: InputFilter → StructuralValidator →
 * CitationVerifier → NullEvidenceRefusal → OutputFilter.
 *
 * ALL steps are PURELY DETERMINISTIC — no LLM provider is ever called.
 *
 * @module @veris/explain/output/validation-result
 */

// ── Severity ──

/**
 * Severity of a validation issue found during pipeline processing.
 *
 * - `"error"`: Blocking — explanation must not be delivered as-is.
 * - `"warning"`: Non-blocking — explanation can be delivered with a caveat.
 * - `"info"`: Informational — logged for auditing only.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

// ── Validation Issue ──

/**
 * A single validation issue found during pipeline processing.
 */
export interface ValidationIssue {
  /** Unique issue code within the validator (e.g., "MISSING_FIELD", "ORPHAN_CITATION"). */
  readonly code: string;
  /** Human-readable description of the issue. */
  readonly message: string;
  /** Severity level. */
  readonly severity: ValidationSeverity;
  /** Optional field or property name where the issue was found. */
  readonly field?: string;
  /** Optional value that triggered the issue (truncated if too long). */
  readonly value?: string;
}

// ── InputFilter Results ──

/**
 * Result of the InputFilter step.
 *
 * The InputFilter validates the input context before it reaches any other
 * validator. It performs context sanity checks, size validation, unsupported
 * subject detection, and schema version validation.
 */
export interface InputValidationResult {
  /** Whether the input passed all checks. */
  readonly valid: boolean;
  /** List of validation issues found. */
  readonly issues: readonly ValidationIssue[];
  /** Whether the input was filtered/sanitized (non-blocking modifications applied). */
  readonly filtered: boolean;
}

// ── StructuralValidator Results ──

/**
 * Result of the StructuralValidator step.
 *
 * The StructuralValidator validates that the explanation output has the
 * correct structure: all required fields present, non-empty text, valid
 * length, valid Markdown, citations present, no invalid characters,
 * and no duplicate citation IDs.
 */
export interface StructuralValidationResult {
  /** Whether the structure passed all checks. */
  readonly valid: boolean;
  /** List of validation issues found. */
  readonly issues: readonly ValidationIssue[];
  /** Whether the explanation contains at least one citation marker. */
  readonly hasCitations: boolean;
  /** Record of which required fields are present (true = present and valid). */
  readonly fieldPresence: Record<string, boolean>;
  /** Length of the explanation text in characters. */
  readonly textLength: number;
  /** Whether duplicate citation IDs were detected. */
  readonly hasDuplicateCitations: boolean;
}

// ── CitationVerifier Results ──

/**
 * Result of the CitationVerifier step.
 *
 * The CitationVerifier validates that every citation in the explanation
 * refers to a real object in the context, with matching type, valid ID,
 * no orphan references, no malformed citations, no duplicate references,
 * and bidirectional traceability.
 */
export interface CitationVerificationResult {
  /** Whether all citations passed verification. */
  readonly valid: boolean;
  /** List of verification issues found. */
  readonly issues: readonly ValidationIssue[];
  /** Total number of citations found in the content. */
  readonly totalCitations: number;
  /** Number of citations that passed verification. */
  readonly verifiedCitations: number;
  /** Number of citations that failed verification. */
  readonly failedCitations: number;
  /** IDs of orphan citations (references to non-existent objects). */
  readonly orphanCitations: readonly string[];
  /** IDs of citations with duplicate source references. */
  readonly duplicateCitations: readonly string[];
  /** Whether bidirectional traceability was confirmed for all citations. */
  readonly bidirectionalTraceability: boolean;
}

// ── NullEvidenceRefusal Results ──

/**
 * Result of the NullEvidenceRefusal step.
 *
 * The NullEvidenceRefusal detects explanations with zero supporting evidence
 * or fabricated/hallucinated citations and produces a deterministic refusal.
 */
export interface NullEvidenceRefusalResult {
  /** Whether the explanation was refused. */
  readonly refused: boolean;
  /** Human-readable refusal reason (only set if refused). */
  readonly reason?: string;
  /** Machine-readable refusal reason code (only set if refused). */
  readonly reasonCode?: string;
  /** List of validation issues found. */
  readonly issues: readonly ValidationIssue[];
}

// ── OutputFilter Results ──

/**
 * Result of the OutputFilter step.
 *
 * The OutputFilter validates the final output for forbidden content,
 * prompt/template leakage, internal path leakage, secret/token leakage,
 * and invalid Unicode handling.
 */
export interface OutputFilterResult {
  /** Whether the output passed all checks. */
  readonly valid: boolean;
  /** List of validation issues found. */
  readonly issues: readonly ValidationIssue[];
  /** The sanitized output content (with blocked content removed/replaced). */
  readonly sanitizedContent: string;
  /** Whether the output was blocked entirely (irrecoverable violations). */
  readonly blocked: boolean;
}

// ── Complete Pipeline Result ──

/**
 * Complete validation pipeline result.
 *
 * Contains the results of all 5 validation steps in order:
 * InputFilter → StructuralValidator → CitationVerifier →
 * NullEvidenceRefusal → OutputFilter.
 */
export interface ValidationPipelineResult {
  /** Whether the entire pipeline passed (all steps valid and not refused). */
  readonly valid: boolean;
  /** Result of the InputFilter step. */
  readonly inputValidation: InputValidationResult;
  /** Result of the StructuralValidator step. */
  readonly structuralValidation: StructuralValidationResult;
  /** Result of the CitationVerifier step. */
  readonly citationVerification: CitationVerificationResult;
  /** Result of the NullEvidenceRefusal step. */
  readonly nullEvidenceRefusal: NullEvidenceRefusalResult;
  /** Result of the OutputFilter step. */
  readonly outputFilter: OutputFilterResult;
  /** Whether the explanation was ultimately refused. */
  readonly refused: boolean;
  /** Refusal reason (only set if refused). */
  readonly refusalReason?: string;
  /** Machine-readable refusal code (only set if refused). */
  readonly refusalCode?: string;
  /** The final output content after all filtering. */
  readonly outputContent: string;
}

// ── ValidationPipeline ──

/**
 * The validation pipeline orchestrator.
 *
 * Runs all 5 deterministic validation steps in strict order:
 * 1. InputFilter
 * 2. StructuralValidator
 * 3. CitationVerifier
 * 4. NullEvidenceRefusal
 * 5. OutputFilter
 *
 * Each step receives the output of the previous step and adds its own
 * validation results to the pipeline result.
 * No validator may reorder this sequence.
 *
 * ALL steps are PURELY DETERMINISTIC — no LLM provider is ever called.
 */
export class ValidationPipeline {
  private readonly inputFilter: InputFilter;
  private readonly structuralValidator: StructuralValidator;
  private readonly citationVerifier: CitationVerifier;
  private readonly nullEvidenceRefusal: NullEvidenceRefusal;
  private readonly outputFilter: OutputFilter;

  constructor(
    inputFilter: InputFilter,
    structuralValidator: StructuralValidator,
    citationVerifier: CitationVerifier,
    nullEvidenceRefusal: NullEvidenceRefusal,
    outputFilter: OutputFilter,
  ) {
    this.inputFilter = inputFilter;
    this.structuralValidator = structuralValidator;
    this.citationVerifier = citationVerifier;
    this.nullEvidenceRefusal = nullEvidenceRefusal;
    this.outputFilter = outputFilter;
  }

  /**
   * Run the full validation pipeline.
   *
   * Pipeline order (EXACT — no reordering permitted):
   * InputFilter → StructuralValidator → CitationVerifier →
   * NullEvidenceRefusal → OutputFilter
   *
   * @param input - The raw input context or explanation to validate.
   * @param context - The ExplainedContext for citation resolution.
   * @param contextInfo - Optional context metadata for InputFilter checks.
   * @returns The complete pipeline validation result.
   */
  validate(
    input: string,
    context: { readonly evidence?: readonly unknown[]; readonly [key: string]: unknown },
    contextInfo?: {
      /** Schema version of the context (semver string like "1.0.0"). */
      readonly schemaVersion?: string;
      /** Subject type being explained. */
      readonly subjectType?: string;
    },
  ): ValidationPipelineResult {
    // Step 1: InputFilter (with optional context info for schema/subject validation)
    const inputResult = this.inputFilter.validateWithContext
      ? this.inputFilter.validateWithContext(input, contextInfo)
      : this.inputFilter.validate(input);

    if (!inputResult.valid) {
      return this.buildEarlyExit(inputResult, 'Input validation failed');
    }

    // Determine the content to pass through the pipeline (use sanitized if filtered)
    const content = inputResult.filtered ? this.inputFilter.getSanitized() : input;

    // Step 2: StructuralValidator
    const structuralResult = this.structuralValidator.validate(content);

    // Step 3: CitationVerifier
    const citationResult = this.citationVerifier.verify(
      structuralResult.hasCitations ? content : '',
      context,
    );

    // Step 4: NullEvidenceRefusal (pass content for AI refusal pattern detection)
    const refusalResult = this.nullEvidenceRefusal.evaluate(citationResult, context, content);

    // Step 5: OutputFilter
    const outputResult = this.outputFilter.filter(refusalResult.refused ? '' : content);

    const refused = refusalResult.refused;
    const allValid =
      inputResult.valid &&
      structuralResult.valid &&
      citationResult.valid &&
      outputResult.valid &&
      !refused;

    return {
      valid: allValid,
      inputValidation: inputResult,
      structuralValidation: structuralResult,
      citationVerification: citationResult,
      nullEvidenceRefusal: refusalResult,
      outputFilter: outputResult,
      refused,
      refusalReason: refusalResult.reason,
      refusalCode: refusalResult.reasonCode,
      outputContent: outputResult.blocked ? '' : outputResult.sanitizedContent,
    };
  }

  /**
   * Build an early-exit pipeline result when a blocking failure occurs.
   */
  private buildEarlyExit(
    inputResult: InputValidationResult,
    reason: string,
  ): ValidationPipelineResult {
    const empty = this.createEmptyResult();

    return {
      valid: false,
      inputValidation: inputResult,
      structuralValidation: empty.structural.validation,
      citationVerification: empty.citation.verification,
      nullEvidenceRefusal: empty.refusal,
      outputFilter: empty.output,
      refused: false,
      refusalReason: reason,
      outputContent: '',
    };
  }

  /**
   * Create empty/skip results for early exit scenarios.
   */
  private createEmptyResult(): {
    structural: { readonly validation: StructuralValidationResult };
    citation: { readonly verification: CitationVerificationResult };
    refusal: NullEvidenceRefusalResult;
    output: OutputFilterResult;
  } {
    return {
      structural: {
        validation: {
          valid: false,
          issues: [],
          hasCitations: false,
          fieldPresence: {},
          textLength: 0,
          hasDuplicateCitations: false,
        },
      },
      citation: {
        verification: {
          valid: false,
          issues: [],
          totalCitations: 0,
          verifiedCitations: 0,
          failedCitations: 0,
          orphanCitations: [],
          duplicateCitations: [],
          bidirectionalTraceability: false,
        },
      },
      refusal: {
        refused: false,
        issues: [],
      },
      output: {
        valid: false,
        issues: [],
        sanitizedContent: '',
        blocked: false,
      },
    };
  }
}

// ── Validator Interfaces ──

/**
 * Interface for all validators in the pipeline.
 * Each validator is deterministic and has zero LLM dependencies.
 */
export interface Validator {
  /** The name of this validator. */
  readonly name: string;
}

/**
 * InputFilter interface.
 *
 * Validates and sanitizes input before it reaches any other validator.
 * Detects prompt injection, context anomalies, unsupported subjects,
 * and schema version issues.
 */
export interface InputFilter extends Validator {
  /**
   * Validate and sanitize input.
   *
   * @param input - The raw input string.
   * @returns Input validation result.
   */
  validate(input: string): InputValidationResult;

  /**
   * Validate and sanitize input with optional context info for
   * schema version validation and unsupported subject detection.
   *
   * @param input - The raw input string.
   * @param contextInfo - Optional context metadata.
   * @returns Input validation result.
   */
  validateWithContext(
    input: string,
    contextInfo?: {
      readonly schemaVersion?: string;
      readonly subjectType?: string;
    },
  ): InputValidationResult;

  /**
   * Get the sanitized input after the last validate() call.
   * Returns the original input if no filtering was needed.
   */
  getSanitized(): string;
}

/**
 * StructuralValidator interface.
 *
 * Validates that the explanation output has correct structure:
 * required fields, non-empty, valid length, markdown validity,
 * citation presence, no invalid characters, no duplicate citations.
 */
export interface StructuralValidator extends Validator {
  /**
   * Validate the structure of an explanation output.
   *
   * @param input - The explanation text or JSON string.
   * @returns Structural validation result.
   */
  validate(input: string): StructuralValidationResult;
}

/**
 * CitationVerifier interface.
 *
 * Validates that every citation in the explanation refers to a real
 * object in the context, with matching type, valid ID format,
 * no orphans, no malformed citations, no duplicates, and bidirectional
 * traceability.
 */
export interface CitationVerifier extends Validator {
  /**
   * Verify all citations in the explanation against the context.
   *
   * @param content - The explanation text containing citation markers.
   * @param context - The ExplainedContext object containing all valid objects.
   * @returns Citation verification result.
   */
  verify(
    content: string,
    context: { readonly evidence?: readonly unknown[]; readonly [key: string]: unknown },
  ): CitationVerificationResult;
}

/**
 * NullEvidenceRefusal interface.
 *
 * Detects explanations with zero supporting evidence or fabricated
 * citations, and produces a deterministic refusal when appropriate.
 */
export interface NullEvidenceRefusal extends Validator {
  /**
   * Evaluate whether the explanation should be refused.
   *
   * @param citationResult - The result from CitationVerifier.
   * @param context - The ExplainedContext containing evidence objects.
   * @returns Null-evidence refusal evaluation result.
   */
  evaluate(
    citationResult: CitationVerificationResult,
    context: { readonly evidence?: readonly unknown[]; readonly [key: string]: unknown },
    content?: string,
  ): NullEvidenceRefusalResult;
}

/**
 * OutputFilter interface.
 *
 * Validates and sanitizes the final output, detecting forbidden content,
 * prompt/template leakage, internal path leakage, secret/token leakage,
 * and invalid Unicode handling.
 */
export interface OutputFilter extends Validator {
  /**
   * Filter and sanitize the output.
   *
   * @param content - The output content to filter.
   * @returns Output filter result.
   */
  filter(content: string): OutputFilterResult;
}
