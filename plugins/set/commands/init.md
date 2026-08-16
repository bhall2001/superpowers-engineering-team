---
description: "Sets up a project for the SET workflow: detects stack, scaffolds domain specialist agents, augments CLAUDE.md, and creates required directories. Use when starting SET on a new project, when a user says 'initialize SET', 'set up SET', or 'prepare this project for SET'. Do NOT use when SET is already initialized in this project or when the user just wants to run a design/plan/build cycle."
---

# SET Init — Project Initialization

Initialize this project for the SET workflow.

**Safety first:** NEVER overwrite existing files. Only append or create new. ALWAYS show changes to the user before writing. Get confirmation before each major step.

## Step 1: Check Prerequisites

```bash
# Check for Superpowers
ls ~/.claude/plugins/cache/*/superpowers/ 2>/dev/null && echo "Superpowers: installed" || echo "Superpowers: NOT FOUND"
```

If Superpowers is missing, tell the user how to install it (`bash install.sh`) and stop.

**Dynamic Workflows:** `/set-review` and `/set-build --use-workflow` use the native `Workflow` tool. It ships with Claude Code (Pro/Max/Team/Enterprise). Pro users may need to enable it once via `/config` → "Dynamic workflows". No plugin install required.

## Step 2: Audit Current State

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

Report findings to the user before proceeding.

## Step 3: Ensure learning shards are committable

Shards only carry forward to future cycles if git can see them. Many repos ignore
`.claude/` wholesale, which would silently discard every learning SET produces:

```bash
git check-ignore -q .claude/set/ && echo IGNORED || echo TRACKABLE
```

If `IGNORED`, tell the user and offer to fix `.gitignore` by excluding `.claude/`'s
*contents* rather than the directory itself:

```
.claude/*
!.claude/set/
```

The trailing `*` is required — git will not re-include a path whose parent directory is
excluded, so a bare `.claude/` line makes `!.claude/set/` a silent no-op. Show the change
and get confirmation before writing.

## Step 4: Enable Agent Teams (required for the default `/set-build` path)

`/set-build` runs as a native Agent Team and REQUIRES **both** variables below (a
session restart is needed after first write). Write them by default so the build path
works out of the box.

- **`CLAUDE_CODE_ENABLE_TODO_TOOLS: "true"`** — registers `TaskCreate`, `TaskList`,
  `TaskUpdate`, `TaskGet`. This is the one that actually matters: without it the team
  has no task list and the build cannot run at all.
- **`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"`** — the experimental team flag.

Writing only `EXPERIMENTAL_AGENT_TEAMS` is the mistake SET shipped through 1.3.3: it is
a recognized variable but does not register the task tools, so every build silently
failed the availability check. `CLAUDE_CODE_ENABLE_TASKS` looks like the right lever and
is **not** — it does not work.

Check `.claude/settings.json`:
- If it **doesn't exist**: create it with
  `{ "env": { "CLAUDE_CODE_ENABLE_TODO_TOOLS": "true", "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }`
- If it **exists but lacks either**: add the missing one(s), preserving all other settings
- If it **already has both**: skip, tell user it's already enabled

Show the user the change before writing.

## Step 4b: Install SET enforcement hooks (project settings)

SET ships two PreToolUse hooks that make the build's safety rules structural instead of
prose:

| Hook | Matcher | Enforces |
|---|---|---|
| `set-deny-push.sh` | `Bash` | No agent-initiated `git push` / `gh pr create` / `gh pr merge`. The human's own session may push; every spawned agent is denied. `git commit` stays allowed. |
| `set-guard-agent-name.sh` | `Agent` | A **named** spawn with a verifier-shaped prompt is denied — a named verifier's verdict never arrives (mailbox receipt), so `/set-build` would stall. |

The scripts live centrally at `~/.claude/set/hooks/` (placed by `install.sh`); the
project's `.claude/settings.json` references them as **`$HOME/.claude/set/hooks/…`** —
the literal string, not your expanded home directory. Claude Code runs hook commands
through a shell, so `$HOME` resolves on every machine that opens the repo: your host, a
devcontainer that bind-mounts `~/.claude` at a different absolute path, a collaborator's
checkout. SET's target is autonomous teams in devcontainers, so this portability is the
default — an expanded `/Users/you/...` path would leave the hooks silently absent exactly
where the team runs. Registration is **per project**, never in `~/.claude/settings.json` —
hooks apply only to SET-managed repos.

Show the user the two entries that will be appended to `hooks.PreToolUse`, then run
exactly this (the single quotes around `$HOME` are load-bearing — they stop your shell
from expanding it):

```bash
node ~/.claude/set/hooks/set-hooks.mjs install --settings .claude/settings.json --hooks-dir '$HOME/.claude/set/hooks'
```

It prints `{"installed": [...], "skipped": [...]}`. **If it prints nothing, or errors,
the hooks are NOT registered** — say so; never report success from silence.

Idempotent: re-running adds nothing when the entries are present. It **appends** to
`hooks.PreToolUse` and never rewrites `hooks` wholesale — any hooks the user already has
(SessionStart, other PreToolUse matchers) survive untouched. It creates
`.claude/settings.json` if Step 4 did not. Requires `jq` (already required by SET).

If `~/.claude/set/hooks/set-hooks.mjs` is absent, SET was installed by an older
`install.sh`: tell the user to run `/set-update` (which re-runs the installer, then
registers the hooks) and continue.

Tell the user:
- Hooks are read at session start, so they take effect on the next session.
- To push themselves they type `!git push origin <branch>` — `!` runs in their shell, no
  tool call, no hook.
- The "your own session may push" carve-out is verified for agents spawned in-process
  via the `Agent` tool (the default `/set-build`). It is **not yet verified** for
  `--use-workflow` / `/set-review` workflow agents or for teammates run as separate
  processes (tmux / split-pane teammate mode) — those may present a main-shaped payload.
  Until re-probed, treat the gate as a safety net there, not a guarantee.
- To remove the hooks later:
  `node ~/.claude/set/hooks/set-hooks.mjs uninstall --settings .claude/settings.json --hooks-dir '$HOME/.claude/set/hooks'`
  — it removes only SET's entries (matched by that prefix) and leaves every other hook alone.

## Step 5: Detect Project Stack

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

## Step 6: Augment CLAUDE.md

Append missing sections only. NEVER overwrite.

If CLAUDE.md doesn't exist, create a minimal one. Append only the missing sections:

```markdown

---

## SET Workflow

This project uses the Superpowers Engineering Team workflow:
`/set-design` → `/set-plan` → `/set-build` → `/set-review` → `/set-learn`

### Per-Task TDD Loop (enforced by /set-build for every builder)
1. Write failing tests first (TDD red phase)
2. Implement minimal code to pass (TDD green phase)
3. Refactor while keeping tests green
4. Run tests — if fail: read error, fix, retry
5. Run linter/type checker — if fail: fix and retry
6. Self-review against acceptance criteria
7. Only mark a task complete when ALL checks pass — a fresh verifier confirms the bar before the work is folded back

### Build Commands
- Tests: `[DETECTED_TEST_COMMAND]`
- Lint: `[DETECTED_LINT_COMMAND]`
- Type check: `[DETECTED_TYPECHECK_COMMAND]`
- Format: `[DETECTED_FORMAT_COMMAND]`
- Dev server: `[DETECTED_DEV_COMMAND]`

### Domain Specialists
<!-- Agents in .claude/agents/ — SET routes tasks to the right specialist -->
- [List agents created in Step 7]

<!-- Dated, accumulating learnings live in sharded `.claude/set/learnings/{domain}.md` files (not here). `/set-build` scopes shards per task to keep context small. Taxonomy is in `.claude/set/taxonomy.md`. -->
```

Replace `[DETECTED_*]` placeholders with actual commands from Step 5.

Show the user exactly what will be appended. Get confirmation before writing.

## Step 7: Scaffold Domain Specialist Agents

### 7a: Check for existing agents

```bash
ls .claude/agents/ 2>/dev/null
```

If agents exist, read each and report what domains are covered. Identify gaps based on detected stack.

### 7b: Determine which specialists to scaffold

| Detected | Agent to scaffold | Covers |
|---|---|---|
| Database (Drizzle, Prisma, SQLAlchemy, etc.) | `db-specialist.md` | Schema, migrations, queries, ORM patterns |
| React/Vue/Svelte/frontend framework | `ui-specialist.md` | Components, state management, styling, accessibility |
| API routes / Express / FastAPI | `api-specialist.md` | Endpoints, validation, error handling, auth |
| Test runner detected | `qa-specialist.md` | Test strategy, edge cases, integration tests, spec compliance |
| TypeScript or Python with types | `architect.md` | Type design, module boundaries, dependency direction |

Only propose agents for domains actually present. Do NOT scaffold agents for absent domains.

### 7c: Write agent files

For each proposed agent, create a starter file in `.claude/agents/`:

```markdown
---
name: {agent-slug}
description: {one line — when SET should route a task to this specialist}
model: sonnet
tools: [Read, Edit, Write, Bash, Grep, Glob]
---

You are a {domain} specialist agent in the SET workflow. You have deep expertise in {specific technologies detected}.

## Domain Knowledge

- {Project-specific patterns from CLAUDE.md}
- {Key files and directories for this domain}
- {Conventions to follow}

## Key Files
- {List specific files/directories this specialist should know about}

## Conventions
- {Domain-specific conventions from CLAUDE.md or detected patterns}
```

**Frontmatter rules (these make the agent spawnable — do not skip):**
- `name:` **MUST equal the filename stem** — `db-specialist.md` → `name: db-specialist`, `architect.md` → `name: architect`. This is the `agentType` that `/set-plan` tags as a task's `Specialist` and `/set-build` spawns. If `name:` and the stem diverge, routing silently falls back to the generic agent.
- `description:` — one line stating when SET should route a task to this specialist.
- `model:` — replaces the old `## Model` section; keep it in frontmatter only (no `## Model` body heading).
- `tools:` — `[Read, Edit, Write, Bash, Grep, Glob]` for every specialist (builders write code, run tests, search). `qa-specialist` uses the same list; QA independence comes from `/set-build` using a fresh verifier agent, not from tool restriction.
- Do NOT add `skills:` or `mcpServers:` keys — the Workflow tool does not apply them.

Read CLAUDE.md and any existing shards in `.claude/set/learnings/` to populate with real project-specific content — NOT generic placeholders. Show each file before writing. Get confirmation.

### 7d: Suggest customization

Tell the user: "These are starter agents based on your detected stack. Review and customize them — the more project-specific knowledge you add, the better SET routes tasks."

## Step 8: Create Directory Structure

```bash
mkdir -p .claude/plans/archive
mkdir -p .claude/set
mkdir -p .claude/set/learnings
mkdir -p .claude/set/learnings-archive
mkdir -p docs/superpowers/specs
```

Create `.claude/set/taxonomy.md` if it does not already exist (NEVER overwrite):

```markdown
# Learning Taxonomy

Free-form list of domains used to shard learnings in `.claude/set/learnings/`. Populated and maintained by `/set-learn`. Format: one domain per line, `- name: short description`.

<!-- populated on first /set-learn run -->
```

If `.claude/set/learnings.md` exists (legacy monolithic file), leave it — `/set-learn` will auto-split it into shards on its next run.

## Step 9: Summary

```
SET initialized!

Pipeline: /set-design → /set-plan → /set-build → /set-review → /set-learn

Stack detected:
  Languages:    [detected]
  Framework:    [detected]
  Test runner:  [detected]
  Linter:       [detected]
  Type checker: [detected]

Execution:   Agent Teams (default for /set-build) — dynamic workflows available via /set-build --use-workflow
Learnings:   [✓ .claude/set/ is trackable by git | ⚠ gitignored — learnings will not persist]
Domain specialists scaffolded:
  .claude/agents/db-specialist.md       — [if created]
  .claude/agents/ui-specialist.md       — [if created]
  .claude/agents/api-specialist.md      — [if created]
  .claude/agents/qa-specialist.md       — [if created]
  .claude/agents/architect.md           — [if created]

Directories created:
  .claude/plans/                  — Implementation plans
  .claude/plans/archive/          — Completed plans
  .claude/set/                    — SET state
  .claude/set/learnings/          — Sharded, domain-scoped learnings
  .claude/set/learnings-archive/  — Archived/compacted learnings
  docs/superpowers/specs/         — Design specifications

Files created:
  .claude/set/taxonomy.md         — Learning domain taxonomy (populated on first /set-learn)

Enforcement hooks (.claude/settings.json → hooks.PreToolUse):
  set-deny-push.sh        [✓ installed | ⚠ skipped — run /set-update]  — agents cannot push / open or merge PRs
  set-guard-agent-name.sh [✓ installed | ⚠ skipped — run /set-update]  — named verifier spawns are rejected
  (active from the next session; you push with `!git push origin <branch>`)

CLAUDE.md augmented with:
  - SET pipeline reference
  - Per-task TDD loop
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
