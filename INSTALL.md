# Install

## Requirements

- Node.js 18 or later
- npm (included with Node.js) or pnpm

Verify your Node.js version:

```
node --version
```

## Methods

### npx (recommended)

Run VERIS without installing:

```
npx veris-cli
```

Each invocation checks for the latest version automatically. Use it like any
installed command:

```
npx veris-cli scan
npx veris-cli scan ./project
npx veris-cli init
```

### npm global install

Install permanently:

```
npm install -g veris-cli
```

After installation, use `veris` directly:

```
veris scan
```

### pnpm global install

```
pnpm add -g veris-cli
```

Then use `veris` directly:

```
veris scan
```

## Verify

```
veris --version
```

Expected output:

```
veris 0.1.3
```

## Troubleshooting

### Command not found

If `veris` is not found after global install, your npm global bin directory may
not be in your PATH. Try `npx veris-cli` instead.

### Permission errors (macOS / Linux)

Use a Node version manager like `nvm` or `fnm` to avoid permission issues with
global installs.

### Windows

VERIS works on Windows. Use PowerShell, Windows Terminal, or Git Bash.
