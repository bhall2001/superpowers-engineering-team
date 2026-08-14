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
- `--autonomous` / `--verbose` — parse and strip per
  `~/.claude/commands/references/autonomous-mode.md`.

**Emit phase-boundary lines on every run**, with or without `--autonomous`, in the
Verbosity Levels format from that reference: the `▶ SET build — starting` line once flags
are parsed, and the `◀ SET build — {tasks passed/failed}, {diff stat}` line at the end of
Phase C. Under `--autonomous` the same lines carry the chain annotation and `[n/N]`;
without it, omit both. Emit each line once per run. The `--autonomous`-only reports below
(worktree dir default, failing baseline, Agent Teams unavailable) are annotations on that
one opening line, not extra boundary lines.

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

- **Without `--autonomous`:** if none of the first three resolve, ask the user.
- **With `--autonomous`:** never ask — there is no one to answer. Default to
  `.worktrees/` and report the choice on the phase-boundary line:
  `Worktree dir not configured — defaulting to .worktrees/`.

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
Run the test suite from CLAUDE.md "Build Commands".

- **Without `--autonomous`:** if tests fail, ask the user whether to proceed or investigate.
- **With `--autonomous`:** if tests fail, record the failing baseline and proceed. A
  pre-existing failure is not this cycle's regression, and `/set-review`'s correctness
  lens will surface it as a `critical` finding if it matters. Report the failure count
  on the phase-boundary line.

### 1f: Report
```
Worktree ready at {full-path}
Branch: feat/{feature-name}
Tests passing ({N} tests, 0 failures)
Ready to compile the build brief.
```

## Phase A — Compile the Build Brief (main context, cheap)

This is SET's methodology layer. Assemble ONE brief the execution path can run without re-deriving anything. For each task in the plan:

### A1: Load shards for the task
For each domain in the task's `Shards` field, read `.claude/set/learnings/{domain}.md` and collect its contents (strip frontmatter, keep the What Works / What Failed / Recurring Bugs sections). If `Shards` is empty, skip.

### A2: Retrieve additional learnings beyond the task's tagged shards

A1 covers the domains the plan tagged. A2 catches relevant learnings in *untagged*
shards. Two interchangeable paths — both optional, neither ever blocks the build:

**If `serena_enabled: true`:** query Serena for memories relevant to the task's `What` +
`Done when` text. Cap at top 5 by relevance. If Serena fails or times out, log a warning
and fall through to the keyword path below rather than giving up on retrieval entirely.

**Otherwise (the default, and the only path in walled environments):** keyword-scan the
shards directly. No MCP server required — shards are plain markdown on disk:

1. Derive 3-6 distinctive keywords from the task's `What` + `Done when` (skip generic
   verbs like "add", "update", "fix"; keep domain nouns, API names, error strings).
2. Scan shards **not** already loaded in A1:
   ```bash
   grep -rin -A 3 -e '{keyword1}' -e '{keyword2}' .claude/set/learnings/ | head -60
   ```
3. Keep entries whose match is substantive, not incidental. Cap at top 5.

Under either path, dedupe against shards already loaded in A1 (for Serena, skip memories
whose `source:` points to an already-loaded shard). If nothing is found, omit the section
from the bundle entirely — an empty heading is noise that costs every builder tokens.

### A3: Assemble the per-task context bundle
```
{full task description from plan, INCLUDING TDD Steps, Files, Tests, Done-when, and Self-Review Checklist}

## Specialist guidance
Read `.claude/agents/{Specialist}.md` and use it as base context for this task.
(If Specialist is "generic" or absent, no agent file — use general best practices.)
NOTE: a specialist definition's `skills`/`mcpServers` frontmatter is NOT auto-applied to
spawned agents. Do NOT call `mcp__serena__*` yourself — the learnings you need are already
injected below. For code navigation, use Claude Code's built-in LSP tool.

## Relevant Learnings (from shards: {comma-separated domains})
{shard contents}

{if A2 returned results — omit this whole section if it found nothing:}
## Additional Relevant Learnings (from untagged shards)
{top-5 deduped entries from A2, whichever retrieval path produced them}
```

### A4: Compose the global verification rubric
The bar EVERY task must clear before the execution path folds its output back:
- **TDD discipline:** a failing test was written first (red), minimal code made it pass (green), then refactor — tests stay green.
- **Spec compliance:** every "Done when" criterion met; nothing implemented beyond spec.
- **Quality gates:** lint and typecheck commands from CLAUDE.md "Build Commands" pass clean.
- **Self-review:** every item in the task's Self-Review Checklist is satisfied.

### A5: Define the escalation policy
What the execution path does when a task can't meet the bar after its own revise loop: stop that task, record the specific failing criterion + what was tried, and return it as a **failed task** in the report (do NOT fold partial/failing work back as if it passed). Other independent tasks continue.

## Agent Team Availability Gate

Run this AFTER Phase A and BEFORE Phase B. **Skip entirely if `--use-workflow` was passed.**

Agent Teams are an experimental Claude Code feature, disabled by default:

```bash
jq -r '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS // empty' ~/.claude/settings.json
```

If the value is `1`, proceed to Phase B-team.

If it is empty or absent:

**Under `--autonomous`, do not present options or wait.** Select the
dynamic-workflow path (Phase B-workflow, the `--use-workflow` semantics) and
report on the phase-boundary line: `Agent Teams unavailable — using workflow path`.
The workflow path needs no env var, so it always runs.

**Without `--autonomous`,** present exactly two options and wait for the user:

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

## Phase B-team — Execute as a Native Agent Team (default)

You are the **coordinator**. Claude Code ships no separate coordinator agent or skill —
the lead session fills that role. You spawn teammates, route work through a shared task
list, and unblock with guidance. You do **not** write implementation code yourself.

Valid tools for this phase: `Agent`, `SendMessage`, `TaskCreate`, `TaskGet`, `TaskList`,
`TaskUpdate`. There is no dedicated team-spawning tool, no forced-shutdown tool, and no
cleanup operation — a team is implicit in the session and is created by spawning the first
named agent.

### T1: Build the task graph

One `TaskCreate` per plan task:

```
TaskCreate({
  subject: "{task name from plan}",
  description: "{the complete Phase-A A3 context bundle for this task}",
  activeForm: "{what in-progress looks like}",
  blockedBy: ["{task IDs from this task's `Blocked by` field}"]
})
```

The `description` carries the **entire** A3 bundle — task description, TDD steps, files,
tests, done-when criteria, self-review checklist, specialist guidance, shard learnings,
and any Serena matches. Teammates do **not** re-read shards; everything is injected here.

### T2: Spawn builder teammates

Route each task by its `Specialist` field:

```
Agent({
  name: "{Specialist}",
  subagent_type: "{Specialist}",
  prompt: "{A3 context bundle}\n\n{contents of references/enhanced-builder-prompt.md}"
})
```

`name` makes the teammate addressable by `SendMessage`. `subagent_type` resolves from
`.claude/agents/*.md` by the agent file's `name:` frontmatter field, which equals the
filename stem, which equals the value `/set-plan` tags as `Specialist`. When `Specialist`
is `generic` or absent, omit `subagent_type` and spawn a default builder.

Scale builders by task count: 2–3 tasks → 1 builder; 4–6 → 2; 7+ → 3. Prefer distinct
specialists over duplicate generic builders.

Spawn the QA teammate using `references/enhanced-qa-prompt.md` as its prompt. QA's remit
is unchanged from previous SET versions — it is a peer role, **not** the verifier.

Under `--verbose`, emit `→ spawn {Specialist} :: {task name}` as each builder and the QA
teammate is spawned, and `← {Specialist} :: {pass/fail}` as each reports back.

Read both reference files before spawning anything.

Note: a specialist definition's `skills` and `mcpServers` frontmatter is **not** applied
to teammates — only `tools`, `model`, `permissionMode`, and `maxTurns` carry over.

**Teammates must NOT call `mcp__serena__*`.** Serena runs as a single stdio process with
one global `_active_project` pointer that `activate_project` permanently mutates. All
teammates share that one process, and there is no per-caller isolation. Because the build
runs in a **worktree** — where Serena often starts with no active project — concurrent
`activate_project` calls from teammates can leave another teammate silently querying the
wrong project. Tool calls are serialized (one task-executor thread), so nothing crashes;
you just get wrong answers quietly.

Serena is **lead-only**: Phase A queries it once and injects the results as text into each
task bundle. For code navigation, teammates use Claude Code's **built-in LSP tool**
(via code-intelligence plugins such as `typescript-lsp` or `pyright-lsp`), which is
per-session and therefore safe under parallel teammates.

### T3: Spawn a dedicated verifier per task

Each task gets its **own** verifier teammate, separate from its builder:

```
Agent({
  name: "verifier-{task-id}",
  prompt: "You verify one task. You write NO code — verification only.
           Task: {task name}
           Context: {A3 bundle}
           Rubric: {A4 rubric}
           Return ONLY this JSON: { task, passed, tdd_followed, spec_compliant,
           lint_pass, typecheck_pass, failing_criteria, notes }"
})
```

A verifier writes no code, so it can never verify its own work — this preserves the
fresh-verifier guarantee the workflow path gets from a separate `agent({schema})` call.

Under `--verbose`, emit `→ spawn verifier-{task-id} :: {task name}` at each verifier spawn
and `← verifier-{task-id} :: {passed/failed}` when its verdict returns.

**Concurrency ceiling of 4.** Spawn a verifier when its builder reports the task
complete. If 4 verifiers are already running, queue the rest and spawn as earlier ones
finish. This bounds token cost and file contention on large plans without serializing
verification.

Build-time verification is **self-grading and biased by construction**. It is not the
final word — `/set-review` is the independent audit.

### T4: Coordinate and detect stalls

Poll `TaskList()`. Unblock with **guidance, not code**, via `SendMessage`.

A documented Agent Teams limitation: teammates sometimes fail to mark tasks complete,
which stalls every `blockedBy` dependent. Mitigate:

1. Track consecutive polls where a task stays `in_progress` with no status change.
2. After **3** consecutive unchanged polls, `SendMessage` that teammate for a status report.
3. If still unchanged after **3 more** polls (6 total), mark the task **failed** per the
   A5 escalation policy, recording that it stalled and what it last reported.
4. Independent tasks continue. Only genuine dependents of the stalled task are affected.

Poll-count rather than wall-clock, because legitimate task duration varies widely with
task size.

Cost control: if a teammate loops on the same error 5+ times, `SendMessage` it to stop,
request shutdown, and report the blocker to the user.

### T5: Shut down and wrap up

1. `SendMessage` a shutdown request to each teammate; await acknowledgement. Teammates
   may accept or reject — there is no forced-termination tool.
2. Run the full test suite one final time.
3. Collect the per-task verdicts and hand them to Phase C.
4. Report the worktree location or branch name. Do **not** remove the worktree —
   `/set-review` handles cleanup. Under `--autonomous`, `/set-review` does not clean up
   either; it carries the location forward to `/set-learn`, which hands it to the user in
   the Final Report. Either way, pass the location along.

### Agent Teams limitations to keep in mind

- `/resume` and `/rewind` do **not** restore teammates; there is no session resumption.
- One team per session. Teammates cannot spawn nested teams.
- Task status can lag — mitigated by the T4 stall timeout.
- Permissions are fixed at spawn; all teammates inherit the lead's mode.

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

Under `--verbose`, have the script emit `→ spawn {agentType} :: {task name}` at each
builder and verifier `agent()` call and `← {agentType} :: {passed/failed}` on return.
These lines are the only per-agent output that crosses back — the transcripts still stay
in script variables.

**Same MCP rule as the team path: builders and verifiers must NOT call `mcp__serena__*`.** A dynamic workflow runs many `agent()` calls concurrently against the *same* single Serena process, so it has the identical hazard described in Phase B-team — one shared, mutable `_active_project` pointer with no per-caller isolation, in a worktree where Serena often starts unactivated. Serena is queried once in Phase A (lead) and injected into each task bundle as text. For code navigation, workflow agents use Claude Code's built-in LSP tool.

> SET no longer implements "max 5 retries / escalate after 3." The workflow's native verify-and-revise loop subsumes it. You specified the bar (A4) and the escalation policy (A5); the workflow runs the loop.

## Phase C — Build Gate-Back (you own this)

When the selected execution path returns:

1. Run the full test suite yourself one final time.
2. Present the result at the human gate. Show: tasks passed/failed (from the structured verdicts), the diff stat, and any failed-task escalations.
3. **Frame the verification report as builder self-grading** — useful but biased by construction (a grader checking work produced by the same execution path prefers its own findings). It is never the final word. The independent audit happens in `/set-review`.
4. Report the worktree location or current branch name.
5. Then:

   - **Without `--autonomous`** — suggest: "Run `/set-review` for the independent holistic review, then `/set-learn` to capture learnings."

   - **With `--autonomous`** — do not suggest; after the closing phase-boundary line, chain
     to `/set-review` per the Chaining Contract, passing the branch/worktree location and
     the per-task verdicts. The verification report travels as **claims to audit**,
     exactly as in a supervised run — autonomy does not upgrade self-grading into truth.
     The branch/worktree location must reach the end of the chain: it is reported to the
     user in the Autonomous Final Report as an artifact they own.

If a worktree was created, do NOT remove it — `/set-review` handles cleanup (and under
`--autonomous`, no phase removes it; the user is handed the location instead).
