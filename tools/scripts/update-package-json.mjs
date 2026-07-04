/**
 * Script to normalize package.json metadata across all packages.
 * Adds sideEffects: false, repository, homepage, bugs, funding, keywords.
 *
 * Uses fs to avoid shell escaping issues with the clean scripts.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const repoUrl = "https://github.com/veris/veris";
const repo = { type: "git", url: repoUrl + ".git" };
const bugs = { url: repoUrl + "/issues" };
const homepage = repoUrl;
const funding = { type: "github", url: repoUrl + "/funding" };

const baseKeywords = ["security", "malware", "forensics", "analysis", "deterministic", "scanner", "typescript"];

const packageKeywords = {
  ai: ["llm", "openai", "anthropic", "ollama", "provider"],
  analysis: ["evidence", "feature", "analyzer"],
  analyzer: ["orchestrator", "pipeline"],
  api: ["sdk", "integration"],
  classification: ["file-type", "magic-bytes", "heuristic"],
  cli: ["cli", "command-line"],
  config: ["configuration", "settings"],
  core: ["types", "domain", "constants", "errors"],
  correlation: ["correlation", "behavior", "chain"],
  discovery: ["filesystem", "traversal", "artifact"],
  explain: ["explanation", "llm", "ai", "reasoning"],
  exporters: ["export", "sarif", "html", "json", "markdown"],
  extractors: ["extraction", "parser", "binary", "archive"],
  knowledge: ["taxonomy", "cwe", "owasp", "enrichment"],
  logger: ["logging", "structured-logging"],
  pipeline: ["pipeline", "orchestrator", "workflow"],
  plugins: ["plugin", "extension", "sdk"],
  recommendations: ["recommendation", "remediation"],
  renderers: ["renderer", "tui", "html", "visualization"],
  report: ["report", "diff", "aggregation"],
  risk: ["risk", "scoring", "verdict", "decision"],
  rules: ["rules", "conditions", "evaluation"],
  "rules-engine": ["rules-engine", "matching", "scheduling"],
  runners: ["runner", "execution", "ci", "daemon"],
  shared: ["utilities", "collections", "result", "monad"],
  telemetry: ["metrics", "tracing", "opentelemetry"],
};

const packages = fs.readdirSync(path.join(root, "packages")).filter((d) => {
  const pkgPath = path.join(root, "packages", d, "package.json");
  return fs.statSync(path.join(root, "packages", d)).isDirectory() && fs.existsSync(pkgPath);
});

let updated = 0;

for (const pkg of packages) {
  const pkgPath = path.join(root, "packages", pkg, "package.json");
  const raw = fs.readFileSync(pkgPath, "utf-8");
  const json = JSON.parse(raw);

  json.sideEffects = false;

  if (!json.repository) json.repository = repo;
  if (!json.homepage) json.homepage = homepage;
  if (!json.bugs) json.bugs = bugs;
  if (!json.funding) json.funding = funding;

  const extra = packageKeywords[pkg] || [];
  json.keywords = [...new Set([...baseKeywords, ...extra])];

  fs.writeFileSync(pkgPath, JSON.stringify(json, null, 2) + "\n");
  console.log("  ✓ " + pkg);
  updated++;
}

console.log(`\nDone. Updated ${updated} packages.`);
