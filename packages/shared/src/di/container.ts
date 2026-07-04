/**
 * Simple dependency injection container for VERIS.
 *
 * Provides a composition root for wiring dependencies.
 * Uses constructor injection pattern — no service locator.
 *
 * @module @veris/shared/di/container
 */

/** Factory function that creates a service instance. */
export type Factory<T> = (container: Container) => T;

/** Service lifetime — how long a service instance lives. */
export type ServiceLifetime = 'singleton' | 'transient';

/** Service registration entry. */
interface ServiceEntry<T> {
  readonly factory: Factory<T>;
  readonly lifetime: ServiceLifetime;
  instance?: T;
}

/**
 * Simple DI container for VERIS.
 *
 * Features:
 * - Constructor injection (services receive the container to resolve dependencies)
 * - Singleton and transient lifetimes
 * - Lazy initialization
 * - Circular dependency detection
 */
export class Container {
  private readonly services: Map<string, ServiceEntry<unknown>> = new Map();
  private readonly resolving: Set<string> = new Set();

  /**
   * Register a service with the given name and factory.
   *
   * @param name - Service identifier (e.g., "logger", "config")
   * @param factory - Factory function receiving the container
   * @param lifetime - "singleton" (default) or "transient"
   */
  register<T>(name: string, factory: Factory<T>, lifetime: ServiceLifetime = 'singleton'): void {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }
    this.services.set(name, { factory, lifetime });
  }

  /**
   * Register a service as a singleton instance directly.
   */
  registerInstance<T>(name: string, instance: T): void {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }
    this.services.set(name, {
      factory: () => instance,
      lifetime: 'singleton',
      instance,
    });
  }

  /**
   * Resolve a service by name.
   * Throws if the service is not registered.
   */
  resolve<T>(name: string): T {
    const entry = this.services.get(name);
    if (!entry) {
      throw new Error(`Service '${name}' is not registered`);
    }

    // Detect circular dependencies
    if (this.resolving.has(name)) {
      throw new Error(`Circular dependency detected for service '${name}'`);
    }

    // Return cached singleton instance
    if (entry.lifetime === 'singleton' && entry.instance !== undefined) {
      return entry.instance as T;
    }

    // Create new instance
    this.resolving.add(name);
    try {
      const instance = entry.factory(this) as T;

      // Cache singleton
      if (entry.lifetime === 'singleton') {
        entry.instance = instance;
      }

      return instance;
    } finally {
      this.resolving.delete(name);
    }
  }

  /**
   * Check if a service is registered.
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Create a child container that inherits all parent registrations.
   * Child registrations don't affect the parent.
   */
  createChild(): Container {
    const child = new Container();
    for (const [name, entry] of this.services) {
      child.services.set(name, { ...entry });
    }
    return child;
  }

  /**
   * Get the number of registered services.
   */
  get serviceCount(): number {
    return this.services.size;
  }
}

/**
 * Create an empty DI container.
 */
export function createContainer(): Container {
  return new Container();
}
