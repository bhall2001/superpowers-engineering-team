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

- **Default (no flag)** → the **Agent Team path** (Phase B-team). Requires
  `CLAUDE_CODE_ENABLE_TODO_TOOLS` and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`; see
  "Agent Team Availability Gate". If they are missing, the build **halts** — it never
  falls back to the workflow path.
- **`--use-workflow`** → the **dynamic-workflow path** (Phase B-workflow). Skips the
  availability gate entirely.
- **`--use-agent-team`** → accepted as a **silent no-op alias** for the default.
  Do not warn, do not print a deprecation notice — it simply selects the default path.
- `--autonomous` / `--verbose` — parse and strip per
  `~/.claude/commands/references/autonomous-mode.md`.
- **`--resume {run-id}`** → resume a crashed run instead of starting a new one. See
  "Resuming a Crashed Run". Parse and strip it like the others; the remainder is still the
  feature name.

**Emit phase-boundary lines on every run**, with or without `--autonomous`, in the
Verbosity Levels format from that reference: the `▶ SET build — starting` line once flags
are parsed, and the `◀ SET build — {tasks passed/failed}, {diff stat}` line at the end of
Phase C. Under `--autonomous` the same lines carry the chain annotation and `[n/N]`;
without it, omit both. Emit each line once per run. The `--autonomous`-only reports below
(worktree dir default, failing baseline, Agent Teams unavailable) are annotations on that
one opening line, not extra boundary lines.

## Before Starting

1. Look for a plan in `.claude/plans/`. If none exists, tell the user to run `/set-plan` first.
2. Read the plan thoroughly. Also read the linked design spec if referenced.
3. Read CLAUDE.md — especially Build Commands and conventions.
4. Read `.claude/set/taxonomy.md` for the valid shard domains. Do NOT load all shard contents up front — shards are loaded per-task in Phase A.
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
shards by keyword-scanning them directly. Shards are plain markdown on disk, so this
works everywhere — including walled environments with no network and no MCP server.
It is optional and never blocks the build.

1. Derive 3-6 distinctive keywords from the task's `What` + `Done when` (skip generic
   verbs like "add", "update", "fix"; keep domain nouns, API names, error strings).
2. Scan shards **not** already loaded in A1:
   ```bash
   grep -rin -A 3 -e '{keyword1}' -e '{keyword2}' .claude/set/learnings/ | head -60
   ```
3. Keep entries whose match is substantive, not incidental. Cap at top 5.

Dedupe against shards already loaded in A1. If nothing is found, omit the section from
the bundle entirely — an empty heading is noise that costs every builder tokens.

### A3: Assemble the per-task context bundle
```
{full task description from plan, INCLUDING TDD Steps, Files, Tests, Done-when, and Self-Review Checklist}

## Specialist guidance
Read `.claude/agents/{Specialist}.md` and use it as base context for this task.
(If Specialist is "generic" or absent, no agent file — use general best practices.)
NOTE: a specialist definition's `skills`/`mcpServers` frontmatter is NOT auto-applied to
spawned agents. The learnings you need are already injected below. For code navigation,
use Claude Code's built-in LSP tool.

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
jq -r '.env.CLAUDE_CODE_ENABLE_TODO_TOOLS // empty' ~/.claude/settings.json
jq -r '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS // empty' ~/.claude/settings.json
```

**`CLAUDE_CODE_ENABLE_TODO_TOOLS` is the variable that registers the task tools.**
Verified by nonce test on 2.1.233: with only `EXPERIMENTAL_AGENT_TEAMS` set, a session
reports the task tools do not exist; with `TODO_TOOLS` it creates a task and reads back
its id. `CLAUDE_CODE_ENABLE_TASKS` looks like the obvious lever and does **not** work.
Through SET 1.3.3 the gate read `EXPERIMENTAL_AGENT_TEAMS` alone, so it passed while the
tools were absent and every build fell through to the workflow path.

Registration is also **session-scoped**, not purely settings-scoped: the same
`settings.json` can yield working tools in one session type and absent tools in another.
So the settings read above is necessary but not sufficient — always confirm the tools are
callable.

**The task tools are usually deferred, not absent.** In most sessions `TaskCreate`,
`TaskList`, `TaskUpdate`, and `TaskGet` are listed by name with no schema loaded, so
calling one directly fails until you fetch it:

```
ToolSearch("select:TaskCreate,TaskList,TaskUpdate,TaskGet")
```

Then call `TaskList` once. It returns `No tasks found` on an empty list — that is success,
not a failure.

**`No matching deferred tools found` is a query miss, not a verdict on the harness.**
`ToolSearch` returns it when the *query* matched nothing — a bare tool name instead of the
`select:` form, a typo, stray spaces around the commas. It does **not** mean the build
lacks Agent Teams. Re-issue the query in exactly the form above before concluding
anything; a malformed probe that silently downgrades the build to the workflow path is
indistinguishable, in the final report, from a harness that genuinely cannot run one.

Treat Agent Teams as unavailable only when the `select:` query above returns no tools
**and** `TaskList` cannot be called. Report which of the two checks failed — the env var
or the tool probe — so the cause is not guessed at later.

Neither check is about the Claude Code version or anything installable: the task tools
ship with the CLI. In a container, `~/.claude/settings.json` is the container's own file
(often seeded at first run and persisted on a volume), so read the env vars there rather
than assuming the host's copy applies. "Install something" is never the fix.

### When the tools are unavailable, STOP. Do not fall back.

`/set-build` is an Agent Team build. If the task tools are not callable, **halt with the
remediation below** — under `--autonomous` too. Do not offer the workflow path, do not
switch to it, do not ask which the user prefers.

Falling back is worse than failing. The two paths are not interchangeable: an Agent Team
gives each specialist its own context, its own judgment, and the ability to message a peer
and re-scope mid-task. A workflow DAG is fixed at authoring time. Quietly substituting one
for the other returns a different, lesser artifact under the same name — and that is
exactly how SET shipped 1.3.3 with an availability gate that passed while the tools were
absent, so **every** build ran on the workflow path and nobody noticed for weeks.

A user who wants the workflow path asks for it explicitly with `--use-workflow`. That is
the only way it runs.

Print this and stop:

```
/set-build cannot run: the Agent Team task tools are not available.
Failed check: {CLAUDE_CODE_ENABLE_TODO_TOOLS not set | tools did not resolve in this session}

Add BOTH to ~/.claude/settings.json:

  "env": {
    "CLAUDE_CODE_ENABLE_TODO_TOOLS": "true",
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }

Then RESTART your session — these are read at session start, so setting them
now will not take effect in this one. Re-run /set-build after restarting.

CLAUDE_CODE_ENABLE_TODO_TOOLS is the one that registers TaskCreate/TaskList/
TaskUpdate/TaskGet. CLAUDE_CODE_ENABLE_TASKS is NOT the right variable.
```

Name the failing check — the settings read and the session probe have different fixes,
and a user told only "unavailable" will edit `settings.json` for a problem that was never
there. If the settings already hold both variables and the tools still do not resolve,
say so plainly: that is a session-scoped registration failure, and a restart is the fix,
not another settings edit.

The restart line is required. Without it a user sets the variables, retries in the same
session, and hits the identical failure.

Do not persist the answer to `config.json`. This gate asks each cycle while
Agent Teams are unavailable — the choice is not persisted between runs.

## Phase B — Fork by Execution Mode

Phase A above and Phase C below are **shared and harness-agnostic** — they run
identically regardless of path. Only this phase forks:

- **Default** → Phase B-team (native Agent Team)
- **`--use-workflow`** → Phase B-workflow. **Only** an explicit flag reaches this path;
  the availability gate never routes here.

Both paths must emit the **identical per-task verdict schema**:

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
and any A2 keyword matches. Teammates do **not** re-read shards; everything is injected here.

### T2: Spawn builder teammates

Route each task by its `Specialist` field:

```
Agent({
  name: "{Specialist}-set",
  subagent_type: "{Specialist}",
  prompt: "{A3 context bundle}\n\n{contents of references/enhanced-builder-prompt.md}"
})
```

`name` makes the teammate addressable by `SendMessage`. That is the **only** reason to
pass it. The `-set` suffix marks the spawn as SET's own — the marker SET controls rather
than observes (`$CLAUDE_CODE_AGENT_NAME` is never set in hook subprocesses; the payload's
`agent_type` carries the `name` verbatim). It is corroborating evidence for SET's hooks
and legible in transcripts; it never grants anything — see
`references/agent-return-channels.md`. Naming comes at a price: a named spawn's tool result is a mailbox receipt, not
the agent's output. A builder is named because the coordinator talks to it and reads its
progress from the task list — **never** expect a builder's work product to arrive as the
`Agent` call's return value. Contrast T3, where the verifier's whole purpose is to return
a verdict and therefore must be spawned unnamed.

`subagent_type` resolves from
`.claude/agents/*.md` by the agent file's `name:` frontmatter field, which equals the
filename stem, which equals the value `/set-plan` tags as `Specialist`. When `Specialist`
is `generic` or absent, omit `subagent_type` and spawn a default builder.

Scale builders by task count: 2–3 tasks → 1 builder; 4–6 → 2; 7+ → 3. Prefer distinct
specialists over duplicate generic builders.

Spawn the QA teammate using `references/enhanced-qa-prompt.md` as its prompt, with
`name: "qa-specialist-set"` — it is a peer you `SendMessage`, so it is named, and it
carries the same `-set` suffix as every other SET teammate. QA's remit is unchanged from
previous SET versions — it is a peer role, **not** the verifier.

Under `--verbose`, emit `→ spawn {Specialist}-set :: {task name}` as each builder and the QA
teammate is spawned, and `← {Specialist}-set :: {pass/fail}` as each reports back — where
"reports back" means a `TaskUpdate` status change or a `SendMessage`, not a return value
from the `Agent` call, which for a named spawn never carries one.

Read both reference files before spawning anything, plus
`references/agent-return-channels.md` — it governs which spawns may carry a `name` and is
binding on T2 and T3 below.

Note: a specialist definition's `skills` and `mcpServers` frontmatter is **not** applied
to teammates — only `tools`, `model`, `permissionMode`, and `maxTurns` carry over.

Learnings reach teammates as text in the A3 task bundle; they do not retrieve anything
themselves. For code navigation, teammates use Claude Code's **built-in LSP tool** (via
code-intelligence plugins such as `typescript-lsp` or `pyright-lsp`), which is
per-session and therefore safe under parallel teammates.

### T3: Spawn a dedicated verifier per task

Each task gets its **own** verifier, separate from its builder:

```
Agent({
  subagent_type: "{a specialist that did NOT author this task, or general-purpose}",
  prompt: "You verify one task. You write NO code — verification only.
           Task: {task name}
           Context: {A3 bundle}
           Rubric: {A4 rubric}
           Return ONLY this JSON: { task, passed, tdd_followed, spec_compliant,
           lint_pass, typecheck_pass, failing_criteria, notes }"
})
```

**Never pass `name` to a verifier spawn.** A named `Agent` call returns a mailbox
receipt — `Spawned successfully … will receive instructions via mailbox` — instead of the
agent's final message, so the verdict never reaches you. An unnamed spawn returns the
agent's output as the tool result, which is the only supported way to collect it:
`TaskOutput` is documented as deprecated for agent tasks, and its `.output` file is a
symlink to the raw transcript that would overflow this context. The rule generalizes —
**name an agent only when you intend to `SendMessage` it; never when you need its
result.**

A verifier writes no code, so it can never verify its own work — this preserves the
fresh-verifier guarantee the workflow path gets from a separate `agent({schema})` call.

Under `--verbose`, emit `→ spawn verifier-{task-id} :: {task name}` at each verifier spawn
and `← verifier-{task-id} :: {passed/failed}` when its verdict returns. `verifier-{task-id}`
is the label you print, not the agent's `name` — see above.

**Concurrency ceiling of 4.** Spawn a verifier when its builder reports the task
complete. If 4 verifiers are already running, queue the rest and spawn as earlier ones
finish. This bounds token cost and file contention on large plans without serializing
verification.

Build-time verification is **self-grading and biased by construction**. It is not the
final word — `/set-review` is the independent audit.

### T4: Coordinate and detect stalls

Poll `TaskList()`. Unblock with **guidance, not code**, via `SendMessage`.

**First, rule out a self-inflicted stall.** If you are waiting on a *return value* from a
named spawn, it is never coming — that is the receipt behavior described in T2/T3, not a
stalled teammate, and no amount of polling will resolve it. Re-read where the result is
supposed to arrive: a named teammate reports through `TaskUpdate`/`SendMessage`; an
unnamed one-shot agent reports through the `Agent` tool result.

Beyond that, a documented Agent Teams limitation: teammates sometimes fail to mark tasks
complete, which stalls every `blockedBy` dependent. Mitigate:

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
2. **Spawn one builder `agent()` per task**, passing `agentType` = the task's `Specialist` (omit / generic builder when "generic"). Inject the task's Phase-A context bundle as the prompt. Instruct the builder to run the TDD loop (red → green → refactor → lint → typecheck → self-review) and commit when its work is coherent — **not** one forced commit per task, since you also take checkpoint commits and the two would split or duplicate each other.
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

**Same rule as the team path:** learnings are compiled once in Phase A and injected into each task bundle as text; workflow agents retrieve nothing themselves. For code navigation they use Claude Code's built-in LSP tool.

> SET no longer implements "max 5 retries / escalate after 3." The workflow's native verify-and-revise loop subsumes it. You specified the bar (A4) and the escalation policy (A5); the workflow runs the loop.

## Checkpoints — Making the Run Resumable

You take **checkpoint commits** as the build proceeds. They are the only thing that makes a
crashed run resumable: a task is durable when a checkpoint on the branch names it, not when
its verdict says it passed.

**Read `references/run-store.md` before your first checkpoint.**

### How to take one

Checkpoints are taken by the CLI, never by hand-written git commands — it writes the
commit *and* the store row together, with the trailers resume depends on. A plain
`git commit -m "checkpoint"` produces no trailers, and every resume then finds an empty
skip set with no error surfaced.

```bash
SET_RUN=~/.claude/set-runs/bin/set-run

# once, at build start (records the run, returns run_id)
# --pid must be YOUR session's pid, not the CLI's — the CLI exits immediately, so
# recording its pid would make every liveness probe report the run crashed.
"$SET_RUN" init --worktree "$(git rev-parse --show-toplevel)" --branch "$(git branch --show-current)" \
                --plan .claude/plans/{feature}.md --pid $PPID

# after each verdict returns
"$SET_RUN" task --run {run-id} --task T-{slug} --status passed|failed

# at a checkpoint — --files is REQUIRED and is the union of the `Files` field of
# every task captured so far. Without it the checkpoint refuses ("no-file-scope").
# A directory scope MUST end in `/` — `src/lib` matches nothing, `src/lib/` matches
# everything beneath it.
"$SET_RUN" checkpoint --run {run-id} --phase {phase} --reason phase-boundary|judgment|backstop \
                      --files "src/a.ts,src/b.ts,tests/a.test.ts"

# when you decline one — records why, so a long gap is diagnosable
"$SET_RUN" checkpoint --run {run-id} --phase {phase} --decline --rationale "2 trivial tasks"

# is the 30-minute backstop due?
"$SET_RUN" due --run {run-id}

# forgot the run id? it is the resume key
"$SET_RUN" list

# at the end
"$SET_RUN" release --run {run-id}
```

Run these **from the repo root**. The `set-run` shim is generated by `install.sh` with
whatever `node:sqlite` needs on this machine already baked in — invoke it, not `node`
directly. Every command prints JSON; a non-zero exit means the store write failed, so
report it rather than continuing silently.

**Report the `run_id` to the user as soon as `init` returns.** It is the only key to
`--resume`, and a crash before you surface it leaves the id in lost conversation context.
`set-run list` recovers it, but only if someone knows to look.

**A checkpoint commits only the files you scope it to.** It never runs `git add -A` — the
build shares the human's worktree, and sweeping it would commit their unignored
`.env.local`, their scratch notes, and any other worktree lying under the root. Pass
`--files` as the union of the `Files` field from every task the checkpoint is capturing.

Two results to handle rather than ignore:

- `"reason": "partial-staging"` — a human has content staged that this run did not create
  (mid `git add -p`). The checkpoint refuses instead of folding their unstaged hunks into
  it. Report the paths and carry on without a checkpoint; do not `git add` anything.
- `"foreign": [...]` on success — changed files outside your scope, left uncommitted.
  **Check this every time, and do not treat it as informational.** A file the plan did not
  list is not committed, so it is not durable — while the task's slug still goes into
  `SET-Tasks` and will be skipped on resume. That is the one way this design can skip a
  task whose work is absent.

  If a `foreign` path is plausibly a task's own output (a new module, a test file, a
  generated artifact a builder created), the plan's `Files` was wrong. Either re-run the
  checkpoint with that path included in `--files`, or report it prominently in the build
  report so the human knows that task's work is not protected. A `foreign` list containing
  only the human's own edits is the normal, harmless case.

What you must do:

**At every phase boundary — mandatory.** All tasks have returned, the tree is coherent.
Never skip this one.

**Within a phase — your judgment.** When a batch of parallel tasks returns verdicts and the
work has reached a meaningful point, commit. This is the part no rule can decide for you,
so here is the calibration:

*Take a checkpoint:*
- Three builders returned passing verdicts and their work compiles together — the natural
  "this much is done" moment.
- A task finished that everything downstream depends on (the schema, the shared type, the
  new module's public surface). Losing it costs the most.
- A long-running task just returned after 20+ minutes of work.
- You are about to start something risky — a large refactor, a dependency bump — and want a
  clean point to reason from.

*Decline, and record why:*
- Two trivial tasks returned (a docs tweak, a comment fix) and the last checkpoint was
  four minutes ago. Record: `2 trivial tasks, cheap to redo`.
- A batch returned but half its tasks failed; the tree is mid-repair. Record:
  `batch incoherent, 2 of 4 failed`.
- You checkpointed 90 seconds ago and nothing material changed since.

**Never mid-task.** Only at a verdict-return boundary. Committing while a builder is
writing captures a half-written file.

**The 30-minute backstop.** If 30 minutes pass with no checkpoint, the next verdict return
takes one regardless of judgment — worst-case loss is 30 minutes plus one task. Read
`checkpoint_backstop_minutes` from `.claude/set/config.json` if set.

**Record declined checkpoints too.** A checkpoint you considered and skipped is written
with `taken = 0` and a one-line rationale. This is what makes a 40-minute gap diagnosable
instead of looking like you forgot.

**In-phase checkpoints may capture in-flight work**, including files that do not parse.
That is accepted — the alternative needs per-task file attribution, which does not work
under parallel builders. A resumed run must expect baseline tests to fail for reasons
unrelated to any task, and must report that as a resumed-from-partial-checkpoint condition,
not a task regression.

**Ticking the plan.** After each verdict returns, update the plan's `## Progress` section.
At verdict time there is no checkpoint number yet, so write it without one:

```
- [x] T-{slug} — passed {ISO time}                    ← verified, not yet durable
- [x] T-{slug} — passed {ISO time} (checkpoint 3)     ← after a checkpoint captures it
- [ ] T-{slug} — failed {ISO time}: {one-line reason}
```

Add the `(checkpoint n)` annotation to the tasks a checkpoint just captured — the CLI
returns their slugs in its `tasks` array. A tick without one means "verified but not yet
durable", which is exactly what resume will re-dispatch.

This is human-facing status only — nothing parses it. Builders never edit the plan file.

## Resuming a Crashed Run

### What runs and what is skipped

`--resume` enters differently from a fresh build. Explicitly:

| Section | On `--resume` |
|---|---|
| Before Starting (plan, CLAUDE.md, agents) | **Runs** — you still need the plan and the agent roster |
| Resolve Worktree Mode + Step 1 (create worktree) | **SKIPPED** — the worktree already exists; `git worktree add` on an existing branch fails |
| 1d/1e (install deps, baseline tests) | **Runs**, as resume step 4 below |
| Agent Team Availability Gate | **Runs**, unless `--use-workflow` was passed |
| Phase A (compile the brief) | **Runs** — but only for tasks being re-dispatched |
| Phase B / C | Normal |

Resume steps 1-3 run **before** Phase A, since Phase A only needs briefs for tasks that
survive the skip set.

With `--resume {run-id}`, you rebuild state instead of starting fresh. In order:

Steps 1-3 are one CLI call — it asserts location, claims the worktree, and returns the
skip set:

```bash
node ~/.claude/set-runs/bin/set-run.mjs resume --run {run-id} --tasks T-a,T-b,T-c
```

Pass every task slug from the plan, comma-separated. It returns `durable`, `redispatch`,
`unknown`, `reverted`, `rewritten`, `checkpoint_sha`, and `dirty_files`.

1. **Assert location.** Compares `git rev-parse --show-toplevel` (resolved through
   symlinks — `/tmp` is `/private/tmp` on macOS) against the run's `worktree_path`, and
   the current branch against its `branch`. Wrong worktree, wrong branch, and detached
   HEAD each refuse with a distinct message. A non-zero exit here means **stop** — a
   resume in the wrong repo dispatches builders onto whatever branch is checked out.
2. **Claim the worktree.** If a live run holds it, the call refuses and names the holder;
   report that plus `node ~/.claude/set-runs/bin/set-run.mjs release {run-id}`.
3. **Skip set** comes back in `durable`. An amended or rebased checkpoint still resolves —
   a stale sha appears in `rewritten` as advisory, never a refusal. A reverted checkpoint
   appears in `reverted` and its tasks move to `redispatch`. Slugs in `unknown` were
   committed but are absent from the current plan: report them, schedule nothing.
4. **Run setup before anything else** — dependency install and baseline tests. An
   interrupted install may have left dependencies half-written. Re-run the Agent Team
   Availability Gate; it is deliberately not persisted.
5. **Re-dispatch everything not in the skip set**, including tasks whose verdict says
   `passed` but that no checkpoint captured. Their work may be on disk, uncommitted; that
   is not durable.
6. **Leave the tree dirty.** Never reset, stash, or discard — it is the record of where the
   team broke. Brief each re-dispatched builder with the advisory diff since the last
   checkpoint, and tell it explicitly that the tree already contains partial work. Hand any
   prior `tasks/<task-id>.md` notes over labeled as **unverified claims**.
7. **Rewrite the plan's Progress section** so the human sees true state immediately.

**Autonomy is never persisted.** `--resume` alone runs supervised. Resuming an autonomous
run requires `--autonomous` again, explicitly — a stale run record can never silently
re-enter autonomous mode.

The counts are not known when the `▶` line is emitted (flags are parsed before step 3), so
report them as an **annotation** on that line once step 3 returns — the same treatment as
the other `--autonomous`-only reports: `Resumed {run-id} — {n} tasks durable, {m} to
re-dispatch`. Do not emit a second boundary line.

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
