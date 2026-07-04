/**
 * Built-in recommendations for @veris/recommendations.
 *
 * These are deterministic, metadata-only recommendation templates.
 * Each recommendation is frozen and ready for registration in a
 * RecommendationRegistry.
 *
 * ## Convention
 * IDs follow the format: {CATEGORY_CODE}-{NUMBER}
 * where CATEGORY_CODE is a short mnemonic (e.g., TR = Trojan, PE = Packed Executable).
 *
 * ## Invariants
 * - Every recommendation has at least one reference.
 * - All objects are frozen for immutability.
 * - No recommendation generation logic exists here — these are templates only.
 *
 * @module @veris/recommendations/built-in-recommendations
 */

import { SCHEMA_VERSION, ENGINE_VERSION } from './constants.js';
import type { Recommendation } from './types.js';
import { CATEGORIES, ACTIONS, SOURCE_TYPES } from './types.js';

// ── Helpers ──

/**
 * Create a frozen built-in recommendation with consistent defaults.
 */
function builtIn(
  id: string,
  priority: Recommendation['priority'],
  category: Recommendation['category'],
  action: Recommendation['action'],
  title: string,
  description: string,
  rationale: string,
): Recommendation {
  return Object.freeze<Recommendation>({
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    id,
    priority,
    category,
    action,
    title,
    description,
    references: Object.freeze([
      Object.freeze({
        sourceType: SOURCE_TYPES.RULE,
        sourceId: `rule_${id}`,
        sourceName: title,
      }),
    ]),
    documentationRefs: Object.freeze([]),
    assessment: null,
    rationale,
    metadata: Object.freeze({}),
  });
}

// ── Trojan / Malware Detection ──

/** TR-01: Remove confirmed trojan or malware from the system. */
export const TR01_TROJAN_REMOVAL: Recommendation = builtIn(
  'TR-01',
  'critical',
  CATEGORIES.REMEDIATION,
  ACTIONS.REMOVE,
  'Trojan Removal',
  'Remove the confirmed trojan or malware from the system immediately. ' +
    'The artifact exhibits multiple indicators of malicious behavior consistent with trojan activity, ' +
    'including unauthorized system modifications, persistence mechanisms, and可疑 network communications.',
  'Multiple rule matches indicate trojan-like behavior patterns. ' +
    'Critical severity requires immediate removal to prevent further system compromise.',
);

/** TR-02: Quarantine a suspicious file for further analysis. */
export const TR02_QUARANTINE_SUSPICIOUS_FILE: Recommendation = builtIn(
  'TR-02',
  'high',
  CATEGORIES.REMEDIATION,
  ACTIONS.QUARANTINE,
  'Quarantine Suspicious File',
  'Quarantine the suspicious file for further analysis. ' +
    'The file exhibits suspicious characteristics that warrant isolation from the system ' +
    'until a full investigation can be completed.',
  'Suspicious behavior patterns detected but not confirmed as malicious. ' +
    'Quarantine provides safe isolation while preserving the artifact for detailed analysis.',
);

// ── Packed Executable Detection ──

/** PE-01: Review a packed executable for hidden malicious code. */
export const PE01_PACKED_EXECUTABLE_REVIEW: Recommendation = builtIn(
  'PE-01',
  'high',
  CATEGORIES.INVESTIGATION,
  ACTIONS.REVIEW,
  'Packed Executable Review',
  'Review the packed executable for hidden malicious code. ' +
    'Packers are commonly used by malware authors to obfuscate the true nature of executable content. ' +
    'Unpack the executable and re-analyze to reveal potential hidden threats.',
  'The executable uses packing techniques commonly associated with malware distribution. ' +
    'Manual review or advanced unpacking is required to determine if the content is malicious.',
);

/** PE-02: Investigate suspicious packer usage. */
export const PE02_SUSPICIOUS_PACKER: Recommendation = builtIn(
  'PE-02',
  'medium',
  CATEGORIES.INVESTIGATION,
  ACTIONS.REVIEW,
  'Suspicious Packer Investigation',
  'Investigate the use of suspicious packers or cryptors in the executable. ' +
    'While some packers have legitimate uses, their presence warrants additional scrutiny ' +
    'to rule out malicious intent.',
  'The executable uses a packer that is statistically correlated with malware. ' +
    'Further investigation is needed to determine legitimacy.',
);

// ── PowerShell Activity ──

/** PS-01: Review suspicious PowerShell activity. */
export const PS01_REVIEW_POWERSHELL_ACTIVITY: Recommendation = builtIn(
  'PS-01',
  'medium',
  CATEGORIES.INVESTIGATION,
  ACTIONS.REVIEW,
  'Review PowerShell Activity',
  'Review the PowerShell script or command for malicious intent. ' +
    'PowerShell is a common vector for fileless attacks and living-off-the-land techniques. ' +
    'Examine the script contents, encoded commands, and network connections.',
  'PowerShell activity was detected with characteristics that warrant manual review. ' +
    'Attackers frequently abuse PowerShell for execution, persistence, and exfiltration.',
);

/** PS-02: Investigate obfuscated PowerShell. */
export const PS02_POWERSHELL_OBFUSCATION: Recommendation = builtIn(
  'PS-02',
  'high',
  CATEGORIES.INVESTIGATION,
  ACTIONS.REVIEW,
  'PowerShell Obfuscation Alert',
  'Investigate obfuscated PowerShell content. ' +
    'Obfuscation techniques such as Base64 encoding, string splitting, and compression ' +
    'are commonly used to hide malicious intent from security tooling.',
  'Obfuscated PowerShell content is a strong indicator of malicious intent. ' +
    'Legitimate scripts rarely employ obfuscation techniques.',
);

// ── Credential Exposure ──

/** CR-01: Review exposed credentials. */
export const CR01_CREDENTIAL_EXPOSURE_REVIEW: Recommendation = builtIn(
  'CR-01',
  'critical',
  CATEGORIES.REMEDIATION,
  ACTIONS.REMOVE,
  'Credential Exposure Review',
  'Review and remove exposed credentials found in the codebase or configuration. ' +
    'Hardcoded passwords, API keys, tokens, and other secrets must be rotated immediately. ' +
    'Use a secrets management solution for secure credential storage.',
  'Exposed credentials pose an immediate security risk. ' +
    'Any discovered secrets should be considered compromised and rotated without delay.',
);

/** CR-02: Remove hardcoded credentials from source code. */
export const CR02_HARDCODED_CREDENTIAL_REMOVAL: Recommendation = builtIn(
  'CR-02',
  'high',
  CATEGORIES.REMEDIATION,
  ACTIONS.REMOVE,
  'Hardcoded Credential Removal',
  'Remove hardcoded credentials from source code and configuration files. ' +
    'Replace with environment variables, vault references, or a secrets management system. ' +
    'Hardcoded secrets are a leading cause of credential leakage in version control.',
  'Hardcoded credentials violate security best practices and are a common source of data breaches. ' +
    'All secrets should be stored outside of source code.',
);

// ── Persistence Mechanisms ──

/** AU-01: Audit persistence mechanisms. */
export const AU01_PERSISTENCE_AUDIT: Recommendation = builtIn(
  'AU-01',
  'medium',
  CATEGORIES.INVESTIGATION,
  ACTIONS.REVIEW,
  'Persistence Audit',
  'Audit the system for persistence mechanisms installed by the suspicious artifact. ' +
    'Check common persistence locations including startup folders, registry run keys, ' +
    'scheduled tasks, services, and WMI event subscriptions.',
  "Persistence mechanisms were detected or are suspected based on the artifact's behavior. " +
    'Thorough auditing is required to ensure no persistence point remains.',
);

/** AU-02: Review suspicious autostart entries. */
export const AU02_SUSPICIOUS_AUTOSTART: Recommendation = builtIn(
  'AU-02',
  'high',
  CATEGORIES.INVESTIGATION,
  ACTIONS.REVIEW,
  'Suspicious Autostart Review',
  'Review suspicious autostart or boot persistence entries. ' +
    'Malware frequently installs autostart mechanisms to survive reboots. ' +
    'Examine all registry Run keys, Startup folders, and scheduled tasks for unauthorized entries.',
  'Suspicious autostart entries indicate an attempt to establish persistent access. ' +
    'Each entry must be reviewed and unauthorized entries removed.',
);

// ── Script Analysis ──

/** JS-01: Review JavaScript for suspicious behavior. */
export const JS01_JAVASCRIPT_REVIEW: Recommendation = builtIn(
  'JS-01',
  'medium',
  CATEGORIES.INVESTIGATION,
  ACTIONS.REVIEW,
  'JavaScript Review',
  'Review the JavaScript file for suspicious behavior including obfuscation, ' +
    'dynamic code execution (eval, document.write), and connections to known malicious domains. ' +
    'Be particularly cautious of minified or encoded scripts.',
  'The JavaScript exhibits characteristics that warrant manual review. ' +
    'Malicious JavaScript is increasingly used in supply chain attacks and drive-by downloads.',
);

// ── Document Analysis ──

/** DOC-01: Inspect Office document for macros. */
export const DOC01_OFFICE_DOCUMENT_INSPECTION: Recommendation = builtIn(
  'DOC-01',
  'medium',
  CATEGORIES.INVESTIGATION,
  ACTIONS.REVIEW,
  'Office Document Inspection',
  'Inspect the Office document for embedded macros, OLE objects, and other executable content. ' +
    'Malicious macros remain one of the most common initial access vectors. ' +
    'Review the macro source code and any external connections the document attempts to make.',
  'The Office document contains or is suspected of containing executable content. ' +
    'Manual inspection is required to determine if the macros are malicious.',
);

// ── Certificate Validation ──

/** CERT-01: Validate suspicious certificates. */
export const CERT01_CERTIFICATE_VALIDATION: Recommendation = builtIn(
  'CERT-01',
  'high',
  CATEGORIES.REMEDIATION,
  ACTIONS.REVIEW,
  'Certificate Validation',
  'Validate the authenticity and trustworthiness of the digital certificate. ' +
    'Check the certificate chain, revocation status, and signing authority. ' +
    'Self-signed, expired, or revoked certificates are common indicators of malicious software.',
  'The digital certificate used to sign the artifact has suspicious characteristics. ' +
    'Invalid or untrusted certificates are frequently used by malware authors.',
);

// ── Network Security ──

/** NET-01: Review network configuration for security issues. */
export const NET01_NETWORK_CONFIGURATION_REVIEW: Recommendation = builtIn(
  'NET-01',
  'low',
  CATEGORIES.PREVENTION,
  ACTIONS.REVIEW,
  'Network Configuration Review',
  'Review the network configuration for security issues including open ports, ' +
    'weak encryption, and exposed services. Ensure that network boundaries are properly ' +
    'configured and that unnecessary services are disabled.',
  'Network configuration issues were detected that could be exploited by attackers. ' +
    'Proactive review and hardening reduces the attack surface.',
);

// ── Obfuscation Analysis ──

/** OB-01: Analyze obfuscated code patterns. */
export const OB01_OBFUSCATED_CODE_ANALYSIS: Recommendation = builtIn(
  'OB-01',
  'high',
  CATEGORIES.INVESTIGATION,
  ACTIONS.REVIEW,
  'Obfuscated Code Analysis',
  'Analyze the obfuscated code to determine its true purpose. ' +
    'Obfuscation techniques including string encoding, control flow flattening, ' +
    'and dead code insertion are used to evade detection. ' +
    'Deobfuscation tools and manual analysis may be required.',
  'Suspicious obfuscation patterns were detected. ' +
    'Malicious code is frequently obfuscated to bypass security tooling.',
);

// ── All Built-in Recommendations ──

/**
 * All built-in recommendations in registration order.
 *
 * This array is frozen and ready for use with
 * `createRecommendationRegistry().registerMany(BUILT_IN_RECOMMENDATIONS)`.
 */
export const BUILT_IN_RECOMMENDATIONS: readonly Recommendation[] = Object.freeze([
  TR01_TROJAN_REMOVAL,
  TR02_QUARANTINE_SUSPICIOUS_FILE,
  PE01_PACKED_EXECUTABLE_REVIEW,
  PE02_SUSPICIOUS_PACKER,
  PS01_REVIEW_POWERSHELL_ACTIVITY,
  PS02_POWERSHELL_OBFUSCATION,
  CR01_CREDENTIAL_EXPOSURE_REVIEW,
  CR02_HARDCODED_CREDENTIAL_REMOVAL,
  AU01_PERSISTENCE_AUDIT,
  AU02_SUSPICIOUS_AUTOSTART,
  JS01_JAVASCRIPT_REVIEW,
  DOC01_OFFICE_DOCUMENT_INSPECTION,
  CERT01_CERTIFICATE_VALIDATION,
  NET01_NETWORK_CONFIGURATION_REVIEW,
  OB01_OBFUSCATED_CODE_ANALYSIS,
]);
