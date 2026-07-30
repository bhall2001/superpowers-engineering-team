---
description: "Executes a SET plan as a native Agent Team: compiles the plan into a build brief (per-task specialist + learning context), spawns parallel TDD builder teammates with a dedicated verifier per task, and schema-verifies each task against the spec before the human gate. Use after /set-plan produces a plan, when a user says 'build it', 'execute the plan', 'start building', or 'run the team'. Add --use-workflow to run the build as a dynamic workflow instead. Do NOT use without an existing plan in .claude/plans/."
---

# SET Build — Agent Team Execution

You are the **brief compiler and coordinator**. SET compiles the approved plan into one well-formed build brief, then executes it as a **native Agent Team** — you spawn builder and verifier teammates that coordinate through a shared task list — and surfaces the result at a human gate. With `--use-workflow`, the same brief is handed to a **dynamic workflow** (the `Workflow` tool) instead, which owns fan-out and parallel builder spawning itself.

You do NOT implement retry/escalation loops yourself. You specify the **bar** (the verification rubric) and the **escalation policy**; the execution path runs the loop.

## Execution Mode

SET's default build path is a **native Agent Team**: the lead session (you) is the
coordinator, spawning builder and verifier teammates that coordinate through a shared
task list. This is a deliberate lean toward durable, autonomous teams.

Check `$ARGUMENTS`:

- **Default (no flag)** → the **Agent Team path** (Phase B-team). Requires the
  `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var; see "Agent Team Availability Gate".
- **`--use-workflow`** → the **dynamic-workflow path** (Phase B-workflow). Skips the
  availability gate entirely.
- **`--use-agent-team`** → accepted as a **silent no-op alias** for the default.
  Do not warn, do not print a deprecation notice — it simply selects the default path.

## Before Starting

### 0. Resolve Serena State (Lazy Detection)

Reconcile Serena configuration. This handles users who installed Serena *after* running `/set-init`.

1. Read `.claude/set/config.json` (create as `{}` if missing).
2. If `serena_enabled` is **present** (true or false), skip the rest of this step — the user already decided.
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
4. Read `.claude/set/config.json` for `serena_enabled`. Read `.claude/set/taxonomy.md` for the valid shard domains. Do NOT load all shard contents up front — shards are loaded per-task in Phase A.
5. **Scan `.claude/agents/`** — read each agent file to understand its domain specialty. The plan tags each task with a `Specialist`; you'll reference these by name in the brief.

## Resolve Worktree Mode

Precedence (first match wins):

1. **CLI flag in `$ARGUMENTS`** — `--no-worktree` disables; `--worktree` forces enable.
2. **CLAUDE.md setting** — a line matching `SET: no-worktree` (case-insensitive) disables worktrees for this project.
3. **Default** — worktrees enabled.

If **disabled**: skip Step 1. Run 1d (project setup) and 1e (baseline tests) on the current branch. Report: `Worktree mode: DISABLED — building on current branch {branch-name}`. Proceed to Phase A.

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
Ready to compile the build brief.
```

## Phase A — Compile the Build Brief (main context, cheap)

This is SET's methodology layer. Assemble ONE brief the workflow can execute without re-deriving anything. For each task in the plan:

### A1: Load shards for the task
For each domain in the task's `Shards` field, read `.claude/set/learnings/{domain}.md` and collect its contents (strip frontmatter, keep the What Works / What Failed / Recurring Bugs sections). If `Shards` is empty, skip.

### A2: Query Serena (if enabled)
If `serena_enabled: true`, query Serena for memories relevant to the task's `What` + `Done when` text. Cap at top 5 by relevance. Dedupe against shards already loaded in A1 (skip memories whose `source:` points to an already-loaded shard). If Serena fails or times out, log a warning and continue — never block the build on Serena.

### A3: Assemble the per-task context bundle
```
{full task description from plan, INCLUDING TDD Steps, Files, Tests, Done-when, and Self-Review Checklist}

## Specialist guidance
Read `.claude/agents/{Specialist}.md` and use it as base context for this task.
(If Specialist is "generic" or absent, no agent file — use general best practices.)
NOTE: a specialist definition's `skills`/`mcpServers` frontmatter is NOT auto-applied to
workflow agents. If this task needs Serena, call `mcp__serena__*` tools directly.

## Relevant Learnings (from shards: {comma-separated domains})
{shard contents}

{if Serena enabled and returned results:}
## Additional Semantic Matches (from Serena)
{top-5 deduped memory contents}
```

### A4: Compose the global verification rubric
The bar EVERY task must clear before the workflow folds its output back:
- **TDD discipline:** a failing test was written first (red), minimal code made it pass (green), then refactor — tests stay green.
- **Spec compliance:** every "Done when" criterion met; nothing implemented beyond spec.
- **Quality gates:** lint and typecheck commands from CLAUDE.md "Build Commands" pass clean.
- **Self-review:** every item in the task's Self-Review Checklist is satisfied.

### A5: Define the escalation policy
What the workflow does when a task can't meet the bar after its own revise loop: stop that task, record the specific failing criterion + what was tried, and return it as a **failed task** in the report (do NOT fold partial/failing work back as if it passed). Other independent tasks continue.

## Agent Team Availability Gate

Run this AFTER Phase A and BEFORE Phase B. **Skip entirely if `--use-workflow` was passed.**

Agent Teams are an experimental Claude Code feature, disabled by default:

```bash
jq -r '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS // empty' ~/.claude/settings.json
```

If the value is `1`, proceed to Phase B-team.

If it is empty or absent, present exactly two options and wait for the user:

```
Agent Teams are not enabled, so /set-build cannot run its default path.

  1. Run this build on the dynamic-workflow path now
  2. Stop, so you can enable Agent Teams

Which? [1/2]
```

- **Option 1** → run Phase B-workflow. Say so plainly; never degrade silently.
- **Option 2** → stop and print:

  ```
  Add this to ~/.claude/settings.json:

    "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }

  Then restart your session — the variable is read at session start, so setting
  it in this session will not take effect. Re-run /set-build after you restart
  the session.
  ```

  The restart line is required. Without it a user sets the variable, retries in the
  same session, and hits the identical failure.

Do not persist the answer to `config.json`. This gate asks each cycle while
Agent Teams are unavailable — the choice is not persisted between runs.

## Phase B — Fork by Execution Mode

Phase A above and Phase C below are **shared and harness-agnostic** — they run
identically regardless of path. Only this phase forks:

- **Default** → Phase B-team (native Agent Team)
- **`--use-workflow`, or Option 1 at the availability gate** → Phase B-workflow

Both paths are first-class and must emit the **identical per-task verdict schema**:

```
{ task: string, passed: boolean, tdd_followed: boolean, spec_compliant: boolean,
  lint_pass: boolean, typecheck_pass: boolean, failing_criteria: string[], notes: string }
```

Phase C consumes this shape without knowing which path produced it. This schema is the
seam that keeps the two paths from drifting — when editing either path, preserve it exactly.

## Phase B-workflow — Delegate to the Dynamic Workflow

Invoke the **`Workflow` tool** with a script that executes the brief. The script must:

1. **Respect the dependency graph.** Tasks with no `Blocked by` run in parallel; dependent tasks wait. Use `pipeline()` / `parallel()` honoring each task's `Blocked by`.
2. **Spawn one builder `agent()` per task**, passing `agentType` = the task's `Specialist` (omit / generic builder when "generic"). Inject the task's Phase-A context bundle as the prompt. Instruct the builder to run the TDD loop (red → green → refactor → lint → typecheck → self-review) and commit atomically on success.
3. **Verify each output against the rubric before folding back**, using a verifier `agent({schema})` so each task returns a validated structured verdict, e.g.:
   ```
   { task: string, passed: boolean, tdd_followed: boolean, spec_compliant: boolean,
     lint_pass: boolean, typecheck_pass: boolean, failing_criteria: string[], notes: string }
   ```
   The verifier is a *fresh* agent that did not write the task's code.
4. **Apply the escalation policy** (A5) for any task whose verdict is `passed: false`.
5. **Return** one coordinated result: the final diff (it's committed in the worktree/branch) + the array of per-task verdicts.

Author the workflow script to keep intermediate builder output in script variables — do not pull every builder transcript into your context. You receive only the final verdicts + diff.

> SET no longer implements "max 5 retries / escalate after 3." The workflow's native verify-and-revise loop subsumes it. You specified the bar (A4) and the escalation policy (A5); the workflow runs the loop.

## Phase C — Build Gate-Back (you own this)

When the selected execution path returns:

1. Run the full test suite yourself one final time.
2. Present the result at the human gate. Show: tasks passed/failed (from the structured verdicts), the diff stat, and any failed-task escalations.
3. **Frame the verification report as builder self-grading** — useful but biased by construction (a grader checking work produced by the same execution path prefers its own findings). It is never the final word. The independent audit happens in `/set-review`.
4. Report the worktree location or current branch name.
5. Suggest: "Run `/set-review` for the independent holistic review, then `/set-learn` to capture learnings."

If a worktree was created, do NOT remove it — `/set-review` handles cleanup.
