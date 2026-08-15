# /set-build → Native Agent Teams as Default

**Date:** 2026-07-30
**Status:** Approved
**Scope:** `plugins/set/commands/build.md`, `install.sh`, version metadata, docs
**Version target:** 1.0.1 → 1.1.0

## Problem

Two distinct problems, one of which inverts the original framing of this work.

### 1. The `--use-agent-team` path is dead code

`build.md` implements its Agent Team mode against an API that no longer exists:

| `build.md` line | Call | Status |
|---|---|---|
| 171 | `Teammate({ operation: "spawnTeam", team_name })` | No `Teammate` tool exists in the current harness |
| 199 | `Teammate({ operation: "requestShutdown", target_agent_id })` | `requestShutdown` was never a tool name |
| 200 | `Teammate({ operation: "cleanup" })` | No such call |

`TeamCreate` and `TeamDelete` were removed in v2.1.178. The flag cannot have worked for some time.

### 2. There is no native "coordinator" to adopt

The motivating request was to make `/set-build` use "native Claude skills including the coordinator and agent teams." Verified against current docs: **Claude Code ships no coordinator agent, no coordinator skill, and no agent-teams skill.** The lead session *is* the coordinator. There is nothing to adopt by name.

Adopting "native agent teams" therefore has a concrete and bounded meaning:

- Spawn teammates with the **`Agent`** tool, using `name` to make them addressable
- Coordinate with **`SendMessage`**
- Share state through the task list: **`TaskCreate` / `TaskGet` / `TaskList` / `TaskUpdate`**

Note the inversion: the existing **Workflow path is already correctly native**. It is the agent-team path that is broken. This change fixes that path and promotes it to default, per user decision.

## Decisions

| # | Decision |
|---|---|
| 1 | Agent Team path becomes the **default** for `/set-build` |
| 2 | Workflow path remains **first-class** behind `--use-workflow`, and serves as the fallback |
| 3 | **Phase A stays shared** and harness-agnostic; only Phase B forks |
| 4 | When teams are unavailable, **prompt the user** with two options — never silently degrade |
| 5 | **One dedicated verifier teammate per task** |
| 6 | **Stall timeout** in the lead to prevent `blockedBy` deadlock |
| 7 | `--use-agent-team` becomes a **silent no-op alias** |
| 8 | `install.sh` updated — env var now gates the primary path |
| 9 | Docs updated to describe both build modes |
| 10 | Minor version bump → **1.1.0** |

## Out of Scope

**Explicitly untouched:** `/set-init`, `/set-design`, `/set-plan`, `/set-review`, `/set-learn`, `/set-update`.

The upstream contract is unchanged. `/set-plan` emits tasks tagged with `Specialist`, `Shards`, `Blocked by`, TDD Steps, Files, Tests, Done-when, and a Self-Review Checklist. Both execution paths consume that same brief. Flipping the default changes who *executes* the brief, not how it is *compiled*.

`/set-init` needs no edit. PR #10 established the contract that an agent file's `name:` equals its filename stem, which equals the value `/set-plan` tags as `Specialist`. The team path resolves `subagent_type` from the same registry as `agentType`, so that contract carries over unchanged.

## Architecture

```
Step 0   Resolve Serena state              ─┐
Step 1   Create isolated worktree           │  shared, unchanged
Phase A  Compile build brief                │
         A1 shards → A2 Serena → A3 bundle  │
         A4 rubric → A5 escalation         ─┘

Phase B  ┌── B-team      (default)  ─┐
         └── B-workflow  (fallback) ─┴─→ verdict schema

Phase C  Human gate-back              shared
```

**The seam.** Both Phase-B paths must emit the same per-task verdict:

```json
{
  "task": "string",
  "passed": "boolean",
  "tdd_followed": "boolean",
  "spec_compliant": "boolean",
  "lint_pass": "boolean",
  "typecheck_pass": "boolean",
  "failing_criteria": ["string"],
  "notes": "string"
}
```

Phase C consumes this shape regardless of which path produced it. Keeping Phase A and Phase C genuinely shared is the mechanism that prevents the non-default path from rotting the way `--use-agent-team` did.

## Flags

| Flag | Behavior |
|---|---|
| *(none)* | Agent Team path |
| `--use-agent-team` | Silent no-op alias. Accepted, no warning, no deprecation notice |
| `--use-workflow` | Workflow path |
| `--worktree` / `--no-worktree` | Unchanged |

## Availability Gate

Runs after Phase A, before Phase B. Skipped entirely when `--use-workflow` is passed.

```bash
jq -r '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS // empty' ~/.claude/settings.json
```

If unset or absent, prompt with exactly two options:

1. **Run this build on the Workflow path now** — proceeds immediately; nothing degrades silently
2. **Stop** — print env-var setup instructions

Option 2 must state that **a session restart is required**. The variable is read at session start, so a user who sets it mid-session and retries will still fail. Omitting this produces a confusing second failure.

The answer is **not persisted** to `config.json`. `/set-build` asks each cycle while teams are unavailable.

## Phase B-team

### T1 — Build the task graph

One `TaskCreate` per plan task:

- `description` = the Phase-A context bundle verbatim (task description, TDD steps, files, tests, done-when, self-review checklist, specialist guidance, shard learnings, Serena matches)
- `blockedBy` = the task's `Blocked by` field
- `subject` = task name; `activeForm` = in-progress phrasing

Builders do not re-read shards. All context is injected at task creation.

### T2 — Spawn builders

Route by the task's `Specialist` field:

```
Agent({ name: <Specialist>, subagent_type: <Specialist>, prompt: <bundle + enhanced builder prompt> })
```

`generic` or absent → default builder, no `subagent_type`.

Team scaling by task count: 2–3 → 1 builder; 4–6 → 2 builders; 7+ → 3 builders. Prefer distinct specialists over duplicate generic builders. The QA teammate is retained as its own role and is **not** the verifier.

The enhanced builder prompt (`references/enhanced-builder-prompt.md`) and enhanced QA prompt (`references/enhanced-qa-prompt.md`) remain first-class and are appended at spawn.

### T3 — Verifier teammates (one per task)

Each task gets its own dedicated verifier teammate, spawned separately from its builder.

- Writes **no code** — verification only
- Verifies its task against the **A4 rubric**: TDD discipline, spec compliance, lint/typecheck clean, self-review checklist satisfied
- Emits the verdict schema
- Never verifies work it authored, because it authors none

One-per-task rather than one-shared preserves maximum independence and lets verification run in parallel with other tasks' builders, avoiding a serialized verification bottleneck.

**Concurrency cap.** Builders scale as specced (1–3). Verifiers are spawned per task but bounded by a concurrent ceiling of **4**; when the ceiling is reached, remaining verifiers queue and spawn as earlier ones complete. This bounds token cost and file contention on large plans without serializing verification.

This preserves the Workflow path's fresh-verifier guarantee. It does **not** replace `/set-review`, which remains the true independent audit. Per Phase C, build-time verification is self-grading and biased by construction.

### T4 — Coordinate and detect stalls

The lead polls `TaskList()`, unblocks with **guidance, not code**, via `SendMessage`.

**Stall timeout.** Documented team limitation: teammates sometimes fail to mark tasks complete, which blocks `blockedBy` dependents. Mitigation:

1. Track consecutive `TaskList()` polls where a task remains `in_progress` with no status change
2. After **3** consecutive unchanged polls, `SendMessage` the teammate for a status report
3. If still unchanged after **3 more** polls (6 total), mark the task **failed** per the A5 escalation policy and record the specific stall
4. Independent tasks continue; only genuine dependents of the stalled task are affected

Poll-count based rather than wall-clock, since legitimate task duration varies widely by task size.

Cost control retained: a teammate looping on the same error 5+ times is messaged to stop, shut down, and reported to the user.

### T5 — Shutdown and wrap-up

1. `SendMessage` a shutdown request to each teammate; await acknowledgement. Teammates may accept or reject
2. No `Teammate` calls. No `cleanup` call — neither exists
3. Run the full test suite one final time
4. Report worktree location or branch name
5. Leave the worktree in place — `/set-review` handles cleanup
6. Suggest `/set-review`, then `/set-learn`

### Documented limitations (recorded inline in `build.md`)

- `/resume` and `/rewind` do not restore teammates; no session resumption
- One team per session; teammates cannot spawn nested teams
- Task status can lag — mitigated by the T4 stall timeout
- Permissions are fixed at spawn; all teammates inherit the lead's mode

## Phase B-workflow

Unchanged from current `build.md` Phase B. Retained verbatim as a first-class path: dependency-respecting `pipeline()`/`parallel()`, one builder `agent()` per task routed by `agentType`, fresh verifier `agent({schema})` per task, A5 escalation, returns diff plus verdict array.

## Phase C

Unchanged. Run the full suite, present at the human gate with tasks passed/failed, diff stat, and escalations. Frame build-time verification as **self-grading — useful but biased by construction**; the independent audit is `/set-review`.

## install.sh

**Step 2 (lines 150–166).** Reframe from "optional build mode" to required-for-default. Update the header, the explanatory comment, and both `info` messages.

**Verify block (lines 285–289).** Promote `warn` to `error` with `ERRORS=$((ERRORS + 1))`. A missing env var now breaks the primary path and must fail verification.

No change to the command install mechanism. `install_file` copies from `plugins/set/commands/` — confirmed no heredocs remain, so the plugin files are genuinely the single source of truth. The historical duplication trap does not apply.

## Docs

Invert the "dynamic workflow is the default" framing, and add a build-modes section covering both paths, the env-var requirement, and when to prefer Workflow.

| File | Lines |
|---|---|
| `docs/getting-started.md` | 18, 20, 22, 32, 46, 76 |
| `docs/commands.md` | 53, 55 |
| `docs/workflow.md` | 17 |
| `docs/learning-loop.md` | 81 |
| `docs/executive_summary.md` | 9, 13, 101 |
| `README.md` | 5, 43, 82, 128 |

## Version

1.0.1 → **1.1.0** in three locations:

- `plugins/set/.claude-plugin/plugin.json` (`version`)
- `.claude-plugin/marketplace.json` (lines 9 and 17)

Also refresh `plugin.json`'s `description`, which currently describes dynamic-workflow execution as primary with Agent Team as parenthetical.

## Testing

No test tooling exists — this repo is markdown command specs and a bash installer, and CLAUDE.md documents no build, test, or lint tooling. Verification is by contract inspection:

1. Every tool name in B-team exists in the current harness — no `Teammate`, no `spawnTeam`, no `requestShutdown`, no `cleanup`
2. Both Phase-B paths emit the identical verdict schema
3. `Specialist` → `subagent_type` registry contract intact (PR #10)
4. `install.sh` command-copy path unchanged; all 7 commands still install
5. Phase A and Phase C contain no harness-specific branching
6. Upstream commands unmodified — `git diff` touches no `init.md`, `design.md`, or `plan.md`

## Risks

| Risk | Mitigation |
|---|---|
| Agent Teams remain experimental; API may shift again | Workflow path stays first-class and current, not a stub |
| Default path now requires an env var | Availability gate prompts with a working alternative |
| Existing installs lack the env var | Runtime detection, not install-time assumption |
| Peer messaging causes convergence/groupthink | Verifiers write no code; `/set-review` remains the independent audit |
| Two paths drift | Shared Phase A and Phase C; verdict schema as enforced seam |
