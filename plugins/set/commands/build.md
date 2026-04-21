---
description: "Execute a SET plan with Agent Teams. Enhanced builders with TDD + self-review. Enhanced QA with spec compliance + code quality. Third step: /set-design → /set-plan → /set-build → /set-review → /set-learn"
---

# SET Build — Agent Team Execution with Enhanced Quality Gates

You are the team lead. Execute a plan using Compound Teams' Agent Team infrastructure with enhanced builder and QA prompts that incorporate Superpowers' quality discipline.

## Before Starting

### 0. Resolve Serena State (Lazy Detection)

Before anything else, reconcile Serena configuration. This handles users who installed Serena *after* running `/set-init`.

1. Read `.claude/set/config.json` (create as `{}` if missing).
2. If `serena_enabled` is **present** (true or false), skip the rest of this step — the user has already decided.
3. If the key is **missing**, detect Serena:
   ```bash
   ls .serena/ 2>/dev/null
   grep -l '"serena"' ~/.claude/*.json ~/.config/claude/*.json .claude/*.json 2>/dev/null | head -1
   ```
   - **Detected** → prompt ONCE: "Serena MCP detected. Enable semantic learning retrieval during `/set-build`? [y/N]". Persist the answer to `config.json`. If yes, `mkdir -p .serena/memories`.
   - **Not detected** → write `serena_enabled: false` silently.

User can re-toggle later via `/set-update`.

### Subsequent Steps

1. Look for a plan in `.claude/plans/`. If none exists, tell the user to run `/set-plan` first.
2. Read the plan thoroughly. Also read the linked design spec if referenced.
3. Read CLAUDE.md — especially Build Commands and conventions.
4. Read `.claude/set/config.json` to determine if Serena is enabled (`serena_enabled`). Read `.claude/set/taxonomy.md` to know the valid shard domains. Do NOT load all shard contents up front — shards are loaded per-task in Step 4 below.
5. **Scan for project agents** in `.claude/agents/`. Read each agent file to understand what domain it specializes in (e.g., database, UI, API/sync, QA, architecture). You'll use these to assign the right specialist to each task.
6. Switch to **delegate mode** (Shift+Tab). You coordinate. You do NOT write code.

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

## Step 3: Create Tasks from the Plan (with Shard Injection)

For each task in the plan:

### 3a: Load shards for the task

Read the task's `Shards` field. For each domain listed:
- Read `.claude/set/learnings/{domain}.md`
- Collect its contents (strip frontmatter, keep sections)

If `Shards` is empty, skip shard loading.

### 3b: Query Serena (if enabled)

If `serena_enabled: true` in `.claude/set/config.json`, query Serena for semantically relevant memories:

- Query: the task's `What` + `Done when` text (raw task description, not a summary — richer signal for retrieval)
- Tool: Serena's memory search (`mcp__serena__find_memory` or equivalent — use whatever Serena exposes)
- **Cap results at top 5** by relevance
- Dedupe against shards already loaded in 3a (skip any memory whose `source:` frontmatter points to a shard file already loaded)

If Serena call fails or times out: log a warning and continue without it. Never block the build on Serena.

### 3c: Build the task description

Assemble the task description passed to `TaskCreate`:

```
{full task description from plan, INCLUDING TDD Steps and Self-Review Checklist}

---
## Relevant Learnings (from shards: {comma-separated domains})

{concatenated shard file contents — What Works / What Failed / Recurring Bugs sections}

{if Serena enabled and returned results:}
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

**Critical:** Include the TDD steps, self-review checklist, AND shard context in every task description. Builders need these in context — they do NOT re-read shards themselves, since a task-scoped subset is cheaper than loading everything.

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
4. Read CLAUDE.md for conventions. The task description already includes the relevant learning shards ("Relevant Learnings" section) and any Serena matches — apply them before coding. Do NOT load `.claude/set/learnings/*.md` yourself; the team lead scoped them to this task.

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
    - Does my code follow the project conventions from CLAUDE.md and the learning shards in my task description?
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
- `.claude/set/taxonomy.md` (if it exists) — so you know what domains exist
- For each task you review: the shards referenced in the task's `Shards` field (read `.claude/set/learnings/{domain}.md`) — you need these to verify compliance with accumulated patterns

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
      - Architecture: does the code follow project patterns from CLAUDE.md and the task's learning shards?
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
