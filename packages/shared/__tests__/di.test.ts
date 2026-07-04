import { describe, it, expect } from 'vitest';
import { Container, createContainer } from '../src/di/container.js';

describe('DI Container', () => {
  it('registers and resolves a service', () => {
    const c = createContainer();
    c.register('config', () => ({ key: 'value' }));
    expect(c.resolve<{ key: string }>('config').key).toBe('value');
  });

  it('resolves singleton only once', () => {
    const c = createContainer();
    let count = 0;
    c.register('counter', () => ++count, 'singleton');
    expect(c.resolve<number>('counter')).toBe(1);
    expect(c.resolve<number>('counter')).toBe(1); // Same instance
  });

  it('resolves transient each time', () => {
    const c = createContainer();
    let count = 0;
    c.register('counter', () => ++count, 'transient');
    expect(c.resolve<number>('counter')).toBe(1);
    expect(c.resolve<number>('counter')).toBe(2); // New instance
  });

  it('registerInstance stores a pre-built instance', () => {
    const c = createContainer();
    const instance = { name: 'test' };
    c.registerInstance('svc', instance);
    expect(c.resolve('svc')).toBe(instance);
  });

  it('detects circular dependencies', () => {
    const c = createContainer();
    c.register('a', (container) => container.resolve<unknown>('b'));
    c.register('b', (container) => container.resolve<unknown>('a'));
    expect(() => c.resolve('a')).toThrow('Circular dependency');
  });

  it('has returns true for registered services', () => {
    const c = createContainer();
    c.register('svc', () => ({}));
    expect(c.has('svc')).toBe(true);
    expect(c.has('unknown')).toBe(false);
  });

  it('createChild inherits parent registrations', () => {
    const parent = createContainer();
    parent.register('svc', () => ({ from: 'parent' }));
    const child = parent.createChild();
    expect(child.resolve<{ from: string }>('svc').from).toBe('parent');
  });

  it("child registrations don't affect parent", () => {
    const parent = createContainer();
    const child = parent.createChild();
    child.register('svc', () => ({ from: 'child' }));
    expect(parent.has('svc')).toBe(false);
  });

  it('tracks service count', () => {
    const c = createContainer();
    expect(c.serviceCount).toBe(0);
    c.register('a', () => ({}));
    c.register('b', () => ({}));
    expect(c.serviceCount).toBe(2);
  });

  it('throws on duplicate registration', () => {
    const c = createContainer();
    c.register('svc', () => ({}));
    expect(() => c.register('svc', () => ({}))).toThrow('already registered');
  });

  it('throws on unknown service resolution', () => {
    const c = createContainer();
    expect(() => c.resolve('unknown')).toThrow('not registered');
  });
});
