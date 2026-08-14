# SET Run Store — Durable Autonomous Runs

Cited by `/set-build` and `/set-plan`. This file is the single definition of the run
store and the resume contract; the commands do not restate it.

Design rationale: `docs/superpowers/specs/2026-08-14-durable-autonomous-runs-design.md`.

## What is durable

**A task is durable when a checkpoint commit on the current branch names it.** Not when a
verdict says it passed, not when the files are on disk.

Three artifacts, three roles, no overlapping claims:

| Artifact | Owner | Role | Read at resume? |
|---|---|---|---|
| Checkpoint commits | orchestrator | Authoritative completion record | **Yes — drives the skip set** |
| Plan file checkboxes | orchestrator | Human-readable status | No — never parsed |
| `runs.db` | orchestrator + agents | Liveness, worktree exclusion, checkpoint log | Yes — mechanics only |

The DB and git can disagree: a task verified after the last checkpoint is `passed` in the
store and **not** durable. Git wins. That case is normal, not an error — it means the work
is on disk but uncommitted, so resume re-dispatches it.

## Layout

```
~/.claude/set-runs/
  runs.db                          the store (SQLite, WAL)
  <project-slug>/<run-id>/
    tasks/<task-id>.md             agent scratch — advisory, never parsed
```

The store lives **outside** the worktree. `takeCheckpoint` also excludes `runs.db` by
pathspec, so a stray copy inside a repo is never swept into a checkpoint.

## Requirements

`node:sqlite` — stable on Node 24, behind `--experimental-sqlite` on Node 22. `install.sh`
probes once and records the flag in `.claude/set/config.json` as `sqlite_flag` if needed.
If neither works, durable runs are unavailable and the rest of SET is unaffected.

> **Build status.** `plugins/set/bin/` is implemented and tested. The orchestrator side —
> checkpoint policy in `build.md`, `sqlite_flag` in `install.sh` — is not yet wired, so
> `checkpoint_backstop_minutes` and `sqlite_flag` describe the intended contract rather
> than shipped behavior. Remove this note when both land.

## Schema

`plugins/set/bin/schema.sql`. Pragmas on every connection: `journal_mode = WAL`,
`busy_timeout = 5000`, `synchronous = NORMAL`, `foreign_keys = ON`.

`PRAGMA user_version` gates migrations. A store stamped newer than the code understands is
**refused without being written to** (`SchemaVersionError`).

| Table | Purpose |
|---|---|
| `run` | One row per run: worktree, branch, plan, status, `session_pid`, `hostname` |
| `checkpoint` | One row per checkpoint, taken **or declined** |
| `task` | Per-task status, verdict JSON, `captured_seq` |
| `agent_log` | Append-only agent scratch; never read for control flow |

Two rules are constraints, not prose:

- **`one_live_run_per_worktree`** — partial unique index over `status = 'running'`. Two
  live runs in one worktree are unrepresentable; crashed and complete runs free the slot.
- **`checkpoint` CHECK** — a taken checkpoint carries a sha; a declined one must not.

## Task identity — stable slugs

`/set-plan` assigns each task a slug derived from its **title**, not its position:

- `T-` prefix, kebab-case, lowercase, non-alphanumerics collapsed to `-`, capped at 40
  characters.
- **On collision, append a 3-character content hash of the full untruncated title** —
  never an ordinal. An ordinal is assigned by position, so re-planning in a different
  order swaps which task owns `-2`, and a trailer naming it then resolves to the wrong
  work.
- A task whose title is unchanged keeps its slug across re-planning. A **re-titled** task
  is a new task and gets a new slug — correct, since its work changed, but it will
  re-dispatch.

The slug is the identity everywhere: plan heading, Progress line, `SET-Tasks:` trailer,
`task.task_id`, `verifier-{task-id}`.

## Checkpoint policy

**Mandatory at every phase boundary** — phase transitions are sync points where the tree
is coherent.

**Judgment within a phase** — the orchestrator commits when a batch of parallel tasks
returns verdicts and the work has reached a meaningful point.

**Backstop:** if `checkpoint_backstop_minutes` (default 30) elapse with no checkpoint, the
next verdict return takes one regardless. Worst-case loss is the backstop interval plus one
task. Configurable in `.claude/set/config.json`.

**Declined checkpoints are recorded** (`taken = 0`, with a rationale). A long gap is then
diagnosable rather than mysterious, and `/set-learn` can tune the default from real gaps.

**In-phase checkpoints capture in-flight work.** Under parallel builders, "a verdict
returned" and "no builder is mid-write" are different moments, so a checkpoint may commit
a half-written file. Scoping the commit to one task's files would need attribution, which
this design abandons deliberately. Consequence: a resumed run may find its baseline tests
failing for reasons unrelated to any task, and must report that as a
resumed-from-partial-checkpoint condition rather than a task regression.

### Commit format

```
checkpoint: {phase} — {n} tasks complete

SET-Run: {run_id}
SET-Checkpoint: {sequence}
SET-Tasks: {slug},{slug},...
```

`SET-Tasks` names every task whose verdict returned and that no earlier checkpoint
captured.

**Membership is explicit `captured_seq` marking — never a timestamp comparison.** A
verdict landing in the same instant as a checkpoint is lost by a strict `>` (absent from
that trailer, not strictly greater for the next) and double-counted by `>=`. Each task
stays pinned to the checkpoint that *first* captured it.

**Order: commit first, then write the row.** A crash between them leaves a correct skip set
(git-derived) and loses only a diagnostic row. The reverse order would leave a row claiming
a checkpoint that does not exist.

## Reading the skip set

`resolveSkipSet(cwd, runId)` walks the **current branch** for commits carrying
`SET-Run: {run_id}` and collects their `SET-Tasks:` slugs.

- **Trailers are parsed with `%(trailers:key=…)`**, never `git log --grep`. A grep matches
  the whole message, so a commit body quoting `SET-Tasks: T-x` in prose would resolve as
  if it were a trailer.
- **Stored shas are not a gate.** Amend, rebase, and squash rewrite shas while preserving
  trailers, and commits belong to the human. A stale sha is reported as `rewritten`
  (advisory), never a refusal. Gating on it would brick a resume after `git commit --amend`.
- **Ancestry is still required** — every counted commit must be an ancestor of `HEAD`.
  This rejects a sha from an abandoned parallel branch, which `git cat-file -e` would
  wrongly accept.
- **Reverted checkpoints are subtracted.** A revert adds a commit; it does not remove one,
  so the checkpoint stays reachable with its trailer intact while its work is gone.
  `resolveSkipSet` scans for `This reverts commit {sha}` and drops those slugs.

**Not detected:** a manual undo committed as ordinary edits. `/set-review` is the audit
that catches it.

## Resume protocol

1. **Assert location** — `git rev-parse --show-toplevel` must equal `worktree_path`
   (realpath'd), and the current branch must equal `branch`. Wrong worktree, wrong branch,
   and detached HEAD each refuse with a distinct message. Without this, a user who crashed,
   `cd`'d back to the main repo, and resumed would get builders committing to `main`.
2. **Probe liveness, then claim atomically.** The **caller** decides liveness —
   `process.kill(pid, 0)`, plus `updated_at` older than 15 minutes — and passes the dead-run
   list into one `BEGIN IMMEDIATE` transaction. The transaction never decides liveness
   itself, or two racing resumes both conclude the slot is free. Each clear is conditional
   on the `updated_at` seen at probe time, so a run that revived in between keeps its slot.
3. **Build the skip set** (above).
4. **Run setup** — dependency install and baseline tests. An interrupted install may have
   left dependencies half-written. Re-run the Agent Team availability gate; it is
   deliberately not persisted.
5. **Re-dispatch everything not in the skip set**, including tasks marked `passed` after
   the last checkpoint.
6. **Leave the tree dirty.** Never reset, stash, or discard — it is the forensic record of
   where the team broke. Brief re-dispatched builders with the advisory diff
   (`git diff --name-only <checkpoint>` **plus** `git ls-files --others --exclude-standard`;
   `git diff` alone misses newly created files) and label prior `tasks/<id>.md` scratch as
   **unverified claims**, not context.
7. **Rewrite the plan's Progress section** from `task` rows annotated with skip-set
   membership — not from the skip set alone, which holds only slugs and would discard
   verdict timestamps and failure notes.

**Slugs committed but absent from the plan** are reported, not scheduled. A re-planned file
may have dropped or renamed a task; its work stays committed, but nothing schedules it.

## Autonomy is never persisted

No column encodes `--autonomous`. Resuming an autonomous run requires the flag again,
explicitly; without it, resume runs supervised. A stale store can never silently re-enter
autonomous mode.

## Failure is one-directional

A missed `task` write or checkbox tick costs nothing — the skip set comes from git. A
missed checkpoint means tasks re-dispatch that were already complete: redundant work, never
lost work.

The inverse — skipping a task that was not done — requires a commit whose `SET-Tasks`
trailer names it **and whose work is still present**. Commit existence alone is not
sufficient, which is why the revert scan exists.

## Tests

```bash
node --test "plugins/set/tests/*.test.mjs"
```

The quotes matter: Node resolves a bare directory as a module, not a glob root. **No CI
runs this suite** — it is contributor-run, so green means someone ran it, not that it is
enforced.
