# SET Autonomous Mode — Design Spec

**Date:** 2026-08-13
**Status:** Approved for planning
**Feature:** `--autonomous` and `--verbose` switches on the SET pipeline

## Problem

The SET pipeline is six commands, each ending at a human gate that prints the next
command to run. Every handoff requires a human to be present and type. For work that
does not need per-phase supervision, that presence is the bottleneck — the pipeline
already knows what comes next.

Autonomous agent teams are viable now. SET should be able to run a full cycle
unattended, from whichever phase the human chooses, while keeping the boundaries that
exist for reasons other than supervision.

## The Switches

### `--autonomous`

Accepted on `/set-design`, `/set-plan`, `/set-build`, `/set-review`.

Means: **run this phase and every remaining phase through `/set-learn` without stopping
at human gates.**

Not accepted on `/set-init` (nothing follows it in a cycle) or `/set-learn` (it is the
terminal phase). Passing it there is an error with a one-line explanation, not a silent
no-op.

### `--verbose`

A plain flag on each of the five cycle phases (`/set-design`, `/set-plan`, `/set-build`,
`/set-review`, `/set-learn`), with identical meaning whether or not `--autonomous` is
set. It is not a companion to autonomous mode.

- **Default (no `--verbose`):** report at phase boundaries — entering and leaving each
  phase, with the phase's headline result (spec path, task count, build verdict, review
  verdict, iterate round outcomes).
- **`--verbose`:** additionally report each agent spawn and return.

**Supervised runs benefit at least as much as autonomous ones.** A supervised
`/set-build` spawns an entire Agent Team and does not report until the Phase C gate; the
window in between is opaque. The existing stall detection — three unchanged polls, then
`SendMessage` the teammate for a status report — exists precisely because that window is
dark. A human sitting at the terminal can act on per-agent output immediately, which is
more than an unattended run can do with it. The same holds for `/set-review`'s lens
fan-out.

**There is no inverse switch.** Phase boundaries are the floor, not a default to be
suppressed. A supervised run's output *is* its interface: quieter than phase boundaries
leaves the human waiting blind for a gate prompt with nothing to decide on. No supervised
scenario wants less, so `--quiet` would be a switch with no use case.

**One asymmetry worth honoring.** In autonomous mode the emitted output is the only
record — there is no gate at which to ask a follow-up question. So under
`--autonomous --verbose`, the per-agent stream also includes decisions a supervised human
could otherwise recover by asking: which specialist each review finding was routed to in
a fix pass, and which exit condition ended the iterate loop.

## Mechanism: In-Session Chaining

No state is written to disk.

When a phase completes under `--autonomous`, instead of printing "Run `/set-plan` next",
it reads the next command file and continues executing it in the same session, carrying
both switches forward.

Command files resolve from the SET installation (`~/.claude/commands/set-<phase>.md`).

**Why not a state file:** a flag persisted to `config.json` or a run file survives the
session, which means a stale flag can silently auto-chain a later manual `/set-build`.
That failure mode is worse than the problem it solves. The flag living only in the
conversation means it dies naturally with the session, and recovery after a crash is a
manual re-invoke — which is the honest behavior, since a crashed autonomous run leaves a
worktree whose state the human should look at anyway.

**Consequence accepted:** autonomous runs are not resumable. A crash mid-build means
re-invoking from the last completed phase.

## Gate Suppression Per Phase

| Phase | Interactive gate | Under `--autonomous` |
|---|---|---|
| `/set-design` | Brainstorming Q&A, per-section approvals, spec review gate | Agent explores context, selects an approach on its own reasoning, writes the spec, runs the existing spec self-review loop, proceeds. Spec still written to `docs/superpowers/specs/` — the artifact is unchanged, only the approval is. |
| `/set-plan` | "Show the plan. Wait for user to approve, modify, or reject." | Plan written to `.claude/plans/`, self-reviewed against the existing Step 4 criteria, proceeds. |
| `/set-build` | Agent Team availability gate (two options + wait); failing-test prompt; Phase C human gate | Availability gate auto-selects the workflow path without waiting. Failing tests are recorded and the chain proceeds to review, which is where code gets judged. Phase C reports and proceeds. |
| `/set-review` | Verdict presented to human | Verdict drives the iterate loop (below). |
| `/set-learn` | — | Runs. Shards tagged as originating from an unverified cycle. |

### Design-phase caution

`--autonomous` on `/set-design` is supported but is not currently best practice. The
agent authors its own requirements, so a poor design costs tokens twice — once building
it and again fixing it. The README documents this; nothing in the commands blocks it.
Prefer starting autonomy at `/set-plan`, from a human-approved spec.

## The Iterate Loop

Lives in `/set-review` under `--autonomous`.

On verdict:

- **SHIP / clean** → proceed to `/set-learn`.
- **BLOCK, or any lens returned `FAILED`** → **halt immediately, iterations unspent.**
  BLOCK means something is fundamentally wrong. A `FAILED` lens means missing coverage,
  not a findings list a fix agent can act on. Neither is fixable by another round;
  spending one produces two expensive passes papering over the real problem.
- **ITERATE** → run a fix pass, then a fresh re-review.

### Loop exit conditions

The loop stops on whichever comes first:

1. **Review comes back clean.** Proceed to `/set-learn`.
2. **No new findings.** Every finding in round N was already reported in round N−1
   (matched on file + issue). A shrinking list of known findings means the fix pass
   works but is incomplete — report and hand back rather than spend another round on
   diminishing returns.
3. **2 rounds spent.** The backstop for a loop that keeps surfacing genuinely new issues
   each round, which is itself a signal worth halting on.

The cap is a ceiling, not a target. Condition 2 is expected to fire more often than 3.

### The fix pass routes findings by domain

A fix pass is **not** a build re-run.

Review findings are compiled into a fix brief. Each finding is routed to the specialist
that owns its domain — **including agents the original build never spawned**. A security
finding in the API/sync domain gets an owner even when the build only touched React/UI
and database tasks. Routing uses the same specialist-matching the plan phase uses.

Fix agents run in fresh contexts. The re-review is a fresh, independent four-lens run,
so the lens independence guaranteed by `/set-review`'s return contract holds across
rounds — a lens never reviews code it helped fix.

## Terminal State

The chain ends after `/set-learn`.

**Hard boundaries the flag never crosses:**

- Never pushes to a remote
- Never opens a PR
- Never merges
- Never claims the work is done or verified

These come from project policy (browser verification is the acceptance gate; nothing is
pushed without explicit human approval), and autonomy does not override them.

### Final report

- Phases run, and which phase the chain started from
- Iterate rounds spent, and which exit condition fired
- Tasks passed/failed
- Final review verdict, and any remaining findings
- Branch or worktree location
- Shards written by `/set-learn`
- The handoff: browser check, then the push decision

### Learning-shard tagging

`/set-learn` runs at the end of an autonomous cycle, before any human has browser-verified
the work. Learnings captured from an unverified cycle can encode a mistake as a pattern.

Shards written during an autonomous run are tagged with their unverified origin, so a bad
learning is traceable and removable rather than anonymous. Shards are plain markdown and
editable, so this is recoverable rather than a hard risk.

## Distribution

This feature must reach existing SET users through their next `/set-update`. That is a
requirement of the work, not a follow-up to it.

The delivery mechanism already exists (the installer gains a version-notification
step — see "Update Notification" below — but nothing about delivery changes):

- `install.sh` fetches the **`main` branch** tarball and copies
  `plugins/set/commands/*.md` → `~/.claude/commands/set-*.md`.
- All five command files this feature edits are already in that copy list.
- Plugin files are the single source of truth — no command bodies are embedded in the
  installer, so editing the plugin files is sufficient.
- `/set-update` re-runs `install.sh`, so a user on any prior SET version picks the
  feature up on their next update with no migration step.

**The one binding condition: the work must land on `main`.** A feature sitting on a
feature branch is invisible to `/set-update`.

No project-side migration is required. Both switches are parsed per invocation and write
nothing to `.claude/set/` — `--autonomous` carries in the conversation only,
`--verbose` affects nothing beyond the invocation it is passed to. `/set-update`'s Step 1
project migration has nothing to reconcile.

### Acceptance criteria

1. The five edited command files live under `plugins/set/commands/` and are merged to
   `main`.
2. The existing `install_file` calls cover every edited file (they already do; the
   installer's only change is the version notification below).
3. A user running `/set-update` against `main` receives the switches with no manual step
   and no migration prompt.
4. `README.md` and `docs/commands.md` describe both switches — `--verbose` documented as
   a general-purpose flag, not as an autonomous-mode option — so an updating user can
   discover the feature without reading the command specs.
5. A user updating from an earlier version is **told** the switches now exist, rather
   than having to notice them (see "Update Notification").

## Update Notification

A significant feature that ships silently is a feature most users never find. `/set-update`
currently reports only that commands were installed — never what changed. Autonomous mode
is the first release large enough to make that gap matter.

### Mechanism

`install.sh` gains a version check. It does **not** change how files are delivered.

1. **Before overwriting anything,** read the previously installed version from
   `~/.claude/commands/.set-version` (absent → treat as a first install).
2. Read the incoming version from the source tree's
   `plugins/set/.claude-plugin/plugin.json` via `jq` (already a hard dependency).
3. **After a successful install,** write the incoming version to
   `~/.claude/commands/.set-version`.
4. If the version changed, print a **digest** of the incoming version's `CHANGELOG.md`
   section: a version line (`SET updated <prev> → <new> — <headline>`, or
   `SET <new> installed` on a first install), then one line per top-level `- **lead**`
   bullet, then a pointer to `CHANGELOG.md` for the full notes. Unchanged → print nothing
   beyond the normal report.

   **Not the full section.** A changelog section is release-note prose sized for reading
   in a file — several dense paragraphs. Dumping it into installer output buries the
   signal. The digest is derived mechanically from the changelog's own structure, so it
   stays self-maintaining: no per-release summary to write or keep in sync.

5. **Also write the digest to `~/.claude/commands/.set-whatsnew`**, and have `/set-update`
   lead its Step 5 report with that file's contents.

   This is the channel that actually reaches a Claude Code user. The installer's stdout
   is captured as tool output they would have to expand to see — in practice, they do not.
   A `curl | bash` user has the opposite problem: stdout is their only channel. Both
   audiences are real, so the digest is produced once and delivered on both paths.

   The file is cleared at the start of every run, so it exists only when the current run
   wrote it. Otherwise a failed install would leave the previous release's digest on disk
   and `/set-update` — which cannot see whether the installer succeeded — would report it
   as fresh news for an update that just failed.

The version file must be read **before** the copy step: `/set-update` overwrites
`~/.claude/commands/`, so anything stored only inside the replaced files is gone by the
time the report is printed.

### Why the installer computes it, and `/set-update` only reports it

The **comparison** belongs in the installer and nowhere else. `/set-update` is a prompt:
asking it to work out what changed would be advisory (an LLM may apply it inconsistently)
and it would have to capture the prior version before running the installer that destroys
it. The installer is deterministic and already owns the copy step, so it is the only place
the before/after comparison is reliable.

The **reporting** is a separate question, and the installer alone cannot answer it. Its
stdout is invisible to a Claude Code user without expanding tool output. So the installer
computes the digest once and writes it to a file; `/set-update` reads that file and
reproduces it. The prompt is never asked to determine what changed — only to relay a
digest that already exists. That keeps the unreliable part (judgment) out of the prompt
and leaves it the part it does reliably (reading a file and reporting its contents).

`update.md` Step 5 previously carried the bullet *"If any SET commands changed, briefly
note what's new"* — an instruction with no data source, which in practice was skipped or
guessed. The digest file replaces it with something concrete.

### Self-maintaining

The notification reads `CHANGELOG.md`, which this project already maintains per release.
Every future release gets a notification with no additional work — nothing to remember,
nothing to keep in sync beyond the changelog entry that would be written anyway.

### Version bump

This branch ships a significant feature, so it releases as **1.2.0** (from 1.1.0), with a
`CHANGELOG.md` entry describing both switches. The notification mechanism has nothing to
announce without them — the bump and the entry are part of this work, not a follow-up.

### Failure behavior

The notification is **never** allowed to fail the install. A missing `CHANGELOG.md`, an
unparseable `plugin.json`, an unwritable version file, or a missing changelog section for
the incoming version each degrade to printing nothing (or a single terse line) and must
not set the installer's error count or change its exit code. Delivering the files is the
installer's job; telling the user what arrived is a courtesy on top.

## Files Touched

- `plugins/set/commands/design.md` — accept flags; autonomous brainstorming path; chain to plan
- `plugins/set/commands/plan.md` — accept flags; suppress approval gate; chain to build
- `plugins/set/commands/build.md` — accept flags; auto-select execution path; suppress Phase C gate; chain to review
- `plugins/set/commands/review.md` — accept flags; iterate loop; fix-pass routing; chain to learn
- `plugins/set/commands/learn.md` — accept `--verbose`; reject `--autonomous` (terminal); shard origin tagging; final report
- `README.md` — document both switches; design-phase caution note
- `docs/commands.md`, `docs/workflow.md` — switch reference
- `install.sh` — copy the new reference file; version check, digest, and the
  `.set-whatsnew` handoff
- `plugins/set/commands/update.md` — Step 5 leads its report with the digest file
- `plugins/set/.claude-plugin/plugin.json` — version 1.1.0 → 1.2.0
- `CHANGELOG.md` — 1.2.0 entry describing both switches

The five cycle command files are untouched by the notification work.

`/set-init` is untouched. `/set-update` takes neither flag — it is not a cycle phase and
fans out no agents, so `--verbose` would be a no-op there; "every pipeline command" means
the five cycle phases (`design`, `plan`, `build`, `review`, `learn`). Its only change is
Step 5 relaying the digest, which is reporting, not autonomy.

## Out of Scope

- Resumability after a crash (deliberate — see Mechanism)
- Autonomy on `/set-init` and `/set-learn`
- Any change to the four-lens return contract or the build's TDD/verifier bar
- Pushing, PR creation, or merging under any flag
- Any notification channel reaching outside this machine — no network calls, no telemetry,
  no update-available check against GitHub. (The digest is delivered two ways locally:
  installer stdout and the `.set-whatsnew` file `/set-update` reads. Both are local, and
  both come from the same computed digest.)
- Downgrade detection — a lower incoming version is treated as "changed" and shows that
  version's changelog section; the installer does not attempt to reason about direction

## Open Questions

None. All decisions resolved during design.
