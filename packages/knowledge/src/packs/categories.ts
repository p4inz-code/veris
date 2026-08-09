/**
 * Knowledge Categories — canonical category definitions for Knowledge Packs.
 *
 * Categories are the top-level taxonomy for organizing knowledge entries.
 * Each category has a unique ID, human-readable name, and description.
 *
 * @module @veris/knowledge/packs/categories
 */

/** A knowledge category definition. */
export interface KnowledgeCategory {
  /** Unique category ID. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Detailed description. */
  readonly description: string;
  /** Category tags for filtering. */
  readonly tags: readonly string[];
  /** Ordering weight (lower = higher priority). */
  readonly weight: number;
}

/** All built-in knowledge categories. */
export const BUILT_IN_CATEGORIES: readonly KnowledgeCategory[] = Object.freeze([
  {
    id: 'malware-families',
    name: 'Malware Families',
    description:
      'Known malware families, variants, and their characteristics including behavioral patterns, persistence mechanisms, and IoCs.',
    tags: ['malware', 'families', 'threats', 'triage'],
    weight: 10,
  },
  {
    id: 'packers',
    name: 'Packers and Protectors',
    description:
      'Executable packers, cryptors, protectors, and obfuscation tools used to conceal malicious code.',
    tags: ['packers', 'obfuscation', 'cryptors', 'protectors'],
    weight: 20,
  },
  {
    id: 'lolbins',
    name: 'Living-off-the-Land Binaries',
    description:
      'Legitimate system binaries and scripts that can be abused by attackers for malicious purposes (LOLBins/LOLScripts).',
    tags: ['lolbins', 'lolscripts', 'living-off-the-land', 'defense-evasion'],
    weight: 30,
  },
  {
    id: 'persistence',
    name: 'Persistence Mechanisms',
    description:
      'Techniques and locations used by malware to maintain persistence across reboots, including registry run keys, services, scheduled tasks, and startup folders.',
    tags: ['persistence', 'registry', 'services', 'scheduled-tasks', 'startup'],
    weight: 40,
  },
  {
    id: 'powershell-abuse',
    name: 'PowerShell Abuse',
    description:
      'Malicious PowerShell scripts, techniques, and patterns including encoded commands, download cradles, reflection, and AMSI bypasses.',
    tags: ['powershell', 'scripting', 'amsi-bypass', 'download-cradle'],
    weight: 50,
  },
  {
    id: 'suspicious-apis',
    name: 'Suspicious API Patterns',
    description:
      'Windows API call patterns commonly associated with malicious behavior including process injection, credential theft, and anti-debugging.',
    tags: ['windows-api', 'system-calls', 'native-api', 'win32'],
    weight: 60,
  },
  {
    id: 'archive-abuse',
    name: 'Archive Abuse Patterns',
    description:
      'Techniques involving archive files for malicious purposes including extraction exploits, zip bombs, and embedded payloads.',
    tags: ['archives', 'zip', 'rar', '7z', 'extraction'],
    weight: 70,
  },
  {
    id: 'network-indicators',
    name: 'Network Indicators',
    description:
      'Network-based indicators of compromise including C2 patterns, domain generation algorithms (DGAs), and suspicious connection behaviors.',
    tags: ['network', 'c2', 'dga', 'indicators', 'domains'],
    weight: 80,
  },
  {
    id: 'credential-theft',
    name: 'Credential Theft',
    description:
      'Techniques and tools for stealing credentials including keyloggers, credential dumping, browser credential theft, and pass-the-hash.',
    tags: ['credentials', 'theft', 'dumping', 'keylogging', 'password'],
    weight: 90,
  },
  {
    id: 'process-injection',
    name: 'Process Injection',
    description:
      'Process injection techniques including DLL injection, process hollowing, reflective loading, atom bombing, and APC injection.',
    tags: ['injection', 'process', 'dll-injection', 'hollowing', 'reflective-loading'],
    weight: 100,
  },
  {
    id: 'living-off-the-land',
    name: 'Living-off-the-Land Attacks',
    description:
      'Attack techniques that leverage built-in system tools and features for malicious purposes without dropping custom binaries.',
    tags: ['lotl', 'living-off-the-land', 'built-in', 'dual-use'],
    weight: 110,
  },
]);

/** Map of category ID → KnowledgeCategory for fast lookup. */
const CATEGORY_MAP: ReadonlyMap<string, KnowledgeCategory> = (() => {
  const map = new Map<string, KnowledgeCategory>();
  for (const cat of BUILT_IN_CATEGORIES) {
    map.set(cat.id, cat);
  }
  return map;
})();

/**
 * Get a knowledge category by ID.
 */
export function getCategory(id: string): KnowledgeCategory | undefined {
  return CATEGORY_MAP.get(id);
}

/**
 * Check if a category ID is valid.
 */
export function isValidCategory(id: string): boolean {
  return CATEGORY_MAP.has(id);
}

/**
 * Get all built-in category IDs.
 */
export function getAllCategoryIds(): readonly string[] {
  return BUILT_IN_CATEGORIES.map((c) => c.id);
}

/**
 * Get all built-in categories sorted by weight.
 */
export function getAllCategories(): readonly KnowledgeCategory[] {
  return BUILT_IN_CATEGORIES;
}
