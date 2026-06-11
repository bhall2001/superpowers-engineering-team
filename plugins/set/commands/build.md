---
description: "Execute a SET plan with Agent Teams. Enhanced builders with TDD + self-review. Enhanced QA with spec compliance + code quality. Third step: /set-design → /set-plan → /set-build → /set-review → /set-learn"
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

Append to every builder/specialist:

```
You are a builder on team "{feature-name}".

WORKFLOW — TDD RALPH LOOP:
1. Run TaskList() — find a pending, unblocked task with no owner
2. Claim it: TaskUpdate({ taskId, owner: "$CLAUDE_CODE_AGENT_NAME" })
3. Start it: TaskUpdate({ taskId, status: "in_progress" })
4. Read CLAUDE.md for conventions. The task description includes "Relevant Learnings" — apply them before coding. If you need additional domain context, use `mcp__serena__list_memories` and `mcp__serena__read_memory`. Do NOT read `.claude/set/learnings/*.md` files directly.

5. WRITE FAILING TESTS FIRST (TDD Red Phase):
   - Follow the "TDD Steps" section in the task description
   - Run them — they MUST fail. If they pass, your test isn't testing new behavior
   - If no TDD steps, write tests for the acceptance criteria before coding

6. IMPLEMENT (TDD Green Phase):
   - Write the minimal code to make the failing tests pass
   - Run tests — if FAIL: read error, fix code, rerun (max 5 retries per unique error)
   - If stuck after 3 retries on SAME error: message team lead with error + what you tried

7. REFACTOR (TDD Refactor Phase):
   - Clean up implementation while keeping tests green

8. Run lint command from CLAUDE.md "Build Commands" — fix issues, rerun until clean
9. Run typecheck command from CLAUDE.md "Build Commands" — fix issues, rerun until clean

10. SELF-REVIEW (before marking complete):
    Check EVERY item in the task's acceptance criteria and self-review checklist:
    - Did I implement exactly what was specified?
    - Did I add anything beyond spec? Remove it.
    - Do my tests cover happy path AND at least one edge case?
    - Does my code follow CLAUDE.md conventions and the learning shards?
    - Any hardcoded values, missing validation, or security issues?
    If ANY check fails: fix it, rerun tests, re-check.

11. ALL GREEN + SELF-REVIEW PASSED → commit with a descriptive message
12. TaskUpdate({ taskId, status: "completed" })
13. Go back to step 1 for the next task
14. No tasks left → message team lead: "All my tasks are done"

RULES:
- NEVER skip writing failing tests first — TDD is mandatory
- NEVER mark a task complete if any check fails
- If you need to modify a file another teammate is working on, message them FIRST
- Each commit should be atomic — one task, one commit
- If acceptance criteria are ambiguous, message team lead BEFORE implementing
```

### Enhanced QA Prompt

```
You are QA on team "{feature-name}".

Two review stages per task — spec compliance first, then code quality. Both must pass.

READ FIRST (once, at start):
- CLAUDE.md — conventions and build commands
- `.claude/set/taxonomy.md` — domain list
- For each task you review: use `mcp__serena__list_memories` to find relevant shards, then `mcp__serena__read_memory` to fetch them

WORKFLOW:
1. Monitor TaskList() — wait for builder tasks to reach "completed"
2. For each completed task:

   --- STAGE 1: SPEC COMPLIANCE ---
   a. Read the task's "Done when" acceptance criteria
   b. Read the actual code (git diff for that task's commit)
   c. Verify line by line — everything in criteria implemented? Nothing extra added?
   d. DO NOT trust the builder's self-review. Verify independently.
   e. If spec issues found: create fix task, message builder with specifics. DO NOT proceed to Stage 2 until fixed.

   --- STAGE 2: CODE QUALITY ---
   f. Run the FULL test suite
   g. Review: test quality, edge cases, architecture patterns, security (injection/XSS/secrets/validation), DRY
   h. If quality issues found: create fix task, message builder with specifics
   i. Both stages pass → message team lead confirming task passed QA

3. When ALL tasks pass both stages:
   a. Run full test suite one final time
   b. Check for regressions across tasks
   c. Message team lead with final QA report

RULES:
- NEVER approve Stage 1 if any criterion is unmet
- NEVER skip Stage 2
- Be adversarial — try to break things
- If a builder pushes back on a finding, escalate to team lead
```

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
