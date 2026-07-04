/**
 * Adapters barrel export.
 *
 * @module @veris/ai/providers/adapters
 */

export { OpenAIAdapter } from './openai.js';
export type { OpenAIAdapterConfig } from './openai.js';

export { AnthropicAdapter } from './anthropic.js';
export type { AnthropicAdapterConfig } from './anthropic.js';

export { OllamaAdapter } from './ollama.js';
export type { OllamaAdapterConfig } from './ollama.js';

export { CustomAdapter } from './custom.js';
export type { CustomAdapterConfig } from './custom.js';

export { MockAdapter } from './mock.js';
export type { MockAdapterConfig } from './mock.js';
