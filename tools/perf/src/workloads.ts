/**
 * VERIS Benchmark Workload Definitions.
 *
 * Defines the workload matrix — a set of representative scan targets that
 * exercise different parts of the VERIS pipeline. Workloads are synthesized
 * in temporary directories from templates, so they are portable and
 * machine-independent.
 *
 * @module @veris/perf
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import type { WorkloadDefinition } from './types.js';

// ── Workload Templates ──

/**
 * Synthesize a "small" workload: 5 clean JS files (~700 bytes total).
 * Exercises: discovery, classification, extraction (JS), knowledge, rules.
 * Mimics scanning a tiny utility library.
 */
async function createSmallWorkload(dir: string): Promise<WorkloadDefinition> {
  for (let i = 0; i < 5; i++) {
    await fsp.writeFile(
      path.join(dir, `module-${i}.js`),
      [
        `// Module ${i} — clean utility`,
        `'use strict';`,
        `function util${i}(x) { return x * ${i + 1}; }`,
        `function helper${i}(arr) { return arr.map(util${i}); }`,
        `module.exports = { util${i}, helper${i} };`,
        '',
      ].join('\n'),
    );
  }

  return {
    id: 'small',
    name: 'Small (5 JS files)',
    description:
      'Minimal workload: 5 clean JavaScript modules. Measures baseline startup + pipeline overhead.',
    fileCount: 5,
    totalSizeBytes: 5 * 140,
    category: 'small',
    usesRepoFixtures: false,
  };
}

/**
 * Synthesize a "medium" workload: 25 mixed files (~5 KB total).
 * Exercises: JS/TS extraction, JSON/YAML config classification, broader rule coverage.
 * Mimics scanning a small project with configs and source.
 */
async function createMediumWorkload(dir: string): Promise<WorkloadDefinition> {
  // 10 JS files
  for (let i = 0; i < 10; i++) {
    await fsp.writeFile(
      path.join(dir, `src-${i}.js`),
      [
        `// Source file ${i}`,
        `const config = require('./config-${i % 3}.json');`,
        `function process${i}(data) {`,
        `  const result = data.filter(x => x > ${i});`,
        `  return result.map(x => x + config.offset);`,
        `}`,
        `module.exports = { process${i} };`,
        '',
      ].join('\n'),
    );
  }

  // 5 TypeScript files
  for (let i = 0; i < 5; i++) {
    await fsp.writeFile(
      path.join(dir, `handler-${i}.ts`),
      [
        `// TypeScript handler ${i}`,
        `interface Input { value: number; label: string; }`,
        `export function handle${i}(input: Input): string {`,
        `  return \`[\${input.label}] \${input.value * ${i + 1}}\`;`,
        `}`,
        '',
      ].join('\n'),
    );
  }

  // 5 JSON config files
  for (let i = 0; i < 5; i++) {
    await fsp.writeFile(
      path.join(dir, `config-${i}.json`),
      JSON.stringify(
        {
          name: `config-${i}`,
          version: '1.0.0',
          offset: i * 10,
          debug: false,
          features: Array.from({ length: 3 }, (_, j) => `feature-${j}`),
        },
        null,
        2,
      ) + '\n',
    );
  }

  // 3 YAML files
  for (let i = 0; i < 3; i++) {
    await fsp.writeFile(
      path.join(dir, `settings-${i}.yaml`),
      [
        `# Settings ${i}`,
        `name: settings-${i}`,
        `enabled: true`,
        `threshold: ${i * 0.25}`,
        `tags:`,
        `  - production`,
        `  - v${i}`,
        '',
      ].join('\n'),
    );
  }

  // 2 Shell scripts
  for (let i = 0; i < 2; i++) {
    await fsp.writeFile(
      path.join(dir, `deploy-${i}.sh`),
      [
        `#!/bin/bash`,
        `# Deploy script ${i}`,
        `set -euo pipefail`,
        `echo "Deploying version ${i}"`,
        `exit 0`,
        '',
      ].join('\n'),
    );
  }

  return {
    id: 'medium',
    name: 'Medium (25 mixed files)',
    description:
      'Mixed project workload: JS, TS, JSON, YAML, Shell. Exercises multi-extractor pipeline and broader classification.',
    fileCount: 25,
    totalSizeBytes: 25 * 200,
    category: 'medium',
    usesRepoFixtures: false,
  };
}

/**
 * Synthesize a "large" workload: 100 files (~20 KB total).
 * Exercises: scaling behavior, throughput measurement, memory pressure.
 * Mimics scanning a moderately-sized project.
 */
async function createLargeWorkload(dir: string): Promise<WorkloadDefinition> {
  // 50 JS files
  for (let i = 0; i < 50; i++) {
    const lines = [`// Auto-generated module ${i}`, `'use strict';`];
    for (let j = 0; j < 5; j++) {
      lines.push(`function fn_${i}_${j}(x) { return x + ${i * 10 + j}; }`);
    }
    lines.push(
      `module.exports = { ${Array.from({ length: 5 }, (_, j) => `fn_${i}_${j}`).join(', ')} };`,
    );
    lines.push('');
    await fsp.writeFile(path.join(dir, `lib-${i}.js`), lines.join('\n'));
  }

  // 20 TS files
  for (let i = 0; i < 20; i++) {
    await fsp.writeFile(
      path.join(dir, `service-${i}.ts`),
      [
        `export interface Service${i}Config { port: number; host: string; }`,
        `export class Service${i} {`,
        `  constructor(private config: Service${i}Config) {}`,
        `  start(): void { /* noop */ }`,
        `  stop(): void { /* noop */ }`,
        `}`,
        '',
      ].join('\n'),
    );
  }

  // 15 JSON
  for (let i = 0; i < 15; i++) {
    await fsp.writeFile(
      path.join(dir, `data-${i}.json`),
      JSON.stringify(
        { id: i, items: Array.from({ length: 5 }, (_, j) => ({ k: j, v: `val-${i}-${j}` })) },
        null,
        2,
      ) + '\n',
    );
  }

  // 10 YAML
  for (let i = 0; i < 10; i++) {
    await fsp.writeFile(
      path.join(dir, `rule-${i}.yaml`),
      [`rule_${i}:`, `  severity: medium`, `  pattern: "test-${i}"`, `  enabled: true`, ''].join(
        '\n',
      ),
    );
  }

  // 5 Shell
  for (let i = 0; i < 5; i++) {
    await fsp.writeFile(
      path.join(dir, `script-${i}.sh`),
      [`#!/bin/bash`, `echo "Script ${i}"`, `exit 0`, ''].join('\n'),
    );
  }

  return {
    id: 'large',
    name: 'Large (100 mixed files)',
    description:
      'Scaling workload: 100 mixed files (JS, TS, JSON, YAML, Shell). Measures throughput and memory under volume.',
    fileCount: 100,
    totalSizeBytes: 100 * 200,
    category: 'large',
    usesRepoFixtures: false,
  };
}

/**
 * Synthesize a "security-mixed" workload: uses patterns similar to repo
 * fixtures (malicious + safe), exercising rule matching and findings generation.
 */
async function createSecurityMixedWorkload(dir: string): Promise<WorkloadDefinition> {
  // Safe files
  await fsp.writeFile(
    path.join(dir, 'clean-config.json'),
    JSON.stringify(
      { name: 'safe-project', version: '1.0.0', description: 'Clean project' },
      null,
      2,
    ) + '\n',
  );
  await fsp.writeFile(
    path.join(dir, 'hello.js'),
    `// Clean utility\nfunction greet(name) { return \`Hello, \${name}!\`; }\nmodule.exports = { greet };\n`,
  );
  await fsp.writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      { compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext' } },
      null,
      2,
    ) + '\n',
  );
  await fsp.writeFile(
    path.join(dir, 'utils.ts'),
    `export function add(a: number, b: number): number { return a + b; }\n`,
  );
  await fsp.writeFile(
    path.join(dir, 'readme.md'),
    `# Test Project\n\nA sample project for benchmark testing.\n`,
  );

  // Files with suspicious patterns (to exercise rule matching)
  await fsp.writeFile(
    path.join(dir, 'bad-config.json'),
    JSON.stringify(
      {
        name: 'suspicious-project',
        config: {
          password: 'super_secret_123',
          api_key: 'sk-live-abc123def456',
          debug: true,
          allow_origin: '*',
        },
      },
      null,
      2,
    ) + '\n',
  );
  await fsp.writeFile(
    path.join(dir, 'obfuscated.js'),
    [
      '// Suspicious patterns for testing',
      'const _0x1234 = \'eval(atob("cHJvY2Vzcy5lbnYuU0VDUkVUX0tFWQ=="))\';',
      'function _0x5678() {',
      '  // eslint-disable-next-line no-eval',
      '  eval(_0x1234);',
      '}',
      'module.exports = { _0x5678 };',
      '',
    ].join('\n'),
  );
  await fsp.writeFile(
    path.join(dir, 'hardcoded-creds.js'),
    [
      '// Hardcoded credentials pattern',
      'const DB_PASSWORD = "admin123";',
      'const API_TOKEN = "ghp_1234567890abcdef";',
      'const SECRET_KEY = "sk_live_abcdef123456";',
      'module.exports = { DB_PASSWORD, API_TOKEN, SECRET_KEY };',
      '',
    ].join('\n'),
  );

  return {
    id: 'security-mixed',
    name: 'Security Mixed (8 files: safe + suspicious)',
    description:
      'Mixed security workload with clean and suspicious files. Exercises rule matching, finding generation, and risk scoring paths.',
    fileCount: 8,
    totalSizeBytes: 8 * 200,
    category: 'mixed',
    usesRepoFixtures: false,
    sourceFixturePath: 'fixtures/samples (pattern-based)',
  };
}

// ── Workload Manager ──

/** A prepared workload ready for benchmarking. */
export interface PreparedWorkload {
  /** The workload definition. */
  readonly definition: WorkloadDefinition;
  /** Absolute path to the workload directory. */
  readonly targetDir: string;
  /** Cleanup function to remove the temporary directory. */
  readonly cleanup: () => Promise<void>;
}

/**
 * All available workload IDs.
 */
export const WORKLOAD_IDS = ['small', 'medium', 'large', 'security-mixed'] as const;
export type WorkloadId = (typeof WORKLOAD_IDS)[number];

/**
 * Prepare a workload for benchmarking.
 * Creates a temporary directory and synthesizes the workload files.
 */
export async function prepareWorkload(id: WorkloadId): Promise<PreparedWorkload> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), `veris-bench-${id}-`));
  const targetDir = path.join(root, 'target');
  await fsp.mkdir(targetDir, { recursive: true });

  let definition: WorkloadDefinition;

  switch (id) {
    case 'small':
      definition = await createSmallWorkload(targetDir);
      break;
    case 'medium':
      definition = await createMediumWorkload(targetDir);
      break;
    case 'large':
      definition = await createLargeWorkload(targetDir);
      break;
    case 'security-mixed':
      definition = await createSecurityMixedWorkload(targetDir);
      break;
    default:
      throw new Error(`Unknown workload: ${id}`);
  }

  return {
    definition,
    targetDir,
    cleanup: async () => {
      await fsp.rm(root, { recursive: true, force: true }).catch(() => {});
    },
  };
}
