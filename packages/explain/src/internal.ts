/**
 * Internal API surface for @veris/explain.
 *
 * These types and functions are available to @veris/cli and @veris/api
 * but are NOT part of the public API. They may change between minor versions.
 *
 * @module @veris/explain/internal
 */

import type { RenderedPrompt } from './prompts/index.js';
import type { ExplanationMode } from './types/explanation.js';

// ── Internal Request Types ──

/** Internal request format used by PromptRenderer → Provider. */
export interface InternalRequest {
  readonly messages: readonly InternalMessage[];
  readonly temperature: number;
  readonly maxTokens: number;
  readonly responseFormat: 'text' | 'json';
}

/** A single message in an internal request. */
export interface InternalMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

// ── Internal Cache Options ──

/** Internal cache configuration (not exposed in public API). */
export interface InternalCacheOptions {
  readonly maxSizeMb: number;
  readonly defaultTtlMs: number;
  readonly dbPath: string;
  readonly schemaVersion: number;
}

// ── Factory Functions ──

/**
 * Create the internal request format from a rendered prompt.
 *
 * @param rendered - The rendered prompt from PromptRegistry.
 * @param mode - The explanation mode.
 * @returns An InternalRequest ready for provider consumption.
 */
export function createInternalRequest(
  rendered: RenderedPrompt,
  mode: ExplanationMode,
): InternalRequest {
  return {
    messages: [
      { role: 'system', content: rendered.systemPrompt },
      { role: 'user', content: rendered.userPrompt },
    ],
    temperature: mode === 'expert' ? 0.3 : 0.5,
    maxTokens: 4096,
    responseFormat: 'json',
  };
}

// ── Provider Config Type ──

/** Configuration for a single provider (internal). */
export interface ProviderConfig {
  readonly type: string;
  readonly enabled: boolean;
  readonly apiKey?: string;
  readonly model: string;
  readonly endpoint?: string;
  readonly organization?: string | null;
  readonly keepAlive?: string;
}
