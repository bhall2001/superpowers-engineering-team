#!/usr/bin/env bash
#
# SET (Superpowers Engineering Team) Installer
#
# Installs all marketplaces, plugins, commands, and settings
# needed to run the SET workflow in Claude Code.
#
# Usage:
#   curl -sL <url>/set-install.sh | bash
#   -- or --
#   chmod +x set-install.sh && ./set-install.sh
#
# Prerequisites:
#   - Claude Code CLI installed (https://docs.anthropic.com/en/docs/claude-code)
#   - jq installed (brew install jq / apt install jq)
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
CLAUDE_DIR="$HOME/.claude"
COMMANDS_DIR="$CLAUDE_DIR/commands"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

# Marketplace sources
OFFICIAL_MARKETPLACE_REPO="anthropics/claude-plugins-official"
COMPOUND_TEAMS_URL="https://github.com/tbdng/compound-teams-plugin.git"

# Colors (disable if not a terminal)
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  RED='\033[0;31m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  GREEN='' YELLOW='' RED='' BOLD='' NC=''
fi

info()  { echo -e "${GREEN}[SET]${NC} $1"; }
warn()  { echo -e "${YELLOW}[SET]${NC} $1"; }
error() { echo -e "${RED}[SET]${NC} $1"; }
bold()  { echo -e "${BOLD}$1${NC}"; }

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
bold "============================================"
bold "  SET — Superpowers Engineering Team"
bold "  Installer"
bold "============================================"
echo ""

# Check for Claude Code
if ! command -v claude &> /dev/null; then
  error "Claude Code CLI not found."
  error "Install it first: https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi
info "Claude Code CLI found: $(which claude)"

# Check for jq
if ! command -v jq &> /dev/null; then
  error "jq not found. Install it first:"
  error "  macOS:  brew install jq"
  error "  Linux:  sudo apt install jq"
  exit 1
fi
info "jq found: $(which jq)"

# Ensure .claude directory exists
mkdir -p "$CLAUDE_DIR"
mkdir -p "$COMMANDS_DIR"

# ---------------------------------------------------------------------------
# Step 1: Register marketplaces in settings.json
# ---------------------------------------------------------------------------
bold ""
bold "Step 1: Registering marketplaces"
bold "--------------------------------"

if [ ! -f "$SETTINGS_FILE" ]; then
  info "Creating $SETTINGS_FILE"
  echo '{}' > "$SETTINGS_FILE"
fi

# Add extraKnownMarketplaces entries
add_marketplace() {
  local name="$1"
  local source_type="$2"
  local source_value="$3"

  if jq -e ".extraKnownMarketplaces.\"$name\"" "$SETTINGS_FILE" &>/dev/null; then
    info "Marketplace '$name' already registered"
  else
    if [ "$source_type" = "github" ]; then
      jq --arg name "$name" --arg repo "$source_value" \
        '.extraKnownMarketplaces[$name] = {"source": {"source": "github", "repo": $repo}}' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    else
      jq --arg name "$name" --arg url "$source_value" \
        '.extraKnownMarketplaces[$name] = {"source": {"source": "git", "url": $url}}' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    fi
    info "Registered marketplace: $name"
  fi
}

add_marketplace "claude-plugins-official" "github" "$OFFICIAL_MARKETPLACE_REPO"
add_marketplace "compound-teams-marketplace" "git" "$COMPOUND_TEAMS_URL"

# ---------------------------------------------------------------------------
# Step 2: Enable Agent Teams
# ---------------------------------------------------------------------------
bold ""
bold "Step 2: Enabling Agent Teams"
bold "----------------------------"

if jq -e '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' "$SETTINGS_FILE" &>/dev/null; then
  info "Agent Teams already enabled"
else
  jq '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"' \
    "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  info "Agent Teams enabled"
fi

# ---------------------------------------------------------------------------
# Step 3: Install plugins via Claude Code CLI
# ---------------------------------------------------------------------------
bold ""
bold "Step 3: Installing plugins"
bold "--------------------------"

info "Installing Superpowers plugin..."
claude plugin install superpowers@claude-plugins-official 2>/dev/null || warn "Superpowers may already be installed or requires manual install"

info "Installing Compound Teams plugin..."
claude plugin install compound-teams@compound-teams-marketplace 2>/dev/null || warn "Compound Teams may already be installed or requires manual install"

# ---------------------------------------------------------------------------
# Step 4: Install SET commands
# ---------------------------------------------------------------------------
bold ""
bold "Step 4: Installing SET commands"
bold "-------------------------------"

# --- /set-init ---
cat > "$COMMANDS_DIR/set-init.md" << 'SETEOF'
---
description: "Initialize a project for the SET workflow. Detects stack, scaffolds agents, augments CLAUDE.md, creates directories. Run once per project before /set-design."
---

# SET Init — Project Initialization

You are the setup assistant for the Superpowers Engineering Team (SET) workflow. Initialize this project so that `/set-design → /set-plan → /set-build → /set-review → /set-learn` works out of the box.

**Safety first:** NEVER overwrite existing files. Only append or create new. ALWAYS show changes to the user before writing. Get confirmation before each major step.

## Step 1: Check Prerequisites

Verify both required plugins are installed:

```bash
# Check for Superpowers
ls ~/.claude/plugins/cache/*/superpowers/ 2>/dev/null && echo "Superpowers: installed" || echo "Superpowers: NOT FOUND"

# Check for Compound Teams
ls ~/.claude/plugins/cache/*/compound-teams/ 2>/dev/null && echo "Compound Teams: installed" || echo "Compound Teams: NOT FOUND"
```

If either is missing, tell the user how to install it and stop.

## Step 2: Audit Current State

Before changing anything, understand what exists:

```bash
echo "=== CLAUDE.md ==="
ls -la CLAUDE.md .claude/CLAUDE.md 2>/dev/null || echo "No CLAUDE.md found"

echo "=== Settings ==="
cat .claude/settings.json 2>/dev/null || echo "No settings.json"

echo "=== Existing commands ==="
ls .claude/commands/ 2>/dev/null || echo "No commands directory"

echo "=== Existing agents ==="
ls .claude/agents/ 2>/dev/null || echo "No agents directory"

echo "=== Plans directory ==="
ls .claude/plans/ 2>/dev/null || echo "No plans directory"

echo "=== Superpowers specs ==="
ls docs/superpowers/specs/ 2>/dev/null || echo "No specs directory"

echo "=== Git status ==="
git status --short 2>/dev/null | head -5 || echo "Not a git repo"
```

**Report findings to the user before proceeding.**

## Step 3: Enable Agent Teams

Check `.claude/settings.json`:
- If it **doesn't exist**: create it with `{ "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }`
- If it **exists but lacks the flag**: add the flag, preserving all other settings
- If it **already has the flag**: skip, tell user it's already enabled

**Show the user the change before writing.**

## Step 4: Detect Project Stack

```bash
echo "=== Language ==="
ls *.py pyproject.toml setup.py 2>/dev/null && echo "Python detected"
ls package.json tsconfig.json 2>/dev/null && echo "JavaScript/TypeScript detected"
ls go.mod 2>/dev/null && echo "Go detected"
ls Cargo.toml 2>/dev/null && echo "Rust detected"

echo "=== Package manager ==="
ls pnpm-lock.yaml yarn.lock bun.lock package-lock.json 2>/dev/null

echo "=== Framework ==="
cat package.json 2>/dev/null | grep -E '"(next|react|vue|svelte|astro|express|fastify|hono|tanstack)"' | head -5
cat pyproject.toml 2>/dev/null | head -20

echo "=== Test runner ==="
ls jest.config* vitest.config* playwright.config* cypress.config* pytest.ini conftest.py 2>/dev/null
cat package.json 2>/dev/null | grep -E '"test"' | head -1

echo "=== Linter ==="
ls .eslintrc* eslint.config* biome.json .ruff.toml ruff.toml 2>/dev/null

echo "=== Type checker ==="
ls tsconfig.json mypy.ini 2>/dev/null

echo "=== Database ==="
ls drizzle.config* prisma/schema.prisma alembic.ini 2>/dev/null
grep -rl "drizzle\|prisma\|sqlalchemy\|typeorm\|sequelize" src/db/ src/lib/db/ 2>/dev/null | head -3

echo "=== API layer ==="
ls src/routes/ src/api/ app/api/ pages/api/ 2>/dev/null | head -5

echo "=== CI ==="
ls .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null | head -3
```

Report: "I detected [languages], [framework], [test runner], [linter], [type checker], [database], [API layer]."

Record these detections — they drive agent scaffolding in Step 6 and build commands in Step 5.

## Step 5: Augment CLAUDE.md

**NEVER overwrite existing CLAUDE.md.** Check if SET sections already exist.

If CLAUDE.md doesn't exist, create a minimal one. If it exists, **append only the missing sections**.

```markdown

---

## SET Workflow

This project uses the Superpowers Engineering Team workflow:
`/set-design` → `/set-plan` → `/set-build` → `/set-review` → `/set-learn`

### Ralph Loop (All Teammates Follow This)
1. Write failing tests first (TDD red phase)
2. Implement minimal code to pass (TDD green phase)
3. Refactor while keeping tests green
4. Run tests — if fail: read error, fix, retry (max 5 attempts per error)
5. Run linter/type checker — if fail: fix and retry
6. Self-review against acceptance criteria
7. Only mark task complete when ALL checks pass
8. If stuck after 3 retries on same error, message team lead with blocker

### Build Commands
- Tests: `[DETECTED_TEST_COMMAND]`
- Lint: `[DETECTED_LINT_COMMAND]`
- Type check: `[DETECTED_TYPECHECK_COMMAND]`
- Format: `[DETECTED_FORMAT_COMMAND]`
- Dev server: `[DETECTED_DEV_COMMAND]`

### Domain Specialists
<!-- Agents in .claude/agents/ — SET routes tasks to the right specialist -->
- [List agents created in Step 6]

<!-- Dated, accumulating learnings live in .claude/set/learnings.md (not here). Keeps CLAUDE.md small and fast to load. Every SET command reads the learnings file explicitly. -->
```

Replace `[DETECTED_*]` placeholders with actual commands from Step 4.

**Show the user exactly what will be appended. Get confirmation before writing.**

## Step 6: Scaffold Domain Specialist Agents

This is SET's key differentiator over Compound Teams. The plan phase tags tasks with specialists, and the build phase routes tasks to the right agent. But this only works if `.claude/agents/` has agent definitions.

### 6a: Check for existing agents

```bash
ls .claude/agents/ 2>/dev/null
```

If agents already exist, read each one and report what domains are covered. Identify gaps based on the stack detected in Step 4.

### 6b: Determine which specialists to scaffold

Based on the detected stack, propose agents from this menu:

| Detected | Agent to scaffold | Covers |
|---|---|---|
| Database (Drizzle, Prisma, SQLAlchemy, etc.) | `db-specialist.md` | Schema, migrations, queries, ORM patterns |
| React/Vue/Svelte/frontend framework | `ui-specialist.md` | Components, state management, styling, accessibility |
| API routes / Express / FastAPI | `api-specialist.md` | Endpoints, validation, error handling, auth |
| Test runner detected | `qa-specialist.md` | Test strategy, edge cases, integration tests, spec compliance |
| TypeScript or Python with types | `architect.md` | Type design, module boundaries, dependency direction |

Only propose agents for domains actually present in the project. Do NOT scaffold agents for domains that don't exist.

### 6c: Write agent files

For each proposed agent, create a starter file in `.claude/agents/`. Each agent file follows this structure:

```markdown
# {Name} — {Domain} Specialist

You are a {domain} specialist on a SET Agent Team. You have deep expertise in {specific technologies detected}.

## Model

sonnet

## Domain Knowledge

- {Project-specific patterns from CLAUDE.md}
- {Key files and directories for this domain}
- {Conventions to follow}

## Key Files
- {List specific files/directories this specialist should know about}

## Conventions
- {Domain-specific conventions from CLAUDE.md or detected patterns}
```

**Important:**
- Read CLAUDE.md, `.claude/set/learnings.md` (if it exists), and the actual codebase to populate domain knowledge, key files, and conventions with real project-specific information — NOT generic placeholders.
- If an agent for this domain already exists, do NOT overwrite it. Report that it's already covered.
- Show the user each agent file before writing. Get confirmation.

### 6d: Suggest the user customize

After scaffolding, tell the user: "These are starter agents based on your detected stack. Review and customize them — the more project-specific knowledge you add, the better SET routes tasks and the higher quality the output."

## Step 7: Create Directory Structure and Learnings File

```bash
mkdir -p .claude/plans/archive
mkdir -p .claude/set
mkdir -p .claude/set/learnings-archive
mkdir -p docs/superpowers/specs
```

Create `.claude/set/learnings.md` if it does not already exist (NEVER overwrite):

```markdown
# SET Learned Patterns

Dated, actionable learnings accumulated across SET cycles. Read by `/set-plan`, `/set-build`, and `/set-review` so each cycle benefits from prior cycles. Grows via `/set-learn`.

## What Works

## What Failed

## Recurring Bugs
```

## Step 8: Summary

```
SET initialized!

Pipeline: /set-design → /set-plan → /set-build → /set-review → /set-learn

Stack detected:
  Languages:    [detected]
  Framework:    [detected]
  Test runner:  [detected]
  Linter:       [detected]
  Type checker: [detected]

Agent Teams: enabled
Domain specialists scaffolded:
  .claude/agents/db-specialist.md       — [if created]
  .claude/agents/ui-specialist.md       — [if created]
  .claude/agents/api-specialist.md      — [if created]
  .claude/agents/qa-specialist.md       — [if created]
  .claude/agents/architect.md           — [if created]

Directories created:
  .claude/plans/                  — Implementation plans
  .claude/plans/archive/          — Completed plans
  .claude/set/                    — SET state (learnings, future compaction)
  .claude/set/learnings-archive/  — Archived/compacted learnings
  docs/superpowers/specs/         — Design specifications

Files created:
  .claude/set/learnings.md        — Accumulated dated learnings (read by /set-plan, /set-build, /set-review)

CLAUDE.md augmented with:
  - SET pipeline reference
  - Ralph Loop (TDD variant)
  - Build commands
  - Domain specialists list

Next step: /set-design <your feature idea>
```

## Safety Rules
- NEVER overwrite existing files — only append or create new
- ALWAYS show changes to user before writing
- PRESERVE all existing CLAUDE.md content
- If a conflict is found, present both versions and let user choose
- Agent files are starters — encourage the user to customize them
SETEOF
info "Installed /set-init"

# --- /set-design ---
cat > "$COMMANDS_DIR/set-design.md" << 'SETEOF'
---
description: "Brainstorm and design a feature using Superpowers' collaborative design process. First step of the SET workflow: /set-design → /set-plan → /set-build → /set-review → /set-learn"
---

# SET Design — Superpowers Brainstorming + Design

You are running the **design** phase of the Superpowers Engineering Team (SET) workflow.

This phase uses Superpowers' brainstorming skill to produce a validated design spec before any planning or coding begins.

## Process

1. **Invoke the Superpowers brainstorming skill** — follow it exactly:
   - Explore project context
   - Ask clarifying questions (one at a time)
   - Propose 2-3 approaches with trade-offs
   - Present design in sections, get approval after each
   - Write design doc to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
   - Run spec review loop (dispatch reviewer subagent, fix issues, repeat until approved)
   - User reviews written spec

2. **STOP before invoking writing-plans.** Unlike the standard Superpowers flow, do NOT automatically transition to writing-plans.

3. Instead, tell the user:

> "Design complete and saved to `<path>`. Ready to plan the implementation? Run `/set-plan <feature-name>` to create a parallel-execution plan for the Agent Team."

## Key Difference from Standard Superpowers

Standard Superpowers transitions directly to `writing-plans` → `subagent-driven-development` (sequential execution). SET instead transitions to `/set-plan` which creates a plan optimized for Compound Teams' parallel Agent Team execution.

## Input

User provides the feature idea via: `/set-design $ARGUMENTS`

If `$ARGUMENTS` is empty, ask: "What would you like to build?"
SETEOF
info "Installed /set-design"

# --- /set-plan ---
cat > "$COMMANDS_DIR/set-plan.md" << 'SETEOF'
---
description: "Create a parallel-execution plan from a Superpowers design spec. Reformats for Agent Team builders with self-review loops. Second step: /set-design → /set-plan → /set-build → /set-review → /set-learn"
---

# SET Plan — Bridge Superpowers Design to Agent Team Plan

You are running the **planning** phase of the Superpowers Engineering Team (SET) workflow.

Take a Superpowers design spec and produce a plan optimized for Compound Teams' parallel Agent Team execution.

## Input

User provides: `/set-plan $ARGUMENTS`

`$ARGUMENTS` is either:
- A feature name matching an existing design spec in `docs/superpowers/specs/`
- A path to a design spec file
- Empty — search `docs/superpowers/specs/` for the most recent spec and confirm with user

## Process

### 1. Load the Design Spec

Read the Superpowers design spec. If none exists, tell the user to run `/set-design` first.

### 2. Research the Codebase

- Read CLAUDE.md for conventions and build commands
- Read `.claude/set/learnings.md` (if it exists) for accumulated "What Works", "What Failed", and "Recurring Bugs" — factor these into task decomposition and approach choice
- Explore directory structure and find related code
- Identify utilities, patterns, and abstractions to reuse
- Check git log for recent changes in relevant areas
- **Scan `.claude/agents/`** for project-defined specialist agents. Read each to understand what domains are covered (e.g., DB, UI, API/sync, QA, architecture). You'll tag each task with the best-fit specialist.

### 3. Write the Plan

Save to `.claude/plans/{feature-name}.md`:

```markdown
# Plan: {Feature Name}

> **Execution:** Use `/set-build` to execute this plan with an Agent Team.
> **Design spec:** `docs/superpowers/specs/{spec-file}.md`

## Goal
One sentence describing success.

## Context
What exists today. Reference specific files and modules.

## Approach
High-level strategy. Why this over alternatives.

## Tasks

### Task 1: {name}
- **Specialist**: {agent name from `.claude/agents/` or "generic" if none fits}
- **What**: Clear deliverable
- **Files**: Specific paths to create/modify
- **Tests**: What tests to write and exact commands to run them
- **Blocked by**: Other task numbers (if any)
- **Done when**: Acceptance criteria — specific, verifiable conditions

#### TDD Steps
1. Write failing test(s) for [specific behavior]
2. Run tests — verify they fail with expected error
3. Implement minimal code to pass
4. Run tests — verify green
5. Refactor if needed, verify still green

#### Self-Review Checklist
- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md and `.claude/set/learnings.md`
- [ ] No hardcoded values, missing validation, or security issues

### Task 2: {name}
...
```

### Plan Design Principles

**Task granularity:** Each task = 10-30 minutes of work for one builder. Big enough to be a coherent unit. Small enough that a builder can hold it in context.

**Parallelism:** Tasks that touch different files and have no data dependencies should NOT have `Blocked by` entries. Maximize the number of tasks that can run in parallel.

**TDD steps in every task:** Each task includes a TDD cycle. The builder writes the failing test FIRST, then implements. This is enforced in the builder prompt during `/set-build`.

**Self-review checklist in every task:** Each task includes the checklist. Builders must check every box before marking complete. This catches spec drift before QA.

**Specialist assignment:** Every task gets a `Specialist` field. If `.claude/agents/` has a matching specialist (e.g., a DB agent for schema tasks, a UI agent for component tasks), use that agent's name. If no specialist fits, use "generic". During `/set-build`, the team lead uses these tags to spawn the right specialist agents and route tasks to them.

**Exact commands:** Include exact test/lint/typecheck commands, expected outputs, and file paths. Builders should never have to guess.

### 4. Review the Plan

After writing, review critically:
- Can tasks actually run in parallel as marked?
- Are acceptance criteria specific enough to verify?
- Do TDD steps make sense for each task?
- Any missing tasks?

### 5. Present for Approval

Show the plan. Wait for user to approve, modify, or reject.

After approval:

> "Plan saved to `.claude/plans/{feature-name}.md`. Ready to build? Run `/set-build {feature-name}` to spawn the Agent Team."

## Unresolved Questions

At the end of the plan, list any unresolved questions — things the design spec left ambiguous that builders will need answers to. Keep concise.
SETEOF
info "Installed /set-plan"

# --- /set-build ---
cat > "$COMMANDS_DIR/set-build.md" << 'SETEOF'
---
description: "Execute a SET plan with Agent Teams. Enhanced builders with TDD + self-review. Enhanced QA with spec compliance + code quality. Third step: /set-design → /set-plan → /set-build → /set-review → /set-learn"
---

# SET Build — Agent Team Execution with Enhanced Quality Gates

You are the team lead. Execute a plan using Compound Teams' Agent Team infrastructure with enhanced builder and QA prompts that incorporate Superpowers' quality discipline.

## Before Starting

1. Look for a plan in `.claude/plans/`. If none exists, tell the user to run `/set-plan` first.
2. Read the plan thoroughly. Also read the linked design spec if referenced.
3. Read CLAUDE.md — especially Build Commands and conventions. Also read `.claude/set/learnings.md` if it exists — accumulated patterns from prior cycles.
4. **Scan for project agents** in `.claude/agents/`. Read each agent file to understand what domain it specializes in (e.g., database, UI, API/sync, QA, architecture). You'll use these to assign the right specialist to each task.
5. Switch to **delegate mode** (Shift+Tab). You coordinate. You do NOT write code.

## Resolve Worktree Mode

Determine whether to create an isolated git worktree for this run. Precedence (first match wins):

1. **CLI flag in `$ARGUMENTS`** — `--no-worktree` disables; `--worktree` forces enable. CLI always overrides CLAUDE.md.
2. **CLAUDE.md setting** — a line matching `SET: no-worktree` (case-insensitive) disables worktrees for this project.
3. **Default** — worktrees enabled.

If **disabled**: skip Step 1 entirely. Still run 1d (project setup) and 1e (baseline tests) from the current working tree on the CURRENT branch. Do NOT create a new branch, do NOT `cd` anywhere. Report: `Worktree mode: DISABLED — building on current branch {branch-name}`. Then proceed to Step 2.

If **enabled**: proceed with Step 1 as written.

## Step 1: Create Isolated Worktree

Before spawning the team, create an isolated workspace so all build work happens on a dedicated branch without affecting the current working tree.

### 1a: Select worktree directory

Follow this priority:
1. If `.worktrees/` exists → use it
2. If `worktrees/` exists → use it
3. If CLAUDE.md specifies a worktree directory → use it
4. Otherwise → ask the user

### 1b: Verify directory is git-ignored (project-local only)

```bash
git check-ignore -q .worktrees 2>/dev/null
```

If NOT ignored: add to `.gitignore` and commit before proceeding.

### 1c: Create worktree

```bash
git worktree add {worktree-dir}/{feature-name} -b feat/{feature-name}
cd {worktree-dir}/{feature-name}
```

### 1d: Run project setup

Auto-detect and run:
```bash
# Node.js
if [ -f package.json ]; then npm install || pnpm install || yarn install; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install || uv sync; fi

# Go
if [ -f go.mod ]; then go mod download; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi
```

Use the package manager specified in CLAUDE.md if one is documented.

### 1e: Verify clean baseline

Run the test suite from CLAUDE.md "Build Commands":

```bash
# Run tests — must pass before any implementation begins
```

- **If tests pass**: report ready, proceed to Step 2
- **If tests fail**: report failures, ask the user whether to proceed or investigate

### 1f: Report

```
Worktree ready at {full-path}
Branch: feat/{feature-name}
Tests passing ({N} tests, 0 failures)
Ready to spawn team.
```

## Step 2: Create the Team

```
Teammate({ operation: "spawnTeam", team_name: "{feature-name}" })
```

## Step 3: Create Tasks from the Plan

For each task in the plan:

```
TaskCreate({
  subject: "{task name from plan}",
  description: "{full task description INCLUDING the TDD Steps and Self-Review Checklist from the plan}",
  activeForm: "{what in-progress looks like}",
  blockedBy: ["{task IDs this depends on}"]
})
```

**Critical:** Include the TDD steps and self-review checklist in every task description. Builders need these in context.

## Step 4: Spawn Teammates

### Using Project Agents

If `.claude/agents/` contains specialist agent definitions, use them instead of generic builders. Match tasks to specialists by domain:

**Task-to-agent matching:**
Each task in the plan has a `Specialist` field (set during `/set-plan`). Use it to route tasks:
- If the plan says `Specialist: odm-db-drizzle` → spawn that agent as a builder
- If the plan says `Specialist: odm-react-ui` → spawn that agent as a builder
- If the plan says `Specialist: generic` → use a generic builder
- If `.claude/agents/` has a QA agent → use it for the QA role (augmented with the Enhanced QA prompt below)

If no `Specialist` field exists in the plan (e.g., it was created with `/compound-teams:plan` instead of `/set-plan`), fall back to matching by inspecting each task's files and description against the agent definitions you read in step 4.

**How to use project agents:**
When spawning a teammate, reference the agent file so the teammate inherits its domain knowledge:

```
Read .claude/agents/{agent-name}.md and use it as the base context for this teammate.
Append the Enhanced Builder Workflow below to the agent's instructions.
```

**If a task spans multiple domains** (e.g., new API route + UI component), assign it to the specialist for the primary domain, and note in the task description which conventions from the other domain apply.

**If no project agents exist**, fall back to generic builders as below.

### Team Scaling

- **2-3 tasks**: 1 builder (or specialist) + 1 QA
- **4-6 tasks**: 2 builders/specialists + 1 QA
- **7+ tasks**: 3 builders/specialists + 1 QA

When using specialists, prefer spawning distinct specialists over multiple generic builders. For example, if you have 4 tasks (2 DB, 1 UI, 1 API), spawn: DB specialist, UI specialist, API specialist, QA — rather than 3 generic builders + QA.

### Enhanced Builder Prompt:

Append this workflow to every builder/specialist, whether they come from a project agent file or are generic:

```
You are a builder on team "{feature-name}".

WORKFLOW — TDD RALPH LOOP:
1. Run TaskList() — find a pending, unblocked task with no owner
2. Claim it: TaskUpdate({ taskId, owner: "$CLAUDE_CODE_AGENT_NAME" })
3. Start it: TaskUpdate({ taskId, status: "in_progress" })
4. Read CLAUDE.md for conventions. Read `.claude/set/learnings.md` (if present) for accumulated patterns — prior "What Works", "What Failed", and "Recurring Bugs". Apply what's relevant before coding.

5. WRITE FAILING TESTS FIRST (TDD Red Phase):
   - Follow the "TDD Steps" section in the task description
   - Write the test(s) specified in the task
   - Run them — they MUST fail. If they pass, your test isn't testing new behavior
   - If no TDD steps in the task, write tests for the acceptance criteria before coding

6. IMPLEMENT (TDD Green Phase):
   - Write the minimal code to make the failing tests pass
   - Run tests — if FAIL: read error, fix code, rerun (max 5 retries per unique error)
   - If stuck after 3 retries on SAME error: message team lead with error + what you tried

7. REFACTOR (TDD Refactor Phase):
   - Clean up implementation while keeping tests green
   - Run tests after any refactor to verify

8. Run lint command from CLAUDE.md "Build Commands" — fix issues, rerun until clean
9. Run typecheck command from CLAUDE.md "Build Commands" — fix issues, rerun until clean

10. SELF-REVIEW (before marking complete):
    Read the task description's acceptance criteria and self-review checklist. Check EVERY item:
    - Did I implement exactly what was specified? Nothing missing?
    - Did I add anything beyond what was specified? Remove it if so.
    - Do my tests cover the happy path AND at least one edge case?
    - Does my code follow the project conventions from CLAUDE.md and accumulated patterns in `.claude/set/learnings.md`?
    - Any hardcoded values, missing validation, or security issues?

    If ANY check fails: fix it, rerun tests, re-check.

11. ALL GREEN + SELF-REVIEW PASSED → commit with a descriptive message
12. TaskUpdate({ taskId, status: "completed" })
13. Go back to step 1 for the next task
14. No tasks left → message team lead: "All my tasks are done"

RULES:
- NEVER skip writing failing tests first — TDD is mandatory
- NEVER mark a task complete if any check fails
- NEVER mark a task complete if self-review has unchecked items
- If you need to modify a file another teammate is working on, message them FIRST
- Each commit should be atomic — one task, one commit
- If the acceptance criteria are ambiguous, message team lead BEFORE implementing
```

### Enhanced QA Prompt (Two-Stage Review):

```
You are QA on team "{feature-name}".

You perform TWO review stages on each completed task — spec compliance first, then code quality. Both must pass.

READ FIRST (once, at start of shift):
- CLAUDE.md — conventions and build commands
- `.claude/set/learnings.md` (if it exists) — accumulated patterns and recurring bugs to check for

WORKFLOW:
1. Monitor TaskList() — wait for builder tasks to reach "completed"
2. For each completed task:

   --- STAGE 1: SPEC COMPLIANCE ---
   a. Read the task description, especially "Done when" acceptance criteria
   b. Read the actual code the builder wrote (git diff for that task's commit)
   c. Verify line by line:
      - Did they implement EVERYTHING in the acceptance criteria? List each criterion and check it.
      - Did they add features NOT in the acceptance criteria? Flag for removal.
      - Did they misinterpret any requirement?
   d. DO NOT trust the builder's self-review. Verify independently.
   e. If spec issues found:
      - Create a fix task: TaskCreate({ subject: "Spec fix: {issue}", description: "..." })
      - Message the builder with specifics: what's missing, what's extra, what's wrong
      - DO NOT proceed to Stage 2 until spec issues are fixed

   --- STAGE 2: CODE QUALITY ---
   (Only after Stage 1 passes)
   f. Run the FULL test suite — not just the builder's new tests
   g. Review code quality:
      - Test quality: do tests actually verify behavior, or are they trivial/tautological?
      - Edge cases: null inputs, empty states, boundary values, error paths
      - Architecture: does the code follow project patterns from CLAUDE.md and `.claude/set/learnings.md`?
      - Security: injection, XSS, hardcoded secrets, missing validation
      - DRY: any duplicated logic that should use existing utilities?
   h. If quality issues found:
      - Create a fix task: TaskCreate({ subject: "Quality fix: {issue}", description: "..." })
      - Message the builder with specifics
   i. If BOTH stages pass: message team lead confirming task passed QA

3. When ALL tasks pass both QA stages:
   a. Run full test suite one more time
   b. Check for regressions across tasks (do builder changes conflict?)
   c. Message team lead with final QA report

RULES:
- NEVER approve Stage 1 if any acceptance criterion is unmet
- NEVER skip Stage 2 — quality matters even if spec is met
- Be adversarial — try to break things
- Run the actual test/lint/typecheck commands from CLAUDE.md
- If a builder pushes back on a finding, escalate to team lead — don't back down
```

## Step 5: Monitor and Coordinate

While teammates work:
- Check your inbox regularly for messages
- If a teammate is blocked: suggest approaches (not code)
- If two teammates need the same file: coordinate who goes first
- If a teammate reports being stuck (3 retries same error): analyze and provide guidance
- Track overall progress via TaskList()
- If QA flags spec compliance issues: verify they're real before creating fix tasks

## Step 6: Wrap Up

When all tasks are complete AND QA confirms both stages passed:

1. Request shutdown for each teammate:
   ```
   Teammate({ operation: "requestShutdown", target_agent_id: "{name}" })
   ```
2. Wait for acknowledgments
3. Clean up: `Teammate({ operation: "cleanup" })`
4. Run the full test suite yourself one final time
5. Report results to user. If a worktree was created, include its location; otherwise include the current branch name.
6. Suggest: "Run `/set-review` for a final holistic review, then `/set-learn` to capture learnings"

**Note:** If a worktree was created, do NOT remove it at this point. `/set-review` will examine the changes in it, and `/set-review`'s finishing step will offer the user options (merge, PR, keep, or discard) which handles worktree cleanup. In no-worktree mode, `/set-review` operates against the build branch directly and the finishing options apply to that branch.

## Emergency: Cost Control

If a teammate loops without progress (same error 5+ consecutive times):
1. Message them to stop
2. Request shutdown
3. Report the blocker to the user — may need human intervention
SETEOF
info "Installed /set-build"

# --- /set-review ---
cat > "$COMMANDS_DIR/set-review.md" << 'SETEOF'
---
description: "Final holistic review combining Compound Teams multi-perspective review with Superpowers spec compliance. Fourth step: /set-design → /set-plan → /set-build → /set-review → /set-learn"
---

# SET Review — Multi-Perspective + Spec Compliance Review

Final review of all changes from the build phase. Combines Compound Teams' multi-perspective review with Superpowers' spec compliance discipline.

## What to Review

If the user provides a branch/PR/commit range with `$ARGUMENTS`, use that.
Otherwise, review changes from the most recent build: `git diff main...HEAD`

## Step 1: Gather Context

```bash
git diff main...HEAD --stat
git log --oneline main..HEAD
```

Read the diff. Also read:
- The design spec from `docs/superpowers/specs/` (if one exists for this feature)
- The plan from `.claude/plans/` (if one exists)

## Step 2: Spawn Review Team

```
Teammate({ operation: "spawnTeam", team_name: "review-{feature}" })
```

Create 4 tasks (one per reviewer lens) and spawn 4 teammates:

### Spec Compliance Reviewer Prompt:

```
Review the git diff (main...HEAD) against the design spec and implementation plan.

READ FIRST:
- Design spec: {path to spec in docs/superpowers/specs/}
- Implementation plan: {path to plan in .claude/plans/}
- `.claude/set/learnings.md` (if it exists) — prior patterns and failures that may indicate risk areas

VERIFY:
- Every requirement in the design spec has been implemented
- No features were added that aren't in the spec
- The implementation matches the approach described in the plan
- Acceptance criteria from each plan task are met

DO NOT trust commit messages or comments — read the actual code.

Report:
- ✅ Spec compliant: all requirements met, nothing extra
- ❌ Issues: [list specifically what's missing, extra, or misinterpreted — with file:line refs]

Message team-lead with findings.
```

### Security Reviewer Prompt:

```
Review the git diff (main...HEAD) for security issues.

READ FIRST: `.claude/set/learnings.md` if it exists — check "Recurring Bugs" for any security-related patterns previously documented.

CHECK: SQL injection, XSS, CSRF, hardcoded secrets/keys, missing input validation, insecure auth patterns, sensitive data in logs/errors, missing rate limiting, unsafe deserialization, path traversal.

Message team-lead with findings: file, line, severity (critical/high/medium/low), suggested fix.
If nothing found, confirm the changes look secure.
```

### Architecture Reviewer Prompt:

```
Review the git diff (main...HEAD) for architectural quality. Read CLAUDE.md first for project conventions, and `.claude/set/learnings.md` (if it exists) for accumulated "What Works" / "What Failed" patterns.

CHECK: Pattern consistency, separation of concerns, SOLID violations, DRY without over-abstraction, dependency direction, testability, performance at scale, error handling consistency.

Message team-lead with findings: file, concern, suggestion.
Also note things done WELL — good patterns worth documenting.
```

### Correctness Reviewer Prompt:

```
Review the git diff (main...HEAD) for correctness. Also run the test suite.

READ FIRST: `.claude/set/learnings.md` if it exists — "Recurring Bugs" lists prior error patterns worth verifying against.

CHECK: Test quality (not coverage theater), edge cases (null/empty/boundary), helpful error messages, type consistency across API boundaries, race conditions, resource cleanup (connections closed, listeners removed).

Message team-lead with findings.
```

## Step 3: Synthesize

Collect all findings. Present unified review:

```markdown
## SET Review Summary

### Spec Compliance
- {findings from spec reviewer}

### Critical (must fix before merge)
- ...

### Improvements (should fix)
- ...

### Suggestions (nice to have)
- ...

### Good Patterns (add to `.claude/set/learnings.md` via /set-learn)
- ...
```

## Step 4: Clean Up

Shut down all reviewers. Clean up the team.

If critical or "should fix" issues exist:
- Suggest: "Run `/set-build {feature}` again to fix these issues" (for large fixes)
- Or: "These are small enough to fix directly — want me to handle them?" (for minor fixes)

If all clean:
- Suggest: "Run `/set-learn` to capture learnings from this cycle"

## Step 5: Finishing

If the review is clean and user is ready to integrate:
- Present the 4 options from Superpowers' finishing-a-development-branch:
  1. Merge back to base branch locally
  2. Push and create a Pull Request
  3. Keep the branch as-is
  4. Discard this work

Execute the user's choice.
SETEOF
info "Installed /set-review"

# --- /set-learn ---
cat > "$COMMANDS_DIR/set-learn.md" << 'SETEOF'
---
description: "Extract learnings from the most recent SET cycle and update CLAUDE.md. The self-improving learning loop — each cycle makes the next one smarter. Final step: /set-design → /set-plan → /set-build → /set-review → /set-learn"
---

# SET Learn — Extract, Learn, Improve

You are running the **learn** phase of the Superpowers Engineering Team (SET) workflow.

This is the most important phase. Everything else in SET produces code — this phase produces knowledge. Without it, every session starts from zero. With it, SET compounds: each cycle makes the next one faster, more accurate, and better aligned with the project's conventions.

## Input

User provides: `/set-learn $ARGUMENTS`

`$ARGUMENTS` is optional — a feature name or context hint. If empty, analyze the most recent build/review cycle.

## Process

### 1. Gather Context

```bash
# Recent commits from this cycle
git log --oneline -20

# Design spec used
ls docs/superpowers/specs/*.md 2>/dev/null | tail -5

# Plan used
ls .claude/plans/*.md 2>/dev/null

# Current CLAUDE.md
cat CLAUDE.md
```

Also read:
- The design spec (if one exists for this cycle)
- The plan (if one exists)
- Any review findings from `/set-review`

### 2. Analyze the Cycle

Examine the full arc — design through review — not just the final code. Look for learnings in each category:

**What worked — patterns to reinforce:**
- Code patterns that solved problems cleanly
- Libraries or approaches that proved effective
- Task decomposition that enabled good parallelism
- Spec decisions that made implementation straightforward
- Agent coordination patterns that reduced conflicts

**What failed — patterns to avoid:**
- Approaches tried and abandoned (and WHY they failed)
- Libraries that didn't work as expected
- Wrong assumptions in the design or plan
- Task boundaries that caused coordination problems
- Spec ambiguities that led to rework

**Recurring bugs — patterns to prevent:**
- Errors that appeared repeatedly during Ralph loops
- Common mistakes builders made
- Things the linter/type checker caught repeatedly
- QA findings that could have been caught earlier

**Process insights — improvements to SET itself:**
- Was the plan's task granularity right? Too big? Too small?
- Did specialist routing work? Were tasks assigned to the right agents?
- Did the TDD steps in the plan lead to good tests?
- Were the acceptance criteria specific enough for QA to verify?
- Did the review phase catch things that should have been caught earlier?

### 3. Update `.claude/set/learnings.md` — Learned Patterns

Project-level dated learnings live in `.claude/set/learnings.md`, NOT in `CLAUDE.md`. This keeps `CLAUDE.md` small and fast to load while letting the learnings file grow over cycles. Every SET command that needs learnings reads this file explicitly — so sub-agents (builders, QA, reviewers) still get the benefit.

**If the file does not exist**, create it with this skeleton:

```markdown
# SET Learned Patterns

Dated, actionable learnings accumulated across SET cycles. Read by `/set-plan`, `/set-build`, and `/set-review` so each cycle benefits from prior cycles.

## What Works

## What Failed

## Recurring Bugs
```

**Any pre-existing `### Learned Patterns` section in `CLAUDE.md` is left in place by design** — do not migrate automatically. Only new entries from this cycle route to `.claude/set/learnings.md`. The user can migrate or prune the old content at their leisure.

Append entries to the appropriate section in `.claude/set/learnings.md`. Each entry MUST be:

- **Dated**: `[YYYY-MM-DD]`
- **Specific**: reference actual files, functions, or error messages
- **Actionable**: future Claude should know what to DO differently

**Good entry:**
```
[2026-03-17] Shared field high-run exclusion via `grouping.py`: Pass `shared_field_numbers`
to `assign_grouped_game_groups()` and union with `time_limited_fields`. Simpler than modifying
`get_field_capacities()` — directly uses already-computed shared schedule info.
```

**Bad entry:**
```
[2026-03-17] Be careful with shared fields.
```

Place entries in the correct subsection:
- `## What Works` — reinforced patterns
- `## What Failed` — abandoned approaches with reasons
- `## Recurring Bugs` — errors to prevent proactively

### 4. Update Build Commands in CLAUDE.md (if needed)

If the test/lint/typecheck commands changed or new ones were discovered, update the "Build Commands" section in `CLAUDE.md`. These are structural facts, not accumulating history, so they stay in `CLAUDE.md`.

### 5. Update Architecture in CLAUDE.md (if needed)

If the project structure changed (new directories, new major modules), update `CLAUDE.md` accordingly. Structural, not accumulating — stays in `CLAUDE.md`.

### 6. Evolve Agents

This step makes agents smarter after each cycle. Read every agent file in `.claude/agents/` and evaluate each agent's performance during this cycle.

#### 6a: Gather agent performance data

For each agent that participated in this cycle, look for:

- **QA rejections**: Tasks the agent completed that QA sent back — what was wrong?
- **Review findings**: Issues flagged during `/set-review` in code this agent wrote
- **Ralph Loop struggles**: Errors the agent hit repeatedly (3+ retries on the same error)
- **Scope violations**: Did the agent modify code outside its assigned task?
- **Patterns the agent handled well**: Clean implementations that passed QA on first attempt

If no agents participated (e.g., this was a manual build), skip to step 7.

#### 6b: Propose agent updates

For each agent with findings, propose specific additions to its `.md` file. Updates fall into these categories:

**Domain Knowledge** — add project-specific patterns the agent should know:
```
- Always use `prepare: false` when creating postgres connections for Supabase
- MUI imports must be individual (e.g., `import Box from '@mui/material/Box'`), never barrel imports
```

**Conventions** — add rules the agent violated or should follow:
```
- Never modify logic outside the files listed in your task. Message team lead if adjacent changes seem needed.
- Always check for existing utility functions in ~/utils/ before writing new helpers.
```

**Common Mistakes** — add a section if the agent made repeated errors:
```
## Common Mistakes (avoid these)
- [2026-03-18] Putting `from copy import copy` inside function bodies instead of at module top
- [2026-03-18] Using total run count instead of max-single-game count for HRH identification
```

**Key Files** — update if the agent should know about new files discovered during the cycle.

#### 6c: Apply updates

- **Show the user each proposed change before writing.** Get confirmation.
- **NEVER remove existing content** from agent files — only append or update.
- **Date new entries** with `[YYYY-MM-DD]` so stale learnings can be identified later.
- **Keep agent files focused.** If an agent's file exceeds ~100 lines, suggest splitting domain knowledge into a referenced file.

#### 6d: Cross-agent learnings

If a finding applies to ALL agents (e.g., "never modify code outside task scope"), add it to `.claude/set/learnings.md` (under the appropriate section) instead of duplicating it across every agent file. Agent-specific learnings go in the agent file; universal learnings go in `.claude/set/learnings.md`.

### 7. Archive Plan

```bash
# Move completed plan to archive
mkdir -p .claude/plans/archive
mv .claude/plans/{feature}.md .claude/plans/archive/{feature}.md 2>/dev/null
```

### 8. Report to User

Tell the user:
- How many new learnings were added to `.claude/set/learnings.md` (and which sections)
- Any updates to `CLAUDE.md` (Build Commands, Architecture) — these should be rare
- Which agents were updated and what was added to each
- Any patterns that contradict previous ones (update, don't duplicate)
- Any process insights about SET itself (task sizing, specialist routing, etc.)
- Suggestions for what to build or fix next

## Maintenance Rules

- **Don't duplicate entries.** Search existing learnings first — update if the learning evolved.
- **Remove stale entries.** If tech was removed or a pattern was superseded, delete the old entry.
- **Keep entries concise.** Noise degrades signal for every agent that reads the file.
- **Contradictions**: If a new learning contradicts an old one, update the old entry with a dated note explaining the change.
- **No automatic rotation.** Let `.claude/set/learnings.md` grow. A future `/set-compact-learnings` command will handle consolidation and archival into `.claude/set/learnings-archive/`.

## Why This Phase Matters

The learning loop is SET's core differentiator. Without it, AI coding tools treat every session as independent — repeating mistakes, missing conventions, rediscovering patterns. With it, SET accumulates institutional knowledge at two levels:

- **Project level** (`.claude/set/learnings.md`) — dated patterns, failures, and recurring bugs read by `/set-plan`, `/set-build`, and `/set-review` every cycle
- **Agent level** (`.claude/agents/*.md`) — domain-specific lessons passed as base context when each specialist is spawned

This is what makes SET compound: **the system improves itself with use — both the project knowledge and the agents themselves.**
SETEOF
info "Installed /set-learn"

# --- /set-update ---
cat > "$COMMANDS_DIR/set-update.md" << 'SETEOF'
---
description: "Update SET and all its dependencies (Superpowers, Compound Teams) to the latest versions. Run periodically to get improvements and bug fixes."
---

# SET Update — Update the Full Stack

Update SET and both of its prerequisite plugins to the latest versions.

SET is NOT in an official Claude marketplace. It is installed via `install.sh`. Update by re-running the installer — it overwrites the command files in `~/.claude/commands/` with the latest from the repo.

## Process

### 1. Update SET

Re-run the installer to pull latest commands:

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

### 2. Update Superpowers

```
/plugin update superpowers@claude-plugins-official
```

### 3. Update Compound Teams

```
/plugin update compound-teams@compound-teams-marketplace
```

### 4. Verify

After all updates complete, verify the installation:

```bash
echo "=== SET commands ==="
ls ~/.claude/commands/set-*.md 2>/dev/null

echo "=== Superpowers ==="
ls ~/.claude/plugins/cache/*/superpowers/ 2>/dev/null && echo "OK" || echo "NOT FOUND"

echo "=== Compound Teams ==="
ls ~/.claude/plugins/cache/*/compound-teams/ 2>/dev/null && echo "OK" || echo "NOT FOUND"

echo "=== Agent Teams enabled ==="
cat ~/.claude/settings.json 2>/dev/null | grep -q AGENT_TEAMS && echo "OK" || echo "NOT FOUND"
```

### 5. Report

Tell the user:
- Which plugins were updated successfully
- Any that failed (with suggested fix)
- If any SET commands changed, briefly note what's new
SETEOF
info "Installed /set-update"

# ---------------------------------------------------------------------------
# Step 5: Verify
# ---------------------------------------------------------------------------
bold ""
bold "Step 5: Verifying installation"
bold "------------------------------"

ERRORS=0

# Check settings
if jq -e '.extraKnownMarketplaces."claude-plugins-official"' "$SETTINGS_FILE" &>/dev/null; then
  info "Marketplace: claude-plugins-official"
else
  error "Missing marketplace: claude-plugins-official"
  ERRORS=$((ERRORS + 1))
fi

if jq -e '.extraKnownMarketplaces."compound-teams-marketplace"' "$SETTINGS_FILE" &>/dev/null; then
  info "Marketplace: compound-teams-marketplace"
else
  error "Missing marketplace: compound-teams-marketplace"
  ERRORS=$((ERRORS + 1))
fi

if jq -e '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' "$SETTINGS_FILE" &>/dev/null; then
  info "Agent Teams: enabled"
else
  error "Agent Teams: not enabled"
  ERRORS=$((ERRORS + 1))
fi

# Check commands
for cmd in set-init set-design set-plan set-build set-review set-learn set-update; do
  if [ -f "$COMMANDS_DIR/$cmd.md" ]; then
    info "Command: /$cmd"
  else
    error "Missing command: /$cmd"
    ERRORS=$((ERRORS + 1))
  fi
done

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
bold ""
bold "============================================"
if [ $ERRORS -eq 0 ]; then
  bold "  SET installed successfully!"
else
  bold "  SET installed with $ERRORS warning(s)"
fi
bold "============================================"
echo ""
info "Pipeline:"
info "  /set-init (once per project)"
info "  /set-design → /set-plan → /set-build → /set-review → /set-learn"
echo ""
warn "NOTE: Plugins (Superpowers, Compound Teams) may need to be"
warn "installed manually if the 'claude plugin install' commands"
warn "above did not succeed. In Claude Code, run:"
warn "  /plugin install superpowers@claude-plugins-official"
warn "  /plugin install compound-teams@compound-teams-marketplace"
echo ""
info "To initialize a project, open it in Claude Code and run: /set-init"
echo ""
