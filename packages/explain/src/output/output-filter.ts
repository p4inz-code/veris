/**
 * OutputFilter — Deterministic output validation and sanitization.
 *
 * Runs FIFTH (LAST) in the M6a validation pipeline.
 *
 * Responsibilities:
 * - Forbidden content detection (harmful/blocked patterns)
 * - Prompt leakage detection (system prompt fragments)
 * - Template leakage detection (template variable fragments)
 * - Internal path leakage (filesystem paths containing internal markers)
 * - Secret/token leakage (API keys, tokens, passwords)
 * - Invalid Unicode handling (replacement/normalization)
 *
 * @module @veris/explain/output/output-filter
 */

import type {
  OutputFilter as OutputFilterInterface,
  OutputFilterResult,
  ValidationIssue,
} from './validation-result.js';

// ── Constants ──

/** Max output length in characters (100 KB). */
const MAX_OUTPUT_LENGTH = 100 * 1024;

/** Pattern for detecting prompt leakage (system prompt fragments). */
const PROMPT_LEAKAGE_PATTERNS: readonly RegExp[] = [
  /you\s+are\s+(a\s+)?(security|VERIS|analysis)\s+(analysis\s+)?explanation\s+assistant/i,
  /you\s+(never|only)\s+(perform|explain)/i,
  /every\s+factual\s+claim\s+must\s+be\s+supported\s+by\s+a\s+citation/i,
  /use\s+citation\s+format\s*:\s*\[src:/i,
  /#\s*(role|core\s*rules|output\s*(format|schema))\s*$/im,
];

/** Pattern for detecting template variable leakage. */
const TEMPLATE_LEAKAGE_PATTERNS: readonly RegExp[] = [
  /\{\{\s*(finding|evidence|rule|artifact|risk|report)\.[a-zA-Z0-9_.]+\s*\}\}/,
  /\{\{\s*#(each|if|unless|with)\s+/,
  /\{\{\s*\/\s*(each|if|unless|with)/,
  /\{\{\s*else\s*\}\}/,
  /\{\{!--/,
];

/** Pattern for detecting internal filesystem paths. */
const INTERNAL_PATH_PATTERNS: readonly RegExp[] = [
  /\/\.veris\//,
  /\/dist\//,
  /\/node_modules\//,
  /\/__tests__\//,
  /\/\.git\//,
  /\/coverage\//,
  /\\\.veris\\/,
  /\\dist\\/,
  /\\node_modules\\/,
  /\\__tests__\\/,
  /\\\.git\\/,
];

/** Pattern for detecting secrets and tokens. */
const SECRET_PATTERNS: readonly RegExp[] = [
  // AWS Access Keys
  /\bAKIA[0-9A-Z]{16}\b/,
  // AWS Secret Keys (at least one uppercase, one digit/special, exactly 40 chars)
  /\b(?=[a-zA-Z0-9/+]*[A-Z])(?=[a-zA-Z0-9/+]*[0-9/+])[a-zA-Z0-9/+]{40}\b/,
  // Generic API keys
  /\b(?:api[_-]?key|apikey|secret[_-]?key|secretkey)\s*[:=]\s*['"][0-9a-zA-Z_\-]{16,}['"]/i,
  // Bearer tokens
  /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}/i,
  // Authorization headers
  /\bAuthorization\s*:\s*(?:Basic|Bearer|Digest)\s+[A-Za-z0-9\-._~+/]{10,}/i,
  // JWT tokens
  /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/,
  // SSH keys
  /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/,
  // GitHub tokens
  /\bgh[ps]_[0-9a-zA-Z]{36}\b/,
  // Slack tokens
  /\bxox[baprs]-[0-9a-zA-Z]{10,}\b/,
  // Password-like patterns
  /\bpassword\s*[:=]\s*['"][^'"]{6,}['"]/i,
];

/** Pattern for broken Unicode (replacement character, surrogates). */
const BROKEN_UNICODE_PATTERN = /[\uFFFD\uD800-\uDFFF]/;

/** Pattern for invisible Unicode characters (beyond basic zero-width). */
const INVISIBLE_UNICODE_PATTERN = /[\u2060\u2061\u2062\u2063\u2064\u206A-\u206F]/;

/** Pattern for detecting off-topic or non-explanation content. */
const OFF_TOPIC_PATTERNS: readonly RegExp[] = [
  /^(hello|hi|hey|greetings|good\s+(morning|afternoon|evening))/im,
  /^(how\s+(can|may)\s+i\s+(help|assist)\s+you)/im,
  /^(thank\s+(you|s))/im,
  /^(welcome|you're\s+welcome)/im,
];

/** Pattern for detecting disallowed HTML tags. */
const FORBIDDEN_HTML_PATTERN =
  /<(\/?)(script|iframe|object|embed|form|input|style|meta|link)\b[^>]*>/gi;

/** Pattern for detecting disallowed JavaScript (matches : or = after event handler). */
const FORBIDDEN_JS_PATTERN = /\b(javascript|vbscript|onerror|onload|onclick|onmouseover)\s*[:=]/gi;

/** Pattern for detecting Markdown image injection. */
const MARKDOWN_IMAGE_INJECTION = /!\[.*?\]\(.*?\)/g;

/** Normalization for Unicode NFC form. */
const UNICODE_NFC_NORMALIZE = (s: string): string => s.normalize('NFC');

// ── OutputFilter Implementation ──

/**
 * Deterministic output filter that validates and sanitizes explanation
 * output, detecting and handling various types of leakage and forbidden
 * content.
 *
 * No LLM provider is ever called. All checks are pure deterministic.
 */
export class OutputFilter implements OutputFilterInterface {
  readonly name = 'OutputFilter';

  /**
   * Filter and sanitize the output content.
   *
   * Performs the following checks in order:
   * 1. Empty/null input detection
   * 2. Length validation
   * 3. Unicode normalization and invalid Unicode detection
   * 4. Forbidden content detection (HTML, JS, disallowed patterns)
   * 5. Prompt leakage detection
   * 6. Template leakage detection
   * 7. Internal path leakage detection
   * 8. Secret/token leakage detection
   * 9. Off-topic content detection
   *
   * @param content - The output content to filter.
   * @returns Output filter result.
   */
  filter(content: string): OutputFilterResult {
    const issues: ValidationIssue[] = [];

    // Step 1: Empty/null input detection
    if (!content || content.trim().length === 0) {
      return {
        valid: true,
        issues: [],
        sanitizedContent: content ?? '',
        blocked: false,
      };
    }

    let sanitized = content;
    let blocked = false;

    // Step 2: Length validation
    if (content.length > MAX_OUTPUT_LENGTH) {
      issues.push({
        code: 'OUTPUT_EXCEEDS_MAX_LENGTH',
        message: `Output exceeds maximum length of ${MAX_OUTPUT_LENGTH} characters (${content.length} chars).`,
        severity: 'warning',
        value: `${content.length} chars`,
      });
      sanitized = content.substring(0, MAX_OUTPUT_LENGTH);
    }

    // Step 3: Unicode normalization
    if (/[\uFFFD]/.test(sanitized)) {
      issues.push({
        code: 'BROKEN_UNICODE',
        message: 'Output contains replacement characters (U+FFFD).',
        severity: 'warning',
      });
    }

    if (BROKEN_UNICODE_PATTERN.test(sanitized)) {
      issues.push({
        code: 'INVALID_UNICODE_SURROGATES',
        message: 'Output contains invalid Unicode surrogates.',
        severity: 'warning',
      });
      // Remove unpaired surrogates
      sanitized = sanitized.replace(/[\uD800-\uDFFF]/g, '');
    }

    // Normalize to NFC
    sanitized = UNICODE_NFC_NORMALIZE(sanitized);

    if (INVISIBLE_UNICODE_PATTERN.test(sanitized)) {
      issues.push({
        code: 'INVISIBLE_UNICODE',
        message: 'Output contains invisible Unicode formatting characters.',
        severity: 'info',
      });
      sanitized = sanitized.replace(INVISIBLE_UNICODE_PATTERN, '');
    }

    // Step 4: Forbidden content detection
    const forbiddenHtmlMatch = sanitized.match(FORBIDDEN_HTML_PATTERN);
    if (forbiddenHtmlMatch) {
      issues.push({
        code: 'FORBIDDEN_HTML_DETECTED',
        message: 'Output contains forbidden HTML tags (script, iframe, etc.).',
        severity: 'error',
        value: forbiddenHtmlMatch[0].substring(0, 100),
      });
      blocked = true;
    }

    const forbiddenJsMatch = sanitized.match(FORBIDDEN_JS_PATTERN);
    if (forbiddenJsMatch) {
      issues.push({
        code: 'FORBIDDEN_JS_DETECTED',
        message: 'Output contains forbidden JavaScript patterns.',
        severity: 'error',
        value: forbiddenJsMatch[0].substring(0, 100),
      });
      blocked = true;
    }

    // Step 5: Prompt leakage detection
    for (const pattern of PROMPT_LEAKAGE_PATTERNS) {
      const match = sanitized.match(pattern);
      if (match) {
        issues.push({
          code: 'PROMPT_LEAKAGE_DETECTED',
          message: 'Output contains leaked system prompt content.',
          severity: 'error',
          value: match[0].substring(0, 100),
        });
        blocked = true;
      }
    }

    // Step 6: Template leakage detection
    for (const pattern of TEMPLATE_LEAKAGE_PATTERNS) {
      const match = sanitized.match(pattern);
      if (match) {
        issues.push({
          code: 'TEMPLATE_LEAKAGE_DETECTED',
          message: 'Output contains leaked template variable syntax.',
          severity: 'error',
          value: match[0].substring(0, 100),
        });
        blocked = true;
      }
    }

    // Step 7: Internal path leakage detection
    for (const pattern of INTERNAL_PATH_PATTERNS) {
      const match = sanitized.match(pattern);
      if (match) {
        issues.push({
          code: 'INTERNAL_PATH_LEAKAGE',
          message: 'Output contains internal filesystem path.',
          severity: 'warning',
          value: match[0].substring(0, 100),
        });
      }
    }

    // Step 8: Secret/token leakage detection
    for (const pattern of SECRET_PATTERNS) {
      const match = sanitized.match(pattern);
      if (match) {
        issues.push({
          code: 'SECRET_LEAKAGE_DETECTED',
          message: 'Output contains potential secret or token.',
          severity: 'error',
          value: match[0].substring(0, 50) + '...',
        });
        blocked = true;
      }
    }

    // Step 9: Off-topic content detection
    for (const pattern of OFF_TOPIC_PATTERNS) {
      const match = sanitized.match(pattern);
      if (match) {
        issues.push({
          code: 'OFF_TOPIC_CONTENT',
          message: 'Output appears to be off-topic (greeting/assistant message).',
          severity: 'warning',
          value: match[0].substring(0, 80),
        });
      }
    }

    return {
      valid: !blocked,
      issues,
      sanitizedContent: sanitized,
      blocked,
    };
  }
}
