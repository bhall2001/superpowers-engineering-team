# Durable Autonomous Runs — Design

**Date:** 2026-08-14
**Status:** Design (autonomous — not human-approved)
**Author:** Claude (autonomous `/set-design`)
**Revision:** 8 — checkpoint commits; skip set from trailers; revert-aware

## Problem

`--autonomous` chains five phases without human gates. Its state lives only in
conversation, by design:

> No state is written to disk. The flags live in the conversation only, so a later
> manual `/set-build` can never be silently auto-chained. Autonomous runs are
> therefore NOT resumable after a crash.

That safety property is worth keeping. The cost is not: a chain that dies in
`/set-build` at task 6 of 8 loses six tasks of work, and recovery is a manual re-invoke
that redoes it.

## What six revisions established

Revisions 1-5 each failed on the same defect in a new costume: **a completion signal
whose derivation was never verified to be possible.**

| Rev | Signal | Why it failed |
|---|---|---|
| 1 | commit sha per task | No mechanism to obtain the sha; `git log -1` misattributes under parallel builders |
| 2 | sha + `SET-Task:` trailer | `git log --grep` matches body prose, not the trailer block |
| 3 | (patched rev 2) | Per-run lock could not exclude a *different* run from one worktree |
| 4 | per-task file fingerprint | A fresh verifier cannot attribute files in a shared dirty worktree |
| 5 | fingerprint + plan disjointness | The plan rule runs the wrong direction; `start_sha` is run-level so every task enumerates the same diff |

The root cause: **any design that measures a shared mutable worktree per-task will
conflate concurrent writers.** That is a property of the execution model, not something a
specification can write around. `enhanced-builder-prompt.md:47` settles it — *"If you need
to modify a file another teammate is working on, message them FIRST"* — a coordination
rule that exists because concurrent builders share files.

Revision 6 stopped attributing and used **checkpoint commits** as the resume boundary.
Revision 7 keeps that and resolves what the human owns: **the plan file's checkboxes are
the human-facing status, written only by the orchestrator; commits drive resume; task IDs
are stable slugs so neither breaks when a plan is re-planned.**

## Premises

Human-directed and binding:

1. **Commits drive resume.** Checkpoint commits are the authoritative boundary.
2. **Checkboxes are for humans.** The orchestrator ticks the plan file as work completes;
   nothing parses it for a skip decision.
3. **The orchestrator is the only writer of the plan file.** Builders never touch it.
4. **Task IDs are stable content slugs**, not positions.
5. **The dirty tree is left in place** — the forensic record of where the team broke.
6. **Truth for run mechanics lives in SQLite.** Liveness, worktree exclusion, checkpoint
   sequence, agent logs.
7. **Concurrency is untouched.** No serialization, no per-task worktrees, no attribution.

## Three artifacts, three roles

Conflating these is what earlier revisions did, and it is what breaks resume.

| Artifact | Owner | Role | Read at resume? |
|---|---|---|---|
| **Checkpoint commits** | orchestrator | Authoritative completion record | **Yes — drives the skip set** |
| **Plan file** `.claude/plans/<feature>.md` | orchestrator (checkboxes only) | Human-readable status | No — never parsed |
| **`runs.db`** | orchestrator + agents | Liveness, worktree exclusion, checkpoint log, agent scratch | Yes — mechanics only |

**No two of them claim the same fact for the same purpose.** The commit says what is
durable. The plan says what a human should see. The DB says what is running and where.
Markdown is never parsed for correctness — that is what revision 3 died of, when a
model-written note containing `|` broke a hand-rolled grammar.

### Why `plan_hash` is gone

Revisions 5-6 hashed the plan file and refused to resume if it changed. That guard existed
because task IDs were **positional**: if `/set-plan` re-ran and inserted a task, every
`T{n}` after it shifted, and the stored `T3` denoted different work than the plan's `T3`.

Stable slugs remove the failure at its source, so the guard is unnecessary rather than
merely dropped. Probed 2026-08-14 — a task inserted mid-plan:

```
v1 ticked:  T-add-schema, T-add-cli
v2 (T-add-migrations inserted at position 2):
  ticked:   T-add-schema, T-add-cli     ← unchanged, still correct
  T-add-schema: resolves against re-planned file ✓
  T-add-cli:    resolves against re-planned file ✓
```

Positional IDs would have shifted `T2`→`T3` and silently skipped the wrong task. Slugs do
not move. This also makes the orchestrator's checkbox writes safe: mutating the plan can
no longer break a resume guard, because there is no longer a guard to break.

## Task identity

`/set-plan` assigns each task a **stable slug** derived from its content, not its
position:

```
### T-add-checkpoint-table: Add the checkpoint table to schema.sql
```

Rules, stated exactly because two builders would otherwise diverge:

- Prefix `T-`, then kebab-case derived from the task title: lowercase, non-alphanumerics
  to `-`, collapse runs, trim, cap at 40 chars.
- **On collision, append a 3-char content hash** of the *full untruncated* title
  (`T-add-the-checkpoint-table-to-schema-sql-a3f`) — **never an ordinal**. Two long titles
  sharing their first 40 characters is not hypothetical:

  ```
  "Add the checkpoint table to schema.sql and wire it up"  → T-add-the-checkpoint-table-to-schema-sql
  "Add the checkpoint table to schema.sql migration gate"  → T-add-the-checkpoint-table-to-schema-sql
  ```

  An ordinal suffix (`-2`) is assigned by *position*, so re-planning in a different order
  swaps which task owns `-2` — and a trailer naming it then skips the wrong work. That is
  precisely the failure `plan_hash` used to guard, reintroduced through truncation. A
  content hash is position-independent and deterministic.
- **Stable across re-planning.** A task whose title is unchanged keeps its slug. A
  re-titled task is a *new* task and gets a new slug — correct, since its work changed.

The slug is the identity everywhere: plan heading, checkbox line, `SET-Tasks:` trailer,
`task.task_id`, and `verifier-{task-id}`.

## Checkpoint policy

### When the orchestrator commits

**Mandatory at every phase boundary.** Phase transitions are already sync points; the tree
is coherent there.

**Judgment within a phase.** The orchestrator commits when a batch of parallel tasks
returns verdicts and the work has reached a meaningful point. It has context a fixed rule
does not — whether the phase was substantial, whether the sub-tasks were consequential.

**Taken only at a verdict-return boundary** — never at an arbitrary moment.

**In-phase checkpoints capture in-flight work, and the tree may not build.** Under
parallel builders, "a verdict returned" and "no builder is mid-write" are different
moments: T3's verdict returns while T5 and T7 are still writing files, so a checkpoint
there commits T5's half-written module. Scoping the commit to only the returned task's
files would require attribution, which this design abandons for the reasons in the failure
table.

So the honest statement, rather than an unenforceable "never mid-write" rule:

- **Phase-boundary checkpoints are clean.** All tasks have returned; the tree is coherent.
- **In-phase checkpoints may capture partial work**, including files that do not parse.
  They are still worth taking — they bound crash loss — but a resumed run must expect
  `1e`'s baseline tests to fail for reasons unrelated to any task, and must report that as
  a resumed-from-partial-checkpoint condition rather than a task regression.

`git add` is scoped to the repo root with `.gitignore` honored — never `-A` from an
arbitrary cwd, which would sweep `.worktrees/`, editor scratch, and anything a human left
lying around.

### The time backstop

Judgment can be wrong, and models skip steps. If **30 minutes** elapse with no checkpoint,
the backstop arms; the next verdict return takes one regardless. Worst-case loss is
*30 minutes plus one task*, not unbounded.

**Time, not task count, is the unit.** Five tasks might be three minutes or ninety. What
is bounded is how much work a crash can cost, which is wall-clock.

Configurable via `checkpoint_backstop_minutes` in `.claude/set/config.json`. Default 30 —
shipped with a default deliberately, because an unset backstop is one nobody configures
until after it has cost them something.

**Declined checkpoints are recorded too** (`taken = 0`, with rationale), so a 40-minute
gap is diagnosable rather than mysterious, and `/set-learn` can tune the default against
recorded gaps instead of a guess.

### Checkpoint commit format

```
checkpoint: {phase} — {n} tasks complete

SET-Run: {run_id}
SET-Checkpoint: {sequence}
SET-Tasks: {slug},{slug},...
```

`SET-Tasks` lists every task whose verdict returned before this commit and that was not
already captured by an earlier checkpoint. **This is what makes commits authoritative
without attribution**: the commit does not claim *which files* belong to which task — only
that these tasks' work is now durable in the tree as a whole.

`run_id` **includes the hostname and a random suffix**
(`20260814-081500-durable-runs-bobsmac-7f3a`). The DB's `PRIMARY KEY` prevents collision
on one machine, but the skip set is built from **git trailers**, and git enforces nothing.
Two clones, a deleted-and-recreated `runs.db`, or a devcontainer boundary that does not
share `~/.claude` can otherwise put two runs' `SET-Run:` stamps on one branch, and their
skip sets would union silently — run 2 skipping tasks run 1 completed under a different
plan.

Read with trailer-block parsing, never `git log --grep` (revision 2: a grep matches body
prose). Probed:

```
5579d4c -> T-add-resume
2b7bdf9 -> T-add-schema,T-add-cli
```

**Trailer values carry a trailing newline** under `%(trailers:key=…,valueonly)`. Use
`separator=` or trim explicitly — an untrimmed compare silently matches nothing, which
cost an hour during revision 4's probing.

## Architecture

```
~/.claude/set-runs/
  runs.db                          run mechanics (SQLite, WAL)
  <project-slug>/<run-id>/
    tasks/<task-id>.md             agent scratch — advisory, never parsed
```

`run.md` is gone. Revision 6 rendered it from the DB as a human view; the plan file now
serves that role, and two human-facing status documents is one too many.

### Why SQLite for the rest

Revision 3 used markdown as truth and hand-built database features:

| Revision 3 mechanism | What it substituted for |
|---|---|
| Only-the-orchestrator-writes rule | Single-writer transactions |
| One file per task | Row-level isolation |
| Percent-encoding `\|` and newlines | Typed columns |
| Pipe-delimited grammar + parser | Typed columns |
| `.lock` with `O_EXCL` | Transactions |

Probed on this machine, 2026-08-14:

- **8 concurrent writers × 200 rows → 1600/1600 written**, no `SQLITE_BUSY`, no lost
  writes, with `journal_mode=WAL` + `busy_timeout=5000`.
- **`lint failed: expected 'a' | 'b'` with an embedded newline round-trips a `TEXT`
  column** — the string that broke revision 3's grammar.

Agents write their own progress rows directly; no per-file sharding needed.

### Schema

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA user_version = 1;        -- newer than the code understands → refuse, never write

CREATE TABLE run (
  run_id        TEXT PRIMARY KEY,
  project_slug  TEXT NOT NULL,
  project_path  TEXT NOT NULL,
  worktree_path TEXT NOT NULL,   -- fs.realpathSync — canonical
  branch        TEXT NOT NULL,
  plan_path     TEXT NOT NULL,
  spec_path     TEXT,
  entry_phase   TEXT NOT NULL,
  current_phase TEXT NOT NULL,
  status        TEXT NOT NULL,   -- running | crashed | complete
  session_pid   INTEGER,
  hostname      TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX one_live_run_per_worktree
  ON run(worktree_path) WHERE status = 'running';

CREATE TABLE checkpoint (
  run_id     TEXT NOT NULL REFERENCES run(run_id),
  sequence   INTEGER NOT NULL,
  sha        TEXT,               -- NULL when taken = 0
  phase      TEXT NOT NULL,
  reason     TEXT NOT NULL,      -- 'phase-boundary' | 'judgment' | 'backstop'
  rationale  TEXT,
  taken      INTEGER NOT NULL,   -- 1 = committed, 0 = considered and declined
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence)
);

CREATE TABLE task (
  run_id       TEXT NOT NULL REFERENCES run(run_id),
  task_id      TEXT NOT NULL,    -- stable slug
  status       TEXT NOT NULL,    -- pending | running | passed | failed
  verdict_json TEXT,
  captured_seq INTEGER,          -- checkpoint that captured this task; NULL = not yet
  attempts     INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (run_id, task_id)
);

CREATE TABLE agent_log (
  run_id  TEXT NOT NULL,
  task_id TEXT NOT NULL,
  ts      TEXT NOT NULL,
  agent   TEXT NOT NULL,
  event   TEXT NOT NULL,
  detail  TEXT
);
CREATE INDEX agent_log_lookup ON agent_log(run_id, task_id, ts);
```

**`captured_seq` is in-run bookkeeping, not a second source of durability.** Durability is
read from git at resume; this column exists only so the *next* checkpoint knows which
verdicts it still has to name. It is never consulted by the resume protocol.

### Computing `SET-Tasks` — mark, do not compare timestamps

The trailer must name every task whose verdict returned since the last checkpoint and that
no earlier checkpoint already captured. **Derive it by explicit marking**, in the same
transaction that records the commit:

```sql
-- inside the checkpoint transaction, after the commit succeeds
UPDATE task SET captured_seq = :seq
 WHERE run_id = :run AND status = 'passed' AND captured_seq IS NULL;
-- the rows this updates ARE the SET-Tasks list
```

**Never `WHERE updated_at > last_checkpoint_time`.** Probed 2026-08-14: a verdict landing
in the *same second* as a checkpoint is lost by a strict `>` — absent from that
checkpoint's trailer (not yet queried when it ran) and absent from the next one (its
timestamp is not strictly greater). The task is then silently re-dispatched on every
resume forever. `>=` fails the other way, double-naming a task in two trailers.

Explicit marking has no clock in it, so neither boundary exists. This is also why the
column is worth having: it is what makes the trailer *computable* at all.

`agent_log` is append-only diagnostic output — **never** read for control flow.

## Writing the plan's checkboxes

The orchestrator ticks the plan file as verdicts return. Format, stated exactly:

```markdown
## Progress

- [x] T-add-schema — passed 2026-08-14T08:31Z (checkpoint 1)
- [x] T-add-cli — passed 2026-08-14T08:38Z (checkpoint 1)
- [ ] T-add-resume — running
- [ ] T-add-tests — pending
```

Rules:

- **Only the orchestrator writes this section.** Builders never edit the plan; their
  self-review checklists (`plan.md:89-93`) belong to the task definition and are recorded
  in the builder's own scratch file and verdict.
- **Written after each verdict**, and updated with the checkpoint sequence when one is
  taken. A tick without a checkpoint reference means "verified but not yet durable" —
  which is exactly the state resume will re-dispatch.
- **Never parsed.** Nothing reads these boxes to make a decision. If the file is edited by
  hand, deleted, or corrupted, resume is unaffected.

That last rule is what keeps markdown out of the correctness path while still giving the
human an authoritative-looking, always-current status in the file they already open.

## Resume Protocol

`/set-build --resume <run-id>`

**1. Assert location.** `git rev-parse --show-toplevel` (realpath'd) must equal
`worktree_path`; `git branch --show-current` must equal `branch`. Hard refusal otherwise —
without it, a user who crashed, `cd`'d to the main repo, and resumed gets builders
committing to `main`. Detached HEAD returns empty and is reported as detached HEAD
specifically, not as a branch mismatch.

**2. Probe liveness, then claim the worktree atomically.** Liveness is decided by the
**caller** — probe `session_pid` on this `hostname`, treat `updated_at` older than 15
minutes as dead — and the dead-run list is passed into a single `BEGIN IMMEDIATE`
transaction that marks those runs `crashed` and inserts this run's `running` row.

The transaction must never decide liveness itself. Verified: with clear-and-claim split
across two statements, two racing resumes both conclude the slot is free and both insert.
As one transaction with caller-supplied liveness, a live slot refuses and a dead one is
reclaimed exactly once. The `UPDATE` is conditional on the `updated_at` observed at probe
time (compare-and-swap), so a run reviving between probe and commit is not clobbered.

**3. Build the skip set from trailers on the current branch.** Walk the branch for commits
carrying `SET-Run: {run_id}` and collect every slug in their `SET-Tasks:` trailers.

**The branch walk is the mechanism; stored shas are not a gate.** A stored sha that is no
longer an ancestor means history was rewritten — which is ordinary, because premise 4
hands commits to the human. Probed 2026-08-14: amending the newest checkpoint breaks the
stored-sha ancestry check while the trailers still resolve perfectly (`T-beta`,
`T-alpha`). A gate on the stored sha would refuse the whole resume for an amend, a
reword, a squash, or a rebase — all operations the trailers tolerate, and all of which a
human is invited to perform here. Revision 7 gated on it and would have bricked resume
after a `git commit --amend`.

So: ancestry mismatch is reported as an **advisory warning**, not a refusal.

`--is-ancestor` is still used for what it genuinely guards — every commit contributing to
the skip set must be an ancestor of the *current* branch, which rejects a sha from an
abandoned parallel branch (probed in revision 4: `cat-file -e` wrongly accepts those).
The distinction is between *"is this commit on my branch"* (required) and *"is the sha I
recorded earlier still the same object"* (advisory).

**Drop slugs whose checkpoint was reverted.** A revert adds a commit; it does not remove
one. Probed: after `git revert` of a checkpoint, the checkpoint is still an ancestor and
its trailer still resolves, but the work is **gone from the tree**. Revision 7 asserted
this was impossible — *"the commit either exists on the branch or it does not"* — which
confuses commit existence with work presence, and re-opened a hole revision 3 had
accepted and revision 4 had closed.

`/set-review` finding a flaw and the human reverting that checkpoint is the *sanctioned*
path in a commit-driven design, so this is expected usage, not misuse. During the walk,
collect `This reverts commit {sha}` from commit bodies; any checkpoint named there has its
slugs removed from the skip set and its tasks re-dispatched. See Known Limitations for what
this does **not** catch.

**Slugs absent from the plan are ignored** with a warning. A re-planned file may have
dropped or renamed a task; its old work stays committed, but nothing schedules it.

**4. Run setup.** Dependency install (`1d`) and baseline tests (`1e`) — an interrupted
install may have left `node_modules` half-written. Re-run the Agent Team Availability
Gate, which is deliberately not persisted.

**5. Re-dispatch everything not in the skip set.** Including tasks with a `passed` verdict
in the DB but no checkpoint — their work may sit in the dirty tree, but it was never
committed and is not durable.

**6. Leave the tree dirty and brief the agents.** The uncommitted diff is the forensic
record; it is never reset, stashed, or discarded. Re-dispatched builders receive:

- The last checkpoint sha and the diff since it (`git diff --name-only <cp>` plus
  `git ls-files --others --exclude-standard` — probed: `git diff` alone misses newly
  created files).
- Any `tasks/<task-id>.md` scratch from the crashed attempt, **labeled as unverified prior
  claims** — the prior agent failed, so its account is the least reliable document in the
  run.
- An **explicit statement that the tree already contains partial work.**

That last point is not optional. A TDD builder whose test already passes cannot write a
failing test first, and will otherwise fabricate one or report a false pass. This is the
main risk of leaving the tree dirty, and the briefing is the mitigation.

**7. Rewrite the plan's Progress section** from the DB `task` rows annotated with skip-set
membership — not from the skip set alone, which holds only slugs and would discard the
verdict timestamps and failure notes the human most wants to see after a crash.

**8. Autonomy is never persisted.** No column encodes `--autonomous`. Resuming an
autonomous run requires the flag again, explicitly; without it, resume runs supervised. A
stale record can never silently re-enter autonomous mode.

## Concurrency

| Hazard | Mechanism |
|---|---|
| Concurrent writers | WAL + `busy_timeout`; probed 1600/1600, no lost writes |
| Agents writing progress | `agent_log` append-only rows |
| Two runs, one worktree | Partial unique index + atomic claim (step 2) |
| Path spelling variants | `fs.realpathSync` before store and compare |
| Pipes/newlines in notes | `TEXT` column; probed |
| Concurrent tasks sharing a file | **Not a hazard** — no per-task attribution is made |
| Two writers on the plan file | Orchestrator is the sole writer; builders never touch it |
| Resume in the wrong repo | Step 1 location assertion |
| History rewritten | Step 3 ancestor check |
| Plan re-planned | Stable slugs; unknown slugs ignored with a warning |

**Path canonicalization is required, not cosmetic.** Verified: `/wt/x`, `/wt/x/`, and
`/wt/./x` each claim their own slot in the unique index, since it compares TEXT bytes.

**A stale `running` row needs a recovery path.** Only a resume runs the liveness probe, so
a normal `/set-build` finding a live slot must report the holding `run_id` and offer
`set-run.mjs release <run-id>` rather than failing opaquely. `run.status` is set to
`complete` at the closing `◀` boundary so finished runs free their slot.

## Install Gate

`node:sqlite` is required; there is no second store. `install.sh` probes once:

```bash
node -e "require('node:sqlite')" 2>/dev/null           # stable → done
node --experimental-sqlite -e "require('node:sqlite')" # flagged → record in config.json
```

If neither succeeds, install reports that durable runs are unavailable and continues — SET's
other commands do not depend on this. The flag, if needed, is written to
`.claude/set/config.json` as `sqlite_flag` and read by `set-run.mjs` on every invocation.

Declaring the requirement at install time is honest; shipping a second store to avoid
declaring it is not.

## Components

| Unit | Repo path | Purpose |
|---|---|---|
| `set-run.mjs` | `plugins/set/bin/` | `init`, `claim`, `task`, `checkpoint`, `heartbeat`, `release`, `list` |
| `schema.sql` | `plugins/set/bin/` | Schema + `user_version` gate |
| Run store contract | `plugins/set/references/run-store.md` | Schema, checkpoint policy, resume rules |
| Slug task IDs | `plugins/set/commands/plan.md` | Slug rules + Progress section scaffold |
| Checkpoint + resume | `plugins/set/commands/build.md` | Policy, steps 1-8, checkbox writes |
| Dirty-tree briefing | `plugins/set/references/enhanced-builder-prompt.md` | Partial-work statement; "never edit the plan" |
| Install gate | `install.sh` | Probe + copy `bin/` |

Repo paths, not installed paths — `install.sh` copies `plugins/set/commands/build.md` to
`~/.claude/commands/set-build.md`, and a builder grepping the repo for the installed name
finds nothing.

## Who writes, and what if they forget

The orchestrator is a model, and models skip steps. `install.sh` does not manage hooks, so
a `SubagentStop` writer is out; the design makes forgetting **harmless** instead.

| When | Write | By |
|---|---|---|
| Build start | `run` row + `pending` task rows | orchestrator |
| Verdict returns | `task` row; plan checkbox | orchestrator |
| Checkpoint taken or declined | `checkpoint` row; commit if taken | orchestrator |
| During a task | `agent_log` rows, `tasks/<id>.md` scratch | agent |
| Phase boundary | `updated_at` touch, mandatory checkpoint | orchestrator |

Writes ride on the `▶`/`◀` boundary lines and the verdict-return point — instructions
already mandatory on every run.

**Failure is one-directional, with one named exception.** A missed `task` write or
checkbox tick costs nothing: the skip set comes from git, not from either. A missed
*checkpoint* means tasks re-dispatch that were already complete — redundant work, never
lost work.

The inverse — skipping a task that was not done — requires a commit whose `SET-Tasks`
trailer names it **and whose work is still present**. Commit existence alone is not
sufficient, because a revert leaves the commit reachable while removing its content. The
revert scan in step 3 covers the sanctioned undo path; a manual undo committed as ordinary
edits is not detected (see Known Limitations).

**Ordering matters when writing a checkpoint:** `git commit` first, then the `checkpoint`
row. A crash between them leaves a commit with no DB row — the skip set (git-driven) is
correct, and only the gap analysis loses a data point. The reverse order would produce a
DB row claiming a checkpoint that does not exist.

## Testing

No test tooling exists in this repo. Ships a minimal `node --test` harness — zero
dependencies — at `plugins/set/tests/`, invoked as `node --test plugins/set/tests/`,
documented in CLAUDE.md. **Contributor-run; no CI enforces it**, stated plainly so a future
reviewer does not read a test directory as enforced coverage.

- **Skip set from trailers** — tasks named in `SET-Tasks` on ancestor commits are skipped;
  a `passed` DB row with no such commit is re-dispatched.
- **Slug stability** — inserting a task mid-plan leaves other slugs resolving correctly.
  Regression test for the failure `plan_hash` used to guard.
- **Unknown slug** — a committed slug absent from the re-planned file is ignored with a
  warning, not an error.
- **Amended checkpoint** — amending a checkpoint commit does NOT refuse the resume; the
  skip set still resolves from trailers, and the sha mismatch is reported as advisory.
  Regression test for revision 7's brittle gate.
- **Reverted checkpoint** — `git revert` of a checkpoint drops its slugs from the skip set
  and re-dispatches its tasks. Regression test for the revision-3 hole this reopened.
- **Slug collision** — two titles sharing their first 40 chars get content-hash suffixes
  that survive re-ordering; ordinal suffixes would swap.
- **run_id uniqueness** — two runs on one branch do not union their skip sets.
- **Foreign sha** — a checkpoint sha from another branch is rejected by `--is-ancestor`
  though `cat-file -e` accepts it.
- **Trailer parsing** — a commit body quoting `SET-Tasks:` in prose does not resolve;
  only the trailer block counts.
- **Backstop** — 30 minutes with no checkpoint arms it; it fires at the next verdict, not
  mid-task.
- **Declined checkpoints** — a `taken = 0` row is written with a rationale and no sha.
- **Same-second verdict** — a verdict whose `updated_at` equals a checkpoint's
  `created_at` appears in exactly one trailer: not zero, not two. Regression test for the
  timestamp-comparison defect; `captured_seq` marking is what makes it pass.
- **Dirty tree preserved** — resume never resets, stashes, or discards uncommitted work.
- **Plan is never parsed** — corrupting the Progress section does not change the skip set.
- **Atomic claim** — live slot refuses; dead slot reclaimed once; two racing resumes
  produce exactly one `running` row; a run reviving between probe and commit is not
  clobbered.
- **Path canonicalization** — `/wt/x`, `/wt/x/`, `/wt/./x` collapse to one slot.
- **Concurrent writers** — N processes on `task` and `agent_log`; no lost writes.
- **Note round-trip** — `expected 'a' | 'b'` with newlines survives.
- **Location assertion** — wrong repo, wrong branch, detached HEAD refuse distinctly.
- **Migration gate** — `user_version` newer than code → refuse, do not write.

## Rejected Alternatives

**Per-task commit sha (revisions 1-3).** Forces one commit per task, turning history into
a progress log. Checkpoints are the same mechanism at a different granularity — meaningful
points, not progress ticks.

**Per-task file fingerprint (revisions 4-5).** Requires attributing files to tasks in a
worktree that concurrent builders share. Not achievable.

**Whole-worktree fingerprint.** Any benign change — a lockfile refresh, a generated route
tree, an unrelated human edit — invalidates every task at once.

**Per-task dispatch baselines.** Makes the overlap intersection computable, but concurrent
tasks still contaminate each other's windows; all it buys is *detecting* contamination,
which then serializes the concurrency Agent Teams exist for.

**Per-task worktrees.** Attribution would be exact, but merging back requires a commit and
a merge — reintroducing mandatory per-task commits.

**`plan_hash` (revisions 5-6).** Guarded against positional-ID drift. Stable slugs remove
that failure at its source, and the hash would forbid the orchestrator's own checkbox
writes.

**Parsing the plan's checkboxes at resume.** Would make the plan authoritative for
correctness, reintroducing markdown-as-truth — the defect that killed revision 3, where a
model-written note broke a hand-rolled grammar.

**`run.md` rendered from the DB (revision 6).** Redundant once the plan file carries
human-facing status. Two status documents invite disagreement.

**Markdown as truth (revision 3).** Every concurrency mechanism it needed was a database
feature reimplemented by hand.

**JSONL degradation path (revision 4).** A second complete store, shipped to avoid
declaring a runtime requirement. Replaced by the install gate.

**Electric SQL / PGlite durable agents.** Real-time sync to multiple observers,
cross-machine resume, live dashboards — a different problem. One machine, one developer
here. Revisit for fleets.

**`SubagentStop` hook as writer.** Unforgettable, but the installer does not manage hooks,
and a hook knows an agent *finished*, not whether its work was *good*.

## Known limitations

**Resume is inexact by design.** Work between the last checkpoint and the crash is redone.
Bounded by checkpoint frequency; worst case is the backstop interval plus one task.

**Checkpoint placement is a model's judgment.** A model that consistently declines
checkpoints produces long unprotected stretches. The backstop bounds it, `taken = 0` rows
make it visible, and `/set-learn` can tune the default from recorded gaps.

**A checkpoint commits whatever is in the tree**, including work from tasks whose verdicts
have not returned. In-phase checkpoints may therefore capture syntactically incomplete
files, and a resumed run's baseline tests may fail for reasons unrelated to any task.

**Manual undo is not detected.** The step-3 revert scan catches `git revert`, the
sanctioned path. A human who instead deletes the work with ordinary edits and commits that
leaves the checkpoint reachable, its trailer resolving, and its tasks skipped — while the
work is absent. Detecting this would require content measurement, which this design
abandons. `/set-review` is the audit that catches it.

**The dirty tree may confuse a re-dispatched TDD builder.** Mitigated by the explicit
partial-work briefing, not eliminated.

**A task marked `passed` immediately before a crash is redone.** Its verdict is recorded
but no checkpoint captured it. Correct but wasteful; the backstop bounds how often.

**Checkboxes can go stale if the orchestrator dies mid-write.** Harmless — nothing reads
them — and step 7 rewrites the section on resume.

**A re-titled task is a new task.** Its slug changes, so its prior work is not skipped and
it re-dispatches. Correct (the work changed) but invisible unless the human notices the
rename.

## Open Questions

1. **Checkpoint on failure.** Whether a batch containing a failed task should still
   checkpoint the passing tasks' work. Currently yes — the tree is coherent, and the
   failed task re-dispatches regardless.
2. **Backstop default.** 30 minutes, from reasoning rather than data. Recorded gaps will
   make this empirical after a few real runs.
3. **`session_pid` source.** The Claude Code session pid as seen by the orchestrator's
   shell. `process.ppid` from a short-lived script walks to the shell, not the session —
   verify during build.
4. **Slug collision across re-plans.** ~~Open~~ **Resolved:** content-hash suffix instead
   of an ordinal, so disambiguation is position-independent.
7. **Checkpoint instruction concreteness.** "Commits when the work has reached a meaningful
   point" is prose whose compliance cannot be tested — it is now load-bearing the way the
   fingerprint was in revisions 4-5. The backstop bounds the damage and `taken = 0` rows
   make lapses visible, but `build.md` needs worked examples of what qualifies, and that
   is a build task in its own right.
5. **Pruning.** None; runs persist indefinitely per decision.
6. **Windows.** `fs.realpathSync` and `node:sqlite` are portable; `git` invocations assume
   a POSIX shell. Untested.
