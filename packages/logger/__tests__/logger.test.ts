import { describe, it, expect, vi } from 'vitest';
import { Logger, SilentTransport, createLogger } from '../src/logger.js';

describe('Logger', () => {
  it('creates a logger with default transports', () => {
    const log = createLogger('test');
    expect(log).toBeInstanceOf(Logger);
  });

  it('does not throw when logging at disabled level', () => {
    const log = createLogger('test', { level: 'error' });
    expect(() => log.info('should not log')).not.toThrow();
  });

  it('logs at trace level', () => {
    const transport = new SilentTransport();
    const writeSpy = vi.spyOn(transport, 'write');
    const log = createLogger('test', { level: 'trace', transports: [transport] });
    log.trace('trace message');
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('logs at debug level', () => {
    const transport = new SilentTransport();
    const writeSpy = vi.spyOn(transport, 'write');
    const log = createLogger('test', { level: 'debug', transports: [transport] });
    log.debug('debug message');
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('logs at info level', () => {
    const transport = new SilentTransport();
    const writeSpy = vi.spyOn(transport, 'write');
    const log = createLogger('test', { level: 'info', transports: [transport] });
    log.info('info message');
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('logs at warn level', () => {
    const transport = new SilentTransport();
    const writeSpy = vi.spyOn(transport, 'write');
    const log = createLogger('test', { level: 'warn', transports: [transport] });
    log.warn('warn message');
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('logs at error level with Error object', () => {
    const transport = new SilentTransport();
    const writeSpy = vi.spyOn(transport, 'write');
    const log = createLogger('test', { level: 'trace', transports: [transport] });
    log.error('error message', new Error('test error'));
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('logs at fatal level', () => {
    const transport = new SilentTransport();
    const writeSpy = vi.spyOn(transport, 'write');
    const log = createLogger('test', { level: 'trace', transports: [transport] });
    log.fatal('fatal message');
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('child creates a logger with additional context', () => {
    const transport = new SilentTransport();
    const writeSpy = vi.spyOn(transport, 'write');
    const log = createLogger('test', { level: 'trace', transports: [transport] });
    const child = log.child({ requestId: '123' });
    child.info('child message');
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('isEnabled checks if a level is enabled', () => {
    const log = createLogger('test', { level: 'info' });
    expect(log.isEnabled('info')).toBe(true);
    expect(log.isEnabled('debug')).toBe(false);
    expect(log.isEnabled('error')).toBe(true);
  });

  it('timing scope logs start and end', () => {
    const transport = new SilentTransport();
    const writeSpy = vi.spyOn(transport, 'write');
    const log = createLogger('test', { level: 'trace', transports: [transport] });
    const scope = log.time('test-operation');
    scope.end();
    expect(writeSpy).toHaveBeenCalledTimes(2); // start + end
  });
});
