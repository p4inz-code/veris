/**
 * @veris/rules-engine — VERIS rule matching, evaluation, scheduling, and sandboxed expression evaluation.
 *
 * ## Invariants (from SPEC-010 §3):
 * - R1: Rules are deterministic — same input always produces same output
 * - R2: Rules never modify artifacts
 * - R3: Rule evaluation is sandboxed
 * - R4: Rules are declarative matchers
 * - R5: Every rule finding must be explainable
 *
 * ## Components
 * - RuleEngine — Orchestrates rule matching and evaluation
 * - RuleScheduler — Dependency-aware rule execution order
 * - Matchers — Pattern, AST, heuristic, composite
 * - Evaluator — Safe sandboxed expression evaluator
 * - Rules are defined in @veris/rules
 */
export {};
