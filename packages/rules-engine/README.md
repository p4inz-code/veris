# @veris/rules-engine

Rule matching, evaluation, and scheduling engine.

## Components

- **engine/** — RuleEngine, RuleScheduler, EligibilityChecker
- **matchers/** — Pattern, AST, heuristic, composite
- **evaluator/** — Safe sandboxed expression evaluator
- **scheduler/** — Dependency-aware rule scheduling

## Principles

- Rules are deterministic
- Rules never modify artifacts
- Rule evaluation is sandboxed
- Rules are declarative matchers
