# Usage

```
veris <command> [options]
```

## Global options

| Option            | Description  |
| ----------------- | ------------ |
| `--help`, `-h`    | Show help    |
| `--version`, `-v` | Show version |

## Commands

### scan

Run analysis on files and directories.

```
veris scan                              Scan current directory
veris scan ./target                     Scan specific directory
veris scan --format json                Output as JSON
veris scan --format html                Output as HTML
veris scan --format json,html           Multiple formats
veris scan --output ./results           Custom output directory
veris scan --progress json              Machine-readable progress output
veris scan --progress silent            Suppress progress output
veris scan --verbose                    Show debug output
veris scan --max-findings 500           Limit findings
```

Output formats: `json`, `markdown`, `html`, `sarif`, `csv`, `junit`

### ci

Run deterministic security gates and CI policy enforcement.

```
veris ci                                Run CI scan on current directory
veris ci ./project                      Run CI scan on specific directory
veris ci --baseline report.json         Compare against previous baseline
veris ci --fail-on high                 Fail on high or critical findings
veris ci --max-risk 7.5                 Fail if aggregate risk exceeds threshold
veris ci --max-new 0                    Fail on any newly introduced findings
veris ci --summary                      Output GitHub step summary
```

### dashboard

Launch visual investigation dashboard or export static HTML report.

```
veris dashboard                         Launch interactive viewer for latest report
veris dashboard ./veris-output/report.json  View specific report
veris dashboard --export report.html    Export self-contained HTML report
veris dashboard --port 3000             Specify viewer server port
veris dashboard --open                  Open browser automatically
```

### rule

Author declarative detection rules with AI assistance.

```
veris rule author                       Start interactive rule authoring
veris rule author "detect eval usage"   Generate candidate from description
veris rule author --promote             Promote candidate directly to plugin
veris rule author --output ./my-rule    Custom output directory
```

### plugins

Manage and inspect local plugins.

```
veris plugins list                      List installed plugins
veris plugins info <id>                 Show detailed plugin information
veris plugins validate [path]           Validate plugin manifest and integrity
veris plugins verify <id>               Verify plugin against ecosystem catalog
veris plugins install <name>            Install plugin from catalog
veris plugins remove <id>               Uninstall a local plugin
```

### pack

Manage knowledge packs.

```
veris pack list                         List all loaded packs
veris pack info <pack>                  Show detailed pack information
veris pack validate [path]              Validate pack file(s)
veris pack verify [path]                Verify pack integrity
veris pack doctor                       Diagnose pack configuration issues
```

### report

Export reports from an existing scan.

```
veris report                            Default report location
veris report ./path/to/report.json      Specific report file
veris report --format html              Export as HTML
veris report --format json,csv          Multiple formats
veris report --output ./out             Custom output directory
veris report --list-formats             List available formats
```

### init

Create a configuration file.

```
veris init                              Create default config
veris init --output ./project           Custom directory
veris init --force                      Overwrite existing
```

Creates `veris.config.json` with recommended defaults.

### validate

Validate configuration or rules files.

```
veris validate                          Validate config
veris validate ./custom-config.json     Specific config file
veris validate rules                    Validate rules
veris validate rules ./my-rules         Specific rules file
```

### explain

Explain a finding, behavioral chain, or risk dimension using AI.

Requires an AI provider (OpenAI, Anthropic, or Ollama).

```
veris explain fin_abc123                Explain a finding
veris explain fin_abc123 --mode simple  Simple explanation
veris explain fin_abc123 --mode expert  Expert explanation
veris explain fin_abc123 --json         JSON output
veris explain chain bc_def456           Explain a chain
veris explain risk D500                 Explain a risk dimension
veris explain fin_abc123 --offline      Force offline mode (Ollama)
veris explain fin_abc123 --provider ollama  Use specific provider
veris explain fin_abc123 --model llama3.1:8b  Use specific model
```

Explanation modes:

| Mode        | Description                                    |
| ----------- | ---------------------------------------------- |
| `simple`    | One paragraph, minimal technical language      |
| `technical` | Detailed with evidence and citations (default) |
| `expert`    | Full traceability chain with source locations  |

### summarize

Summarize a scan report using AI.

```
veris summarize                         Default summary
veris summarize --mode simple           Short summary
veris summarize --mode expert           Detailed summary
veris summarize --json                  JSON output
veris summarize --no-audit              Disable audit logging
veris summarize --offline               Force offline mode
```

### version

Show the installed version.

```
veris version
```

### completion

Generate shell completion scripts.

```
veris completion bash                   Bash completions
veris completion zsh                    Zsh completions
veris completion fish                   Fish completions
```

Setup examples:

```
# Bash
veris completion bash > /etc/bash_completion.d/veris

# Zsh
veris completion zsh > /usr/local/share/zsh/site-functions/_veris

# Fish
veris completion fish > ~/.config/fish/completions/veris.fish
```

## Exit codes

| Code | Meaning                  |
| ---- | ------------------------ |
| 0    | Success                  |
| 1    | General error            |
| 2    | Usage error              |
| 3    | Not found                |
| 4    | Provider unavailable     |
| 5    | Cache error              |
| 10   | Gate violation (CI fail) |
| 11   | Invalid baseline         |
| 12   | Invalid configuration    |
| 13   | Plugin error             |
| 130  | Cancelled (SIGINT)       |

## Examples

```
veris scan
veris scan --format html
veris init && veris scan
veris completion bash > ~/.bash_completion.d/veris
veris --version
```

Run any command with `--help` for detailed options:

```
veris --help
veris scan --help
veris explain --help
```
