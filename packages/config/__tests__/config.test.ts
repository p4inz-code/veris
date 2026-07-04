import { describe, it, expect } from 'vitest';
import { ConfigResolver, DEFAULT_CONFIG } from '../src/config.js';

describe('ConfigResolver', () => {
  it('resolves to defaults when no layers added', () => {
    const resolver = new ConfigResolver();
    const config = resolver.resolve();
    expect(config.scan?.target).toBe('.');
    expect(config.scan?.profile).toBe('balanced');
    expect(config.plugins?.enabled).toBe(true);
    expect(config.theme?.mode).toBe('dark');
    expect(config.diagnostics?.enabled).toBe(false);
  });

  it('overrides defaults with higher priority layers', () => {
    const resolver = new ConfigResolver();
    resolver.add('profile', 'test-profile', {
      scan: { target: '/custom/path', profile: 'quick' },
    });
    const config = resolver.resolve();
    expect(config.scan?.target).toBe('/custom/path');
    expect(config.scan?.profile).toBe('quick');
  });

  it('layers override in correct priority order', () => {
    const resolver = new ConfigResolver();
    resolver.add('cli', 'cli-args', {
      scan: { target: '/cli/path' },
      theme: { mode: 'light' },
    });
    resolver.add('env', 'VERIS_TARGET', {
      scan: { target: '/env/path' },
    });
    // env > cli, so env wins
    const config = resolver.resolve();
    expect(config.scan?.target).toBe('/env/path');
  });

  it('deep merges nested config', () => {
    const resolver = new ConfigResolver();
    resolver.add('profile', 'custom', {
      scan: {
        extractors: { maxFileSize: '50MB', maxDepth: 5 },
        limits: { maxDuration: '60min' },
      },
    });
    const config = resolver.resolve();
    expect(config.scan?.extractors?.maxFileSize).toBe('50MB');
    expect(config.scan?.extractors?.maxDepth).toBe(5);
    expect(config.scan?.extractors?.timeoutMs).toBe(5000); // From defaults
    expect(config.scan?.limits?.maxDuration).toBe('60min');
  });

  it('produces trace entries', () => {
    const resolver = new ConfigResolver();
    resolver.add('global', '~/.config/veris/config.json', {
      theme: { mode: 'light' },
    });
    const trace = resolver.resolveWithTrace();
    expect(trace.entries).toHaveLength(1);
    expect(trace.entries[0].layer).toBe('global');
  });

  it('supports multiple entries at same layer', () => {
    const resolver = new ConfigResolver();
    resolver.add('cli', '--profile', { scan: { profile: 'deep' } });
    resolver.add('cli', '--format', { scan: { output: { format: ['sarif'] } } });
    const config = resolver.resolve();
    expect(config.scan?.profile).toBe('deep');
    expect(config.scan?.output?.format).toEqual(['sarif']);
  });
});
