# Quickstart

## Step 1: Install

```
npx veris
```

This downloads and runs VERIS. If you see the help text, it worked.

To install permanently:

```
npm install -g veris
```

Then use `veris` without `npx`.

## Step 2: Scan a directory

```
cd my-project
veris scan
```

VERIS discovers files, runs analysis, and produces a report. Output looks like
this:

```
Scanning: /home/user/my-project
  Discovering files...
  Found 142 files
  Classifying artifacts...
  Extracting features...
  Running pipeline (47 evidence items)...
  Building report...
  Wrote /home/user/my-project/veris-output/report.json
  Wrote /home/user/my-project/veris-output/report.md

Scan complete.
  Files scanned:  142
  Features:      1,203
  Evidence:        47
  Findings:        12
  Risk Score:     3.45 / 10.0
  Risk Level:     medium
  Trust Score:    94.2%
  Output:         /home/user/my-project/veris-output/
```

## Step 3: View results

```
cat veris-output/report.md
```

Or generate an HTML report:

```
veris scan --format html
# open veris-output/report.html
```

## Next steps

- `veris scan --help` — View all scan options
- `veris init` — Create a configuration file
- `veris --help` — List all commands

## Requirements

- Node.js 18 or later
- npm (included with Node.js)
