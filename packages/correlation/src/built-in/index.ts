/**
 * Built-in correlation patterns for @veris/correlation.
 *
 * Each pattern correlates related evidence, rule matches, features, and capabilities
 * into deterministic behavioral chains.
 *
 * @module @veris/correlation/built-in
 */

import { CorrelationBuilder } from '../correlation-builder.js';
import type { CorrelationPattern, CorrelationCondition } from '../types.js';

// ── Utility helpers ──

function ruleMatch(...ruleIds: string[]): CorrelationCondition {
  return { type: 'rule_match', ruleIds } as const;
}

function anyRuleMatch(category?: string): CorrelationCondition {
  return { type: 'any_rule_match', ruleCategory: category } as const;
}

function evType(...types: string[]): CorrelationCondition {
  return { type: 'evidence_type', evidenceTypes: types } as const;
}

function evCat(...cats: string[]): CorrelationCondition {
  return { type: 'evidence_category', categories: cats } as const;
}

function featType(...types: string[]): CorrelationCondition {
  return { type: 'feature_type', featureTypes: types } as const;
}

function capType(...types: string[]): CorrelationCondition {
  return { type: 'capability_type', capabilityTypes: types } as const;
}

function and(...conditions: CorrelationCondition[]): CorrelationCondition {
  return { type: 'and', conditions } as const;
}

function or(...conditions: CorrelationCondition[]): CorrelationCondition {
  return { type: 'or', conditions } as const;
}

function not(condition: CorrelationCondition): CorrelationCondition {
  return { type: 'not', condition } as const;
}

function sharedArtifact(minEvidence?: number): CorrelationCondition {
  return { type: 'shared_artifact', minEvidence } as const;
}

function minCount(field: string, count: number): CorrelationCondition {
  return { type: 'minimum_count', field, count } as const;
}

// ════════════════════════════════════════════
// PROCESS INJECTION CHAINS (1-3)
// ════════════════════════════════════════════

const CORR_INJECTION_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-INJECTION-001',
  category: 'process-injection',
  name: 'Classic Windows Process Injection Chain',
  description:
    'Correlates evidence of CreateRemoteThread, WriteProcessMemory, and RWX memory sections into a complete process injection chain.',
  condition: ruleMatch('RULE-WIN-INJECTION-001'),
  explanationTemplate:
    'A classic Windows process injection chain was identified. Rule matches {{rules}} triggered on evidence {{evidence}}, showing the characteristic pattern of remote thread creation, process memory writing, and executable writable memory sections that together form a complete process injection technique.',
  tags: ['injection', 'windows', 'process-injection'],
});

const CORR_INJECTION_002: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-INJECTION-002',
  category: 'process-injection',
  name: 'DLL Injection via LoadLibrary',
  description: 'Correlates evidence of DLL injection using LoadLibrary and remote thread creation.',
  condition: and(evType('pe-import'), ruleMatch('RULE-WIN-INJECTION-001', 'RULE-WIN-HIJACK-001')),
  explanationTemplate:
    'A DLL injection chain was identified through correlated rule matches {{rules}} and evidence {{evidence}}. The combination of DLL loading APIs (LoadLibrary) with remote process manipulation techniques indicates a complete DLL injection attack chain.',
  tags: ['injection', 'dll-injection', 'windows'],
});

const CORR_INJECTION_003: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-INJECTION-003',
  category: 'process-injection',
  name: 'Cross-Platform Code Injection',
  description: 'Correlates code injection evidence across Windows and Linux platforms.',
  condition: or(ruleMatch('RULE-WIN-INJECTION-001'), ruleMatch('RULE-INJECT-LD-001')),
  explanationTemplate:
    'Code injection activity was detected. Rule matches {{rules}} and evidence {{evidence}} indicate process injection techniques are present, spanning Windows (CreateRemoteThread/WriteProcessMemory) and/or Linux (LD_PRELOAD) platforms.',
  tags: ['injection', 'cross-platform'],
});

// ════════════════════════════════════════════
// PERSISTENCE CHAINS (4-7)
// ════════════════════════════════════════════

const CORR_PERSIST_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-PERSIST-001',
  category: 'persistence',
  name: 'Windows Registry Persistence Chain',
  description:
    'Correlates registry modification evidence into a persistence chain using Run keys or Winlogon.',
  condition: or(
    ruleMatch('RULE-PERSIST-REG-001'),
    and(evType('registry-run-key'), sharedArtifact(1)),
  ),
  explanationTemplate:
    'A Windows registry-based persistence chain was identified. Rule matches {{rules}} and evidence {{evidence}} show modifications to registry autorun locations (Run keys, Winlogon), establishing a mechanism for automatic code execution at system startup or user logon.',
  tags: ['persistence', 'registry', 'windows'],
});

const CORR_PERSIST_002: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-PERSIST-002',
  category: 'persistence',
  name: 'Scheduled Task Persistence Chain',
  description: 'Correlates scheduled task or cron job creation into a persistence chain.',
  condition: or(ruleMatch('RULE-PERSIST-TASK-001'), ruleMatch('RULE-PERSIST-CRON-001')),
  explanationTemplate:
    'A scheduled task-based persistence chain was identified. Rule matches {{rules}} with evidence {{evidence}} demonstrate the creation or modification of scheduled tasks or cron jobs designed to maintain persistent access across system reboots.',
  tags: ['persistence', 'scheduled-task', 'cron'],
});

const CORR_PERSIST_003: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-PERSIST-003',
  category: 'persistence',
  name: 'Linux Cron Persistence Chain',
  description: 'Correlates Linux cron job evidence into a persistence chain.',
  condition: ruleMatch('RULE-PERSIST-CRON-001'),
  explanationTemplate:
    'A Linux cron-based persistence chain was identified. Rule matches {{rules}} and evidence {{evidence}} show unauthorized modification or addition of cron jobs, enabling scheduled execution of code on Linux systems.',
  tags: ['persistence', 'cron', 'linux'],
});

const CORR_PERSIST_004: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-PERSIST-004',
  category: 'persistence',
  name: 'Multi-Technique Persistence Chain',
  description: 'Correlates multiple persistence techniques detected on the same artifact.',
  condition: and(
    sharedArtifact(2),
    or(
      ruleMatch('RULE-PERSIST-REG-001'),
      ruleMatch('RULE-PERSIST-TASK-001'),
      ruleMatch('RULE-PERSIST-CRON-001'),
    ),
    minCount('rule_matches', 2),
  ),
  explanationTemplate:
    'Multiple persistence techniques were detected on the same target. Rule matches {{rules}} and evidence {{evidence}} indicate the use of redundant persistence mechanisms (registry, scheduled tasks, or cron), which is characteristic of advanced persistent threats seeking resilience.',
  tags: ['persistence', 'multi-technique', 'advanced'],
});

// ════════════════════════════════════════════
// CREDENTIAL THEFT CHAINS (8-11)
// ════════════════════════════════════════════

const CORR_CRED_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-CRED-001',
  category: 'credential-theft',
  name: 'Credential File Access Chain',
  description: 'Correlates evidence of credential file access or exposure.',
  condition: or(
    ruleMatch('RULE-CRED-FILE-001'),
    ruleMatch('RULE-CRED-KEY-001'),
    ruleMatch('RULE-CRED-HARDCODE-001'),
  ),
  explanationTemplate:
    'A credential access chain was identified. Rule matches {{rules}} and evidence {{evidence}} indicate the presence of exposed credentials, private keys, or hardcoded secrets that could be leveraged for unauthorized access.',
  tags: ['credential', 'access', 'secrets'],
});

const CORR_CRED_002: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-CRED-002',
  category: 'credential-theft',
  name: 'Private Key Discovery Chain',
  description: 'Correlates private key exposure with credential file evidence.',
  condition: and(
    ruleMatch('RULE-CRED-KEY-001'),
    or(evType('credential-file'), evType('private-key')),
  ),
  explanationTemplate:
    'A private key discovery chain was identified. Rule match {{rules}} and evidence {{evidence}} show exposed cryptographic private keys alongside credential files, significantly increasing the risk of authentication compromise.',
  tags: ['credential', 'private-key', 'crypto'],
});

const CORR_CRED_003: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-CRED-003',
  category: 'credential-theft',
  name: 'Environment Secret Leakage Chain',
  description: 'Correlates environment variable secrets and configuration exposures.',
  condition: ruleMatch('RULE-CRED-ENV-001'),
  explanationTemplate:
    'An environment secret leakage chain was identified. Rule matches {{rules}} and evidence {{evidence}} show credentials, API keys, or tokens exposed in environment variables or .env files, which could lead to credential compromise.',
  tags: ['credential', 'environment', 'leakage'],
});

const CORR_CRED_004: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-CRED-004',
  category: 'credential-theft',
  name: 'Comprehensive Credential Exposure Chain',
  description: 'Correlates multiple types of credential exposure on the same artifacts.',
  condition: and(
    sharedArtifact(2),
    or(
      ruleMatch('RULE-CRED-FILE-001'),
      ruleMatch('RULE-CRED-KEY-001'),
      ruleMatch('RULE-CRED-HARDCODE-001'),
      ruleMatch('RULE-CRED-ENV-001'),
    ),
    minCount('evidence', 2),
  ),
  explanationTemplate:
    'A comprehensive credential exposure chain was identified on the same target(s). Rule matches {{rules}} and evidence {{evidence}} reveal multiple credential exposure vectors, indicating a broad risk of authentication material compromise.',
  tags: ['credential', 'comprehensive', 'exposure'],
});

// ════════════════════════════════════════════
// OBFUSCATION CHAINS (12-15)
// ════════════════════════════════════════════

const CORR_OBFUSCATE_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-OBFUSCATE-001',
  category: 'obfuscation',
  name: 'Packed Executable Chain',
  description: 'Correlates packing and high-entropy evidence into an obfuscation chain.',
  condition: or(ruleMatch('RULE-EXEC-PACKED-001'), ruleMatch('RULE-OBFUSCATE-ENTROPY-001')),
  explanationTemplate:
    'An executable packing/obfuscation chain was detected. Rule matches {{rules}} and evidence {{evidence}} indicate the use of packers, cryptors, or obfuscation tools (high entropy, suspicious section characteristics) designed to evade static analysis and signature detection.',
  tags: ['obfuscation', 'packed', 'entropy'],
});

const CORR_OBFUSCATE_002: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-OBFUSCATE-002',
  category: 'obfuscation',
  name: 'Script Obfuscation Chain',
  description: 'Correlates script obfuscation evidence across multiple scripts.',
  condition: or(ruleMatch('RULE-OBFUSCATE-SCRIPT-001'), ruleMatch('RULE-OBFUSCATE-PS-001')),
  explanationTemplate:
    'A script obfuscation chain was detected. Rule matches {{rules}} and evidence {{evidence}} show scripts using encoding, eval-based techniques, or string manipulation to hide malicious intent from security tooling.',
  tags: ['obfuscation', 'script', 'encoded'],
});

const CORR_OBFUSCATE_003: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-OBFUSCATE-003',
  category: 'obfuscation',
  name: 'Multiple Obfuscation Techniques Chain',
  description: 'Correlates multiple obfuscation techniques observed on the same artifact.',
  condition: and(
    sharedArtifact(1),
    or(evType('high-entropy'), evType('high-entropy-section'), evType('encoded')),
    minCount('evidence', 2),
  ),
  explanationTemplate:
    'Multiple obfuscation techniques were detected on the same artifact. Evidence {{evidence}} shows a combination of high entropy, encoding, and other obfuscation methods, suggesting deliberate evasion of analysis tools.',
  tags: ['obfuscation', 'multi-technique'],
});

const CORR_OBFUSCATE_004: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-OBFUSCATE-004',
  category: 'obfuscation',
  name: 'Encoded PowerShell Execution Chain',
  description: 'Correlates encoded PowerShell commands with execution evidence.',
  condition: ruleMatch('RULE-OBFUSCATE-PS-001'),
  explanationTemplate:
    'An encoded PowerShell execution chain was detected. Rule matches {{rules}} and evidence {{evidence}} show Base64-encoded PowerShell commands being used, a technique commonly employed to bypass command-line logging and string-based detection.',
  tags: ['obfuscation', 'powershell', 'encoded'],
});

// ════════════════════════════════════════════
// DOWNLOADER & EXECUTION CHAINS (16-19)
// ════════════════════════════════════════════

const CORR_DOWNLOAD_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-DOWNLOAD-001',
  category: 'download-execution',
  name: 'Script Download and Execute Chain',
  description: 'Correlates evidence of scripts that download and execute remote payloads.',
  condition: and(
    evType('script'),
    or(evType('powershell-command'), evType('script-download'), evType('download-string')),
    or(ruleMatch('RULE-SCRIPT-PS-001'), evType('web-request')),
  ),
  explanationTemplate:
    'A script-based download and execute chain was identified. Evidence {{evidence}} shows scripts that download remote payloads using techniques like DownloadString, WebClient, or wget, which is a common initial access and delivery pattern for malware.',
  tags: ['download', 'execute', 'script'],
});

const CORR_DOWNLOAD_002: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-DOWNLOAD-002',
  category: 'download-execution',
  name: 'Office Macro Downloader Chain',
  description: 'Correlates Office macro execution with download capabilities.',
  condition: ruleMatch('RULE-EXEC-MACRO-001'),
  explanationTemplate:
    'An Office macro-based download and execution chain was detected. Rule matches {{rules}} and evidence {{evidence}} indicate the presence of Office macros with auto-execute behavior, a common phishing-based initial access vector.',
  tags: ['download', 'macro', 'phishing'],
});

const CORR_DOWNLOAD_003: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-DOWNLOAD-003',
  category: 'download-execution',
  name: 'Packed Executable Download Chain',
  description: 'Correlates packed executables with archive delivery mechanisms.',
  condition: and(
    ruleMatch('RULE-EXEC-PACKED-001'),
    or(ruleMatch('RULE-SUPPLY-ARCHIVE-001'), evType('archive')),
  ),
  explanationTemplate:
    'A packed executable delivery chain was identified. Rule matches {{rules}} and evidence {{evidence}} show packed/obfuscated executables delivered through archives, a common distribution mechanism for malware that combines evasion with convenient packaging.',
  tags: ['download', 'packed', 'archive'],
});

const CORR_DOWNLOAD_004: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-DOWNLOAD-004',
  category: 'download-execution',
  name: 'Suspicious PowerShell Download Chain',
  description: 'Correlates suspicious PowerShell activity with download capabilities.',
  condition: ruleMatch('RULE-SCRIPT-PS-001'),
  explanationTemplate:
    'A suspicious PowerShell download chain was detected. Rule matches {{rules}} and evidence {{evidence}} show PowerShell commands with encoded payloads, download capabilities (DownloadString), and execution patterns characteristic of post-exploitation frameworks.',
  tags: ['download', 'powershell', 'suspicious'],
});

// ════════════════════════════════════════════
// LIVING OFF THE LAND CHAINS (20-22)
// ════════════════════════════════════════════

const CORR_LOL_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-LOL-001',
  category: 'living-off-the-land',
  name: 'PowerShell Living-off-the-Land Chain',
  description: 'Correlates suspicious PowerShell usage as a living-off-the-land binary.',
  condition: ruleMatch('RULE-SCRIPT-PS-001'),
  explanationTemplate:
    'A living-off-the-land chain using PowerShell was detected. Rule matches {{rules}} and evidence {{evidence}} show PowerShell being used in ways that deviate from normal administration, leveraging a trusted system binary for malicious purposes.',
  tags: ['lolbins', 'powershell', 'living-off-the-land'],
});

const CORR_LOL_002: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-LOL-002',
  category: 'living-off-the-land',
  name: 'Scheduled Task LOLBin Chain',
  description: 'Correlates scheduled task abuse as a living-off-the-land technique.',
  condition: ruleMatch('RULE-PERSIST-TASK-001'),
  explanationTemplate:
    'A living-off-the-land chain using scheduled tasks was detected. Rule matches {{rules}} and evidence {{evidence}} demonstrate the abuse of built-in task scheduling utilities (schtasks, cron, at) for persistence, bypassing application whitelisting controls.',
  tags: ['lolbins', 'scheduled-task', 'living-off-the-land'],
});

const CORR_LOL_003: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-LOL-003',
  category: 'living-off-the-land',
  name: 'Registry LOLBin Chain',
  description: 'Correlates registry tool abuse as a living-off-the-land technique.',
  condition: ruleMatch('RULE-PERSIST-REG-001'),
  explanationTemplate:
    'A living-off-the-land chain using registry tools was detected. Rule matches {{rules}} and evidence {{evidence}} show registry modification tools (reg.exe, regedit) being used to establish persistence, a common LOLBin technique that blends with legitimate administration.',
  tags: ['lolbins', 'registry', 'living-off-the-land'],
});

// ════════════════════════════════════════════
// SCRIPT OBFUSCATION & MACRO CHAINS (23-26)
// ════════════════════════════════════════════

const CORR_SCRIPT_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-SCRIPT-001',
  category: 'script-obfuscation',
  name: 'Heavily Obfuscated Script Chain',
  description: 'Correlates evidence of heavily obfuscated scripts.',
  condition: ruleMatch('RULE-OBFUSCATE-SCRIPT-001'),
  explanationTemplate:
    'A heavily obfuscated script chain was detected. Rule matches {{rules}} and evidence {{evidence}} show scripts with extensive encoding, eval usage, and string manipulation, strongly indicating an intent to evade security analysis.',
  tags: ['script', 'obfuscation', 'evasion'],
});

const CORR_MACRO_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-MACRO-001',
  category: 'macro-execution',
  name: 'Office Macro Execution Chain',
  description: 'Correlates Office macro detection into an execution chain.',
  condition: ruleMatch('RULE-EXEC-MACRO-001'),
  explanationTemplate:
    'An Office macro execution chain was detected. Rule matches {{rules}} and evidence {{evidence}} show Office documents containing executable macros, representing a common initial access vector often delivered through phishing campaigns.',
  tags: ['macro', 'office', 'execution'],
});

const CORR_MACRO_002: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-MACRO-002',
  category: 'macro-execution',
  name: 'Macro with Encoded Payload Chain',
  description: 'Correlates Office macros with encoded or obfuscated payloads.',
  condition: and(ruleMatch('RULE-EXEC-MACRO-001'), or(evType('encoded'), evType('high-entropy'))),
  explanationTemplate:
    'An Office macro with encoded payload was detected. Rule matches {{rules}} and evidence {{evidence}} show macros that deliver encoded or high-entropy payloads, indicating an advanced phishing attempt with evasion capabilities.',
  tags: ['macro', 'encoded', 'phishing'],
});

// ════════════════════════════════════════════
// SUSPICIOUS CERTIFICATE CHAINS (27)
// ════════════════════════════════════════════

const CORR_CERT_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-CERT-001',
  category: 'suspicious-certificate',
  name: 'Unsigned or Unverified Certificate Chain',
  description: 'Correlates unsigned executable evidence with certificate anomalies.',
  condition: ruleMatch('RULE-EXEC-UNSIGNED-001'),
  explanationTemplate:
    'A suspicious certificate chain was detected. Rule matches {{rules}} and evidence {{evidence}} show executables without valid digital signatures or with unverifiable certificate chains, which may indicate tampering or untrusted origin.',
  tags: ['certificate', 'unsigned', 'signature'],
});

// ════════════════════════════════════════════
// ARCHIVE → EXECUTION → PERSISTENCE CHAINS (28-30)
// ════════════════════════════════════════════

const CORR_ARCHIVE_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-ARCHIVE-001',
  category: 'archive-execution-chain',
  name: 'Archive to Executable to Persistence Chain',
  description: 'Correlates archive-delivered executables with persistence mechanisms.',
  condition: and(
    ruleMatch('RULE-SUPPLY-ARCHIVE-001'),
    or(
      ruleMatch('RULE-PERSIST-REG-001'),
      ruleMatch('RULE-PERSIST-TASK-001'),
      ruleMatch('RULE-PERSIST-CRON-001'),
    ),
  ),
  explanationTemplate:
    'A complete archive-to-execution-to-persistence chain was identified. Rule matches {{rules}} and evidence {{evidence}} trace the full attack lifecycle: delivery via archive, execution via embedded executable, and persistence via registry/scheduled task/cron.',
  tags: ['archive', 'execution', 'persistence', 'full-chain'],
});

const CORR_ARCHIVE_002: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-ARCHIVE-002',
  category: 'archive-execution-chain',
  name: 'Archive with Packed Executable Chain',
  description: 'Correlates archives containing packed or obfuscated executables.',
  condition: and(ruleMatch('RULE-SUPPLY-ARCHIVE-001'), ruleMatch('RULE-EXEC-PACKED-001')),
  explanationTemplate:
    'An archive containing a packed executable was detected. Rule matches {{rules}} and evidence {{evidence}} show an archive delivering an obfuscated/packed executable, combining social engineering delivery with evasion techniques.',
  tags: ['archive', 'packed', 'delivery'],
});

const CORR_ARCHIVE_003: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-ARCHIVE-003',
  category: 'archive-execution-chain',
  name: 'Multi-Stage Archive Delivery Chain',
  description: 'Correlates archives with multiple embedded executables.',
  condition: and(ruleMatch('RULE-SUPPLY-ARCHIVE-001'), minCount('evidence', 2)),
  explanationTemplate:
    'A multi-stage archive delivery chain was detected. Rule matches {{rules}} and evidence {{evidence}} show archives containing multiple embedded executables, suggesting a staged payload delivery approach characteristic of sophisticated malware.',
  tags: ['archive', 'multi-stage', 'delivery'],
});

// ════════════════════════════════════════════
// DEFENSE EVASION CHAINS (31-32)
// ════════════════════════════════════════════

const CORR_EVASION_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-EVASION-001',
  category: 'defense-evasion',
  name: 'Combined Obfuscation and Unsigned Binary Chain',
  description: 'Correlates obfuscation with unsigned binaries for defense evasion.',
  condition: and(
    ruleMatch('RULE-EXEC-UNSIGNED-001'),
    or(ruleMatch('RULE-EXEC-PACKED-001'), ruleMatch('RULE-OBFUSCATE-ENTROPY-001')),
  ),
  explanationTemplate:
    'A defense evasion chain combining unsigned binaries with obfuscation was detected. Rule matches {{rules}} and evidence {{evidence}} show executables that are both unsigned and packed/obfuscated, indicating deliberate evasion of both signature detection and code integrity verification.',
  tags: ['defense-evasion', 'unsigned', 'obfuscation'],
});

const CORR_EVASION_002: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-EVASION-002',
  category: 'defense-evasion',
  name: 'Script-Based Defense Evasion Chain',
  description: 'Correlates script-based evasion techniques.',
  condition: or(ruleMatch('RULE-OBFUSCATE-SCRIPT-001'), ruleMatch('RULE-OBFUSCATE-PS-001')),
  explanationTemplate:
    'A script-based defense evasion chain was detected. Rule matches {{rules}} and evidence {{evidence}} show scripts using obfuscation, encoding, and other evasion techniques to bypass security controls and monitoring.',
  tags: ['defense-evasion', 'script', 'obfuscation'],
});

// ════════════════════════════════════════════
// CONTAINER BREAKOUT CHAINS (33-34)
// ════════════════════════════════════════════

const CORR_CONTAINER_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-CONTAINER-001',
  category: 'container-breakout',
  name: 'Dangerous Docker Configuration Chain',
  description:
    'Correlates dangerous Docker privilege configurations into a container breakout chain.',
  condition: ruleMatch('RULE-CONTAINER-DOCKER-001'),
  explanationTemplate:
    'A container breakout chain via dangerous Docker configuration was detected. Rule matches {{rules}} and evidence {{evidence}} show containers with excessive privileges (privileged mode, SYS_ADMIN, host mounts) that could allow container escape.',
  tags: ['container', 'docker', 'breakout'],
});

const CORR_CONTAINER_002: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-CONTAINER-002',
  category: 'container-breakout',
  name: 'Privileged Kubernetes Pod Chain',
  description: 'Correlates privileged Kubernetes pod configurations into a breakout chain.',
  condition: ruleMatch('RULE-CONTAINER-K8S-001'),
  explanationTemplate:
    'A container breakout chain via privileged Kubernetes pod was detected. Rule matches {{rules}} and evidence {{evidence}} show pods with privileged security contexts, which could allow container breakout and node compromise.',
  tags: ['container', 'kubernetes', 'breakout'],
});

// ════════════════════════════════════════════
// SUPPLY CHAIN CHAINS (35)
// ════════════════════════════════════════════

const CORR_SUPPLY_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-SUPPLY-001',
  category: 'supply-chain',
  name: 'DLL Hijacking Supply Chain Chain',
  description: 'Correlates DLL hijacking evidence into a supply chain compromise chain.',
  condition: ruleMatch('RULE-WIN-HIJACK-001'),
  explanationTemplate:
    'A supply chain compromise chain via DLL hijacking was detected. Rule matches {{rules}} and evidence {{evidence}} show unsafe DLL loading patterns that could be exploited to inject malicious code through the software supply chain.',
  tags: ['supply-chain', 'dll-hijacking'],
});

// ════════════════════════════════════════════
// PRIVILEGE ESCALATION CHAINS (36)
// ════════════════════════════════════════════

const CORR_PRIVESC_001: CorrelationPattern = CorrelationBuilder.fromDefinition({
  id: 'CORR-PRIVESC-001',
  category: 'privilege-escalation',
  name: 'LD_PRELOAD Privilege Escalation Chain',
  description: 'Correlates LD_PRELOAD injection with potential privilege escalation.',
  condition: ruleMatch('RULE-INJECT-LD-001'),
  explanationTemplate:
    'An LD_PRELOAD-based privilege escalation chain was detected. Rule matches {{rules}} and evidence {{evidence}} indicate LD_PRELOAD injection, which can be used for privilege escalation when setuid binaries are involved or for code injection into running processes.',
  tags: ['privilege-escalation', 'ld-preload', 'linux'],
});

// ════════════════════════════════════════════
// ALL PATTERNS
// ════════════════════════════════════════════

export const BUILT_IN_PATTERNS: readonly CorrelationPattern[] = Object.freeze([
  CORR_INJECTION_001,
  CORR_INJECTION_002,
  CORR_INJECTION_003,
  CORR_PERSIST_001,
  CORR_PERSIST_002,
  CORR_PERSIST_003,
  CORR_PERSIST_004,
  CORR_CRED_001,
  CORR_CRED_002,
  CORR_CRED_003,
  CORR_CRED_004,
  CORR_OBFUSCATE_001,
  CORR_OBFUSCATE_002,
  CORR_OBFUSCATE_003,
  CORR_OBFUSCATE_004,
  CORR_DOWNLOAD_001,
  CORR_DOWNLOAD_002,
  CORR_DOWNLOAD_003,
  CORR_DOWNLOAD_004,
  CORR_LOL_001,
  CORR_LOL_002,
  CORR_LOL_003,
  CORR_SCRIPT_001,
  CORR_MACRO_001,
  CORR_MACRO_002,
  CORR_CERT_001,
  CORR_ARCHIVE_001,
  CORR_ARCHIVE_002,
  CORR_ARCHIVE_003,
  CORR_EVASION_001,
  CORR_EVASION_002,
  CORR_CONTAINER_001,
  CORR_CONTAINER_002,
  CORR_SUPPLY_001,
  CORR_PRIVESC_001,
]);

export const BUILT_IN_PATTERNS_BY_CATEGORY: Record<string, number> = Object.freeze({
  'process-injection': 3,
  persistence: 4,
  'credential-theft': 4,
  obfuscation: 4,
  'download-execution': 4,
  'living-off-the-land': 3,
  'script-obfuscation': 1,
  'macro-execution': 2,
  'suspicious-certificate': 1,
  'archive-execution-chain': 3,
  'defense-evasion': 2,
  'container-breakout': 2,
  'supply-chain': 1,
  'privilege-escalation': 1,
});
