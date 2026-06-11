---
description: "Executes an implementation plan using a coordinated Agent Team: routes tasks to domain specialists, enforces TDD Ralph Loops, and runs two-stage QA (spec compliance + code quality). Use after /set-plan produces a plan, when a user says 'build it', 'execute the plan', 'start building', or 'run the team'. Do NOT use without an existing plan in .claude/plans/ or for tasks that don't need parallel agents."
---

# SET Build — Agent Team Execution

You are the team lead. Execute a plan using Compound Teams' Agent Team infrastructure.

## Before Starting

1. Look for a plan in `.claude/plans/`. If none exists, tell the user to run `/set-plan` first.
2. Read the plan and the linked design spec if referenced.
3. Read CLAUDE.md — especially Build Commands and conventions.
4. Use `mcp__serena__list_memories` to discover available domain shards. Read `.claude/set/taxonomy.md` to confirm domain names.
5. Scan `.claude/agents/` — read each agent file to understand its domain specialty.
6. Switch to **delegate mode** (Shift+Tab). You coordinate. You do NOT write code.

## Resolve Worktree Mode

Precedence (first match wins):

1. **CLI flag in `$ARGUMENTS`** — `--no-worktree` disables; `--worktree` forces enable.
2. **CLAUDE.md setting** — a line matching `SET: no-worktree` disables worktrees for this project.
3. **Default** — worktrees enabled.

If **disabled**: skip Step 1. Run 1d (project setup) and 1e (baseline tests) on the current branch. Report: `Worktree mode: DISABLED — building on current branch {branch-name}`. Proceed to Step 2.

## Step 1: Create Isolated Worktree

### 1a: Select worktree directory

Priority: `.worktrees/` → `worktrees/` → CLAUDE.md specified → ask the user.

### 1b: Verify directory is git-ignored

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

```bash
if [ -f package.json ]; then npm install || pnpm install || yarn install; fi
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install || uv sync; fi
if [ -f go.mod ]; then go mod download; fi
if [ -f Cargo.toml ]; then cargo build; fi
```

Use the package manager from CLAUDE.md if specified.

### 1e: Verify clean baseline

Run the test suite from CLAUDE.md "Build Commands". If tests fail, ask the user whether to proceed or investigate.

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

## Step 3: Create Tasks from the Plan (with Shard Injection)

### 3a: Load shards for the task

For each domain in the task's `Shards` field, use `mcp__serena__read_memory` to fetch the shard contents. If `Shards` is empty, skip.

### 3b: Query Serena for relevant memories

Use Serena to fetch memories relevant to this task:
- Query signal: the task's `What` + `Done when` text
- Tool: `mcp__serena__find_referencing_symbols` or `mcp__serena__read_memory`
- Cap results at top 5 by relevance
- Dedupe against domains already loaded in 3a

### 3c: Build the task description

```
{full task description from plan, INCLUDING TDD Steps and Self-Review Checklist}

---
## Relevant Learnings (from shards: {comma-separated domains})

{shard contents — What Works / What Failed / Recurring Bugs sections}

## Additional Semantic Matches (from Serena)
{top-5 deduped memory contents}
```

### 3d: Create the task

```
TaskCreate({
  subject: "{task name from plan}",
  description: "{description assembled in 3c}",
  activeForm: "{what in-progress looks like}",
  blockedBy: ["{task IDs this depends on}"]
})
```

Include TDD steps, self-review checklist, AND shard context in every task description. Builders do NOT re-read shards themselves.

## Step 4: Spawn Teammates

### Using Project Agents

Each task in the plan has a `Specialist` field. Use it to route tasks:
- `Specialist: {agent-name}` → spawn that agent as builder
- `Specialist: generic` → use a generic builder
- QA agent (if present) → use for QA role

When spawning, tell the teammate: `Read .claude/agents/{agent-name}.md and use it as base context. Append the Enhanced Builder Workflow below.`

If no `Specialist` field exists, match by inspecting each task's files and description against agent definitions.

**If a task spans multiple domains**, assign to the primary domain specialist and note applicable conventions from the other domain.

### Team Scaling

- **2-3 tasks**: 1 builder + 1 QA
- **4-6 tasks**: 2 builders + 1 QA
- **7+ tasks**: 3 builders + 1 QA

Prefer distinct specialists over multiple generic builders.

### Enhanced Builder Prompt

Read `references/enhanced-builder-prompt.md` and append its contents to every builder/specialist when spawning. Read it now — before spawning any teammate.

### Enhanced QA Prompt

Read `references/enhanced-qa-prompt.md` and use its contents as the QA teammate prompt. Read it now — before spawning QA.

## Step 5: Monitor and Coordinate

- Check inbox regularly for messages
- If a teammate is blocked: suggest approaches (not code)
- If two teammates need the same file: coordinate who goes first
- If stuck after 3 retries same error: analyze and provide guidance
- Track progress via TaskList()

## Step 6: Wrap Up

When all tasks complete AND QA confirms both stages passed:

1. Shut down each teammate: `Teammate({ operation: "requestShutdown", target_agent_id: "{name}" })`
2. Wait for acknowledgments
3. `Teammate({ operation: "cleanup" })`
4. Run the full test suite one final time
5. Report results. Include worktree location or current branch name.
6. Suggest: "Run `/set-review` for final holistic review, then `/set-learn` to capture learnings"

If a worktree was created, do NOT remove it — `/set-review` will handle cleanup.

## Emergency: Cost Control

If a teammate loops without progress (same error 5+ consecutive times):
1. Message them to stop
2. Request shutdown
3. Report the blocker to the user
