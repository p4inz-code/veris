# @veris/ai

AI provider adapters — consumer only, never analysis.

## Architecture

AI sits outside the analysis pipeline. It consumes results and enhances the user experience.

## Providers

- OpenAI provider adapter
- Anthropic provider adapter
- Ollama (local) provider adapter

## Features (V2+)

- Remediation suggestions
- Report summarization
- Rule writing assistance

## Constraint

AI output is clearly labeled as AI-generated and is never part of the canonical analysis report.
