/**
 * Plugin SDK Error Hierarchy.
 *
 * Provides lightweight error classes for authoring-time validations.
 *
 * @module @veris/plugin-sdk/errors
 */

/**
 * Base error class for all @veris/plugin-sdk errors.
 */
export class PluginAuthoringError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(message: string, code = 'PLUGIN_AUTHORING_ERROR', field?: string) {
    super(message);
    this.name = 'PluginAuthoringError';
    this.code = code;
    this.field = field;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Field-level validation detail.
 */
export interface PluginFieldValidationError {
  readonly field: string;
  readonly message: string;
}

/**
 * Error thrown when a plugin manifest or definition fails validation.
 */
export class PluginValidationError extends PluginAuthoringError {
  readonly validationErrors: readonly PluginFieldValidationError[];

  constructor(message: string, validationErrors: readonly PluginFieldValidationError[]) {
    super(message, 'PLUGIN_VALIDATION_ERROR');
    this.name = 'PluginValidationError';
    this.validationErrors = Object.freeze([...validationErrors]);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
