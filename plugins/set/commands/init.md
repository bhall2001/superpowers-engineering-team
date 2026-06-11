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

# Check for Compound Teams
ls ~/.claude/plugins/cache/*/compound-teams/ 2>/dev/null && echo "Compound Teams: installed" || echo "Compound Teams: NOT FOUND"
```

If either is missing, tell the user how to install it and stop.

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

## Step 3: Verify Serena MCP

Serena is required. Verify it is available:

1. Check that any `mcp__serena__*` tool is listed in your available tools.
2. If NOT available, print the following and stop:
   > "Serena MCP is required by SET. Run `bash install.sh` from the SET repository to install it, then restart Claude Code and try again."
3. If available, initialize `.serena/project.yml` for this project (create `.serena/` if missing):
   ```yaml
   project_name: "{project-name-from-git-or-dirname}"
   languages: []  # fill in your primary languages
   ignore_all_files_in_gitignore: true
   ```
   Show the user the file before writing. Get confirmation.

## Step 4: Enable Agent Teams

Check `.claude/settings.json`:
- If it **doesn't exist**: create it with `{ "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }`
- If it **exists but lacks the flag**: add the flag, preserving all other settings
- If it **already has the flag**: skip, tell user it's already enabled

Show the user the change before writing.

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

Agent Teams: enabled
Serena MCP:  ✓ required and verified
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
