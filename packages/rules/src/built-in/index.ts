/**
 * Built-in rules for @veris/rules.
 *
 * These are representative rules covering common behavioral patterns.
 * Every rule includes an explanation template that explains WHY it matched.
 *
 * @module @veris/rules/built-in
 */

import { RuleBuilder } from '../rule-builder.js';
import type { Rule, RuleCondition } from '../types.js';

// ── Utility: create a simple evidence type condition ──

function evType(type: string): RuleCondition {
  return { type: 'evidence_type', evidenceType: type } as const;
}

function featType(type: string): RuleCondition {
  return { type: 'feature_type', featureType: type } as const;
}

function capType(type: string): RuleCondition {
  return { type: 'capability_type', capabilityType: type } as const;
}

function and(...conditions: RuleCondition[]): RuleCondition {
  return { type: 'and', conditions } as const;
}

function or(...conditions: RuleCondition[]): RuleCondition {
  return { type: 'or', conditions } as const;
}

// ── 1. Windows Process Injection ──

const RULE_WIN_INJECTION_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-WIN-INJECTION-001',
  category: 'injection',
  name: 'Windows Process Injection',
  description:
    'Detects evidence of Windows process injection technique based on API imports and memory characteristics.',
  condition: and(
    evType('pe-import'),
    or(
      and(
        evType('pe-import'),
        { type: 'contains', field: 'metadata.dll', value: 'kernel32' },
        { type: 'contains', field: 'type', value: 'CreateRemoteThread' },
      ),
      and(
        evType('pe-import'),
        { type: 'contains', field: 'metadata.dll', value: 'kernel32' },
        { type: 'contains', field: 'type', value: 'WriteProcessMemory' },
      ),
      evType('pe-rwx-section'),
    ),
  ),
  severityHint: 'critical',
  explanationTemplate:
    'Process injection indicators were observed. Evidence {{evidence}} includes API imports (CreateRemoteThread, WriteProcessMemory) and/or executable writable (RWX) memory sections, which are characteristic of process injection techniques such as classic DLL injection or reflective injection.',
  mitreTechniques: ['T1055.001', 'T1055.002'],
  references: ['https://attack.mitre.org/techniques/T1055/'],
  tags: ['injection', 'windows', 'process-injection'],
});

// ── 2. DLL Search Order Hijacking ──

const RULE_WIN_HIJACK_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-WIN-HIJACK-001',
  category: 'persistence',
  name: 'DLL Search Order Hijacking',
  description:
    'Detects evidence of DLL search order hijacking based on file location and load library patterns.',
  condition: and(
    or(evType('pe-import'), evType('configuration')),
    or(
      { type: 'contains', field: 'metadata.dll', value: 'kernel32.LoadLibrary' },
      { type: 'contains', field: 'type', value: 'dll-hijack' },
      { type: 'equals', field: 'type', value: 'unsafe-dll-load' },
    ),
  ),
  severityHint: 'high',
  explanationTemplate:
    'DLL search order hijacking potential was identified. Evidence {{evidence}} shows unsafe DLL loading patterns (LoadLibrary calls without fully qualified paths), which can allow attackers to load malicious DLLs by placing them earlier in the search order.',
  mitreTechniques: ['T1574.001', 'T1574.002'],
  references: ['https://attack.mitre.org/techniques/T1574/'],
  tags: ['persistence', 'dll-hijacking', 'windows'],
});

// ── 3. Packed Executable ──

const RULE_EXEC_PACKED_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-EXEC-PACKED-001',
  category: 'obfuscation',
  name: 'Packed Executable',
  description:
    'Detects evidence of executable packing or obfuscation based on entropy and section characteristics.',
  condition: or(
    evType('high-entropy-section'),
    evType('high-entropy'),
    and(evType('pe-section'), { type: 'range', field: 'metadata.entropy', min: 6.5 }),
  ),
  severityHint: 'high',
  explanationTemplate:
    'A packed or obfuscated executable was detected. Evidence {{evidence}} shows sections with abnormally high entropy (≥6.5), which is characteristic of packers, cryptors, or obfuscation tools designed to evade static analysis.',
  mitreTechniques: ['T1027.002'],
  references: ['https://attack.mitre.org/techniques/T1027/'],
  tags: ['obfuscation', 'packed', 'executable'],
});

// ── 4. Suspicious PowerShell ──

const RULE_SCRIPT_PS_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-SCRIPT-PS-001',
  category: 'execution',
  name: 'Suspicious PowerShell Execution',
  description:
    'Detects evidence of suspicious PowerShell execution patterns commonly used in attacks.',
  condition: and(
    evType('script'),
    { type: 'equals', field: 'type', value: 'powershell-command' },
    or(
      { type: 'contains', field: 'metadata.command', value: '-EncodedCommand' },
      { type: 'contains', field: 'metadata.command', value: '-e ' },
      { type: 'contains', field: 'metadata.command', value: 'IEX' },
      { type: 'contains', field: 'metadata.command', value: 'Invoke-Expression' },
      { type: 'contains', field: 'metadata.command', value: 'DownloadString' },
    ),
  ),
  severityHint: 'high',
  explanationTemplate:
    'Suspicious PowerShell execution was detected. Evidence {{evidence}} shows PowerShell commands using obfuscation techniques (encoded commands, IEX/Invoke-Expression, or DownloadString), which are commonly used in malware delivery and post-exploitation activities.',
  mitreTechniques: ['T1059.001'],
  references: ['https://attack.mitre.org/techniques/T1059/'],
  tags: ['execution', 'powershell', 'scripting'],
});

// ── 5. Office Macro Execution ──

const RULE_EXEC_MACRO_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-EXEC-MACRO-001',
  category: 'execution',
  name: 'Office Macro Execution',
  description: 'Detects evidence of Office macros with suspicious or auto-execute behavior.',
  condition: and(
    evType('document'),
    or(evType('office-macro'), { type: 'equals', field: 'type', value: 'auto-execute-macro' }),
    { type: 'confidence_threshold', threshold: 0.5 },
  ),
  severityHint: 'medium',
  explanationTemplate:
    'Office document with macros was detected. Evidence {{evidence}} indicates the presence of executable macros (including auto-execute macros like Auto_Open or Workbook_Open), which are a common initial access vector for malware delivery.',
  mitreTechniques: ['T1204.002', 'T1566.001'],
  references: ['https://attack.mitre.org/techniques/T1204/'],
  tags: ['execution', 'macro', 'office', 'phishing'],
});

// ── 6. Encoded PowerShell ──

const RULE_OBFUSCATE_PS_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-OBFUSCATE-PS-001',
  category: 'obfuscation',
  name: 'Encoded PowerShell Command',
  description: 'Detects Base64-encoded PowerShell commands used to obfuscate malicious intent.',
  condition: and(
    evType('script'),
    { type: 'contains', field: 'type', value: 'powershell' },
    { type: 'regex', field: 'metadata.command', pattern: '[-/]E[A-Z]?\\s+[A-Za-z0-9+/=]{20,}' },
  ),
  severityHint: 'high',
  explanationTemplate:
    'An encoded PowerShell command was detected. Evidence {{evidence}} contains Base64-encoded PowerShell commands, which are commonly used to hide malicious payloads from security monitoring tools and string-based detection.',
  mitreTechniques: ['T1027.010', 'T1059.001'],
  references: ['https://attack.mitre.org/techniques/T1027/'],
  tags: ['obfuscation', 'powershell', 'encoded'],
});

// ── 7. Persistence via Registry ──

const RULE_PERSIST_REG_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-PERSIST-REG-001',
  category: 'persistence',
  name: 'Persistence via Registry Run Keys',
  description: 'Detects evidence of persistence mechanisms using Windows registry Run keys.',
  condition: or(
    evType('registry-run-key'),
    evType('registry-persistence'),
    and(
      evType('configuration'),
      { type: 'contains', field: 'type', value: 'registry' },
      {
        type: 'regex',
        field: 'metadata.key',
        pattern: '(Run|RunOnce|RunServices|Windows\\s*NT\\\\CurrentVersion\\\\Winlogon)',
      },
    ),
  ),
  severityHint: 'high',
  explanationTemplate:
    'Registry-based persistence mechanism was identified. Evidence {{evidence}} shows modifications to Windows registry Run keys or Winlogon entries, which are commonly used by malware to achieve automatic execution at system startup.',
  mitreTechniques: ['T1547.001'],
  references: ['https://attack.mitre.org/techniques/T1547/'],
  tags: ['persistence', 'registry', 'windows'],
});

// ── 8. Persistence via Scheduled Task ──

const RULE_PERSIST_TASK_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-PERSIST-TASK-001',
  category: 'persistence',
  name: 'Persistence via Scheduled Task',
  description: 'Detects evidence of persistence using scheduled tasks or cron jobs.',
  condition: or(
    evType('scheduled-task'),
    evType('cron-persistence'),
    and(evType('script'), evType('configuration'), {
      type: 'regex',
      field: 'metadata.name',
      pattern: '(schtasks|cron|at\\s+\\d|systemd\\.timer)',
    }),
  ),
  severityHint: 'high',
  explanationTemplate:
    'Scheduled task-based persistence was detected. Evidence {{evidence}} indicates configuration of scheduled tasks (schtasks, cron, at, systemd timers) for automatic execution, which is a common technique for establishing persistent access.',
  mitreTechniques: ['T1053.002', 'T1053.005'],
  references: ['https://attack.mitre.org/techniques/T1053/'],
  tags: ['persistence', 'scheduled-task', 'cron'],
});

// ── 9. Cron Persistence (Linux) ──

const RULE_PERSIST_CRON_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-PERSIST-CRON-001',
  category: 'persistence',
  name: 'Cron Persistence',
  description: 'Detects evidence of persistence via cron job manipulation on Linux systems.',
  condition: and(
    evType('configuration'),
    evType('script'),
    or(
      { type: 'contains', field: 'type', value: 'crontab' },
      { type: 'regex', field: 'metadata.file', pattern: '(cron\\.|crontab|/etc/cron\\.)' },
    ),
  ),
  severityHint: 'medium',
  explanationTemplate:
    'Cron-based persistence was detected. Evidence {{evidence}} shows modifications or additions to cron jobs, which can be used to maintain persistence on Linux systems by scheduling malicious script execution at specified intervals.',
  mitreTechniques: ['T1053.003'],
  references: ['https://attack.mitre.org/techniques/T1053/'],
  tags: ['persistence', 'cron', 'linux'],
});

// ── 10. Linux LD_PRELOAD ──

const RULE_INJECT_LD_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-INJECT-LD-001',
  category: 'injection',
  name: 'Linux LD_PRELOAD Injection',
  description: 'Detects evidence of LD_PRELOAD-based shared object injection on Linux.',
  condition: or(
    evType('ld-preload'),
    and(evType('configuration'), evType('executable'), {
      type: 'contains',
      field: 'type',
      value: 'ld_preload',
    }),
    and(evType('environment'), { type: 'contains', field: 'type', value: 'LD_PRELOAD' }),
  ),
  severityHint: 'critical',
  explanationTemplate:
    'LD_PRELOAD-based injection was detected. Evidence {{evidence}} shows use of the LD_PRELOAD environment variable or configuration, which forces the dynamic linker to load specified shared objects before all others — a technique commonly used for both legitimate debugging and malicious code injection.',
  mitreTechniques: ['T1574.006'],
  references: ['https://attack.mitre.org/techniques/T1574/'],
  tags: ['injection', 'ld-preload', 'linux'],
});

// ── 11. Unsigned Executable ──

const RULE_EXEC_UNSIGNED_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-EXEC-UNSIGNED-001',
  category: 'defense-evasion',
  name: 'Unsigned Executable',
  description: 'Detects executable files that lack valid digital signatures.',
  condition: and(
    evType('executable'),
    { type: 'exists', field: 'metadata.signing' },
    or(
      { type: 'equals', field: 'metadata.signed', value: false },
      { type: 'equals', field: 'metadata.verified', value: false },
    ),
  ),
  severityHint: 'medium',
  explanationTemplate:
    'An unsigned executable was detected. Evidence {{evidence}} indicates the executable lacks a valid digital signature or has an unverifiable signature chain, which may indicate tampering or origin from untrusted sources.',
  mitreTechniques: ['T1553.002'],
  references: ['https://attack.mitre.org/techniques/T1553/'],
  tags: ['defense-evasion', 'unsigned', 'signature'],
});

// ── 12. Embedded Executable in Archive ──

const RULE_SUPPLY_ARCHIVE_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-SUPPLY-ARCHIVE-001',
  category: 'supply-chain',
  name: 'Embedded Executable in Archive',
  description:
    'Detects executable files embedded within archive files, a common malware delivery technique.',
  condition: and(
    evType('archive'),
    { type: 'exists', field: 'metadata.embeddedExecutables' },
    { type: 'minimum_count', field: 'metadata.embeddedExecutables', count: 1 },
  ),
  severityHint: 'high',
  explanationTemplate:
    'An archive containing embedded executables was detected. Evidence {{evidence}} shows executable files within an archive, which is a common delivery mechanism for malware, trojans, and initial access payloads.',
  mitreTechniques: ['T1204.002'],
  references: ['https://attack.mitre.org/techniques/T1204/'],
  tags: ['supply-chain', 'archive', 'malware-delivery'],
});

// ── 13. High Entropy Packed Binary ──

const RULE_OBFUSCATE_ENTROPY_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-OBFUSCATE-ENTROPY-001',
  category: 'obfuscation',
  name: 'High Entropy Packed Binary',
  description:
    'Detects binaries with very high entropy sections indicative of packing or encryption.',
  condition: and(or(evType('high-entropy'), evType('high-entropy-section')), {
    type: 'range',
    field: 'metadata.entropy',
    min: 7.5,
  }),
  severityHint: 'high',
  explanationTemplate:
    'A binary with very high entropy (≥7.5) was detected. Evidence {{evidence}} shows entropy levels consistent with packed, encrypted, or compressed code sections, which strongly indicates obfuscation intended to evade signature-based detection.',
  mitreTechniques: ['T1027.002'],
  references: ['https://attack.mitre.org/techniques/T1027/'],
  tags: ['obfuscation', 'entropy', 'packed', 'high-entropy'],
});

// ── 14. Credential File Exposure ──

const RULE_CRED_FILE_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-CRED-FILE-001',
  category: 'credential-access',
  name: 'Credential File Exposure',
  description:
    'Detects files that may contain exposed credentials or sensitive authentication data.',
  condition: or(
    evType('credential-file'),
    and(evType('configuration'), {
      type: 'regex',
      field: 'metadata.filename',
      pattern: '(password|credential|secret|key|\\.env|\\.netrc)',
    }),
    and(evType('configuration'), { type: 'contains', field: 'type', value: 'password-in-config' }),
  ),
  severityHint: 'critical',
  explanationTemplate:
    'Potential credential exposure was detected. Evidence {{evidence}} indicates files or configurations that may contain plaintext credentials, API keys, or authentication secrets, which could lead to unauthorized access if exposed.',
  mitreTechniques: ['T1552.001'],
  references: ['https://attack.mitre.org/techniques/T1552/'],
  tags: ['credential-access', 'secrets', 'exposure'],
});

// ── 15. Private Key Exposure ──

const RULE_CRED_KEY_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-CRED-KEY-001',
  category: 'credential-access',
  name: 'Private Key Exposure',
  description: 'Detects exposed or improperly stored private cryptographic keys.',
  condition: or(
    evType('private-key'),
    and(evType('configuration'), {
      type: 'regex',
      field: 'metadata.filename',
      pattern: '(id_rsa|id_dsa|id_ed25519|\\.pem|\\.key|private\\.key)',
    }),
    and(evType('configuration'), { type: 'contains', field: 'type', value: 'private-key' }),
  ),
  severityHint: 'critical',
  explanationTemplate:
    'Exposed private cryptographic key was detected. Evidence {{evidence}} shows private key files that are accessible or improperly stored, which could allow attackers to decrypt communications, impersonate services, or compromise authentication systems.',
  mitreTechniques: ['T1552.004'],
  references: ['https://attack.mitre.org/techniques/T1552/'],
  tags: ['credential-access', 'crypto', 'private-key'],
});

// ── 16. Hardcoded Secrets ──

const RULE_CRED_HARDCODE_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-CRED-HARDCODE-001',
  category: 'credential-access',
  name: 'Hardcoded Secrets',
  description:
    'Detects hardcoded API keys, tokens, and passwords in source code or configuration files.',
  condition: or(
    evType('hardcoded-secret'),
    evType('api-key'),
    evType('hardcoded-password'),
    and(featType('string-literal'), {
      type: 'regex',
      field: 'value',
      pattern: '(?:ghp|gho|ghu|ghs)_[A-Za-z0-9_]{36,}',
    }),
  ),
  severityHint: 'high',
  explanationTemplate:
    'Hardcoded secrets were detected. Evidence {{evidence}} shows API keys, tokens, or passwords embedded directly in source code or configuration files, which violates security best practices and risks credential exposure through version control or logs.',
  mitreTechniques: [],
  references: [],
  tags: ['credential-access', 'hardcoded', 'secrets'],
});

// ── 17. Dangerous Docker Privileges ──

const RULE_CONTAINER_DOCKER_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-CONTAINER-DOCKER-001',
  category: 'container',
  name: 'Dangerous Docker Privileges',
  description: 'Detects Docker containers with excessive or dangerous privilege configurations.',
  condition: and(
    evType('container'),
    evType('configuration'),
    or(
      { type: 'equals', field: 'metadata.privileged', value: true },
      { type: 'contains', field: 'metadata.capabilities', value: 'SYS_ADMIN' },
      { type: 'contains', field: 'metadata.capabilities', value: 'SYS_PTRACE' },
      { type: 'contains', field: 'metadata.mounts', value: '/var/run/docker.sock' },
    ),
  ),
  severityHint: 'critical',
  explanationTemplate:
    'Dangerous Docker container privileges were detected. Evidence {{evidence}} shows containers configured with privileged mode, elevated capabilities (SYS_ADMIN, SYS_PTRACE), or host system mounts that could allow container escape or host compromise.',
  mitreTechniques: ['T1611'],
  references: ['https://attack.mitre.org/techniques/T1611/'],
  tags: ['container', 'docker', 'privilege-escalation'],
});

// ── 18. Privileged Kubernetes Pod ──

const RULE_CONTAINER_K8S_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-CONTAINER-K8S-001',
  category: 'container',
  name: 'Privileged Kubernetes Pod',
  description: 'Detects Kubernetes pod configurations with elevated or dangerous privileges.',
  condition: and(
    evType('container'),
    or(
      { type: 'equals', field: 'metadata.privileged', value: true },
      { type: 'contains', field: 'metadata.securityContext', value: 'privileged' },
      { type: 'contains', field: 'metadata.securityContext', value: 'allowPrivilegeEscalation' },
    ),
  ),
  severityHint: 'critical',
  explanationTemplate:
    'A privileged Kubernetes pod configuration was detected. Evidence {{evidence}} shows pods with privileged security contexts or privilege escalation enabled, which could allow container breakout and compromise of the Kubernetes node.',
  mitreTechniques: ['T1611'],
  references: ['https://attack.mitre.org/techniques/T1611/'],
  tags: ['container', 'kubernetes', 'privilege-escalation'],
});

// ── 19. Suspicious Script Obfuscation ──

const RULE_OBFUSCATE_SCRIPT_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-OBFUSCATE-SCRIPT-001',
  category: 'obfuscation',
  name: 'Suspicious Script Obfuscation',
  description:
    'Detects heavily obfuscated scripts using encoding, eval, or string manipulation techniques.',
  condition: and(
    evType('script'),
    or(
      { type: 'equals', field: 'type', value: 'obfuscated-script' },
      { type: 'contains', field: 'type', value: 'encoded' },
      { type: 'contains', field: 'type', value: 'obfuscated' },
    ),
    or(
      { type: 'exists', field: 'metadata.encoding' },
      { type: 'exists', field: 'metadata.obfuscationTechniques' },
    ),
  ),
  severityHint: 'high',
  explanationTemplate:
    'Suspicious script obfuscation was detected. Evidence {{evidence}} shows scripts using encoding, eval-based execution, or string manipulation techniques designed to evade static analysis and signature-based detection.',
  mitreTechniques: ['T1027.010', 'T1059'],
  references: ['https://attack.mitre.org/techniques/T1027/'],
  tags: ['obfuscation', 'script', 'evasion'],
});

// ── 20. Environment Secret Leakage ──

const RULE_CRED_ENV_001: Rule = RuleBuilder.fromDefinition({
  id: 'RULE-CRED-ENV-001',
  category: 'credential-access',
  name: 'Environment Secret Leakage',
  description:
    'Detects potential leakage of secrets through environment variables or environment files.',
  condition: or(
    evType('environment-secret'),
    and(
      evType('configuration'),
      { type: 'equals', field: 'type', value: 'env-file' },
      { type: 'exists', field: 'metadata.secrets' },
    ),
    and(evType('environment'), {
      type: 'regex',
      field: 'metadata.name',
      pattern: '(SECRET|PASSWORD|TOKEN|API_KEY|ACCESS_KEY)',
    }),
  ),
  severityHint: 'high',
  explanationTemplate:
    'Environment secret leakage was detected. Evidence {{evidence}} shows secrets, passwords, or API keys exposed in environment variables or environment files (.env), which can lead to credential compromise if the environment is shared or the files are committed to version control.',
  mitreTechniques: ['T1552'],
  references: [],
  tags: ['credential-access', 'environment', 'secrets', 'leakage'],
});

// ── Registry ──

/** All built-in rules. */
export const BUILT_IN_RULES: readonly Rule[] = Object.freeze([
  RULE_WIN_INJECTION_001,
  RULE_WIN_HIJACK_001,
  RULE_EXEC_PACKED_001,
  RULE_SCRIPT_PS_001,
  RULE_EXEC_MACRO_001,
  RULE_OBFUSCATE_PS_001,
  RULE_PERSIST_REG_001,
  RULE_PERSIST_TASK_001,
  RULE_PERSIST_CRON_001,
  RULE_INJECT_LD_001,
  RULE_EXEC_UNSIGNED_001,
  RULE_SUPPLY_ARCHIVE_001,
  RULE_OBFUSCATE_ENTROPY_001,
  RULE_CRED_FILE_001,
  RULE_CRED_KEY_001,
  RULE_CRED_HARDCODE_001,
  RULE_CONTAINER_DOCKER_001,
  RULE_CONTAINER_K8S_001,
  RULE_OBFUSCATE_SCRIPT_001,
  RULE_CRED_ENV_001,
]);

/** Category summary of built-in rules. */
export const BUILT_IN_RULES_BY_CATEGORY: Record<string, number> = Object.freeze({
  injection: 2,
  persistence: 3,
  execution: 2,
  obfuscation: 4,
  'credential-access': 4,
  'defense-evasion': 1,
  'supply-chain': 1,
  container: 2,
});
