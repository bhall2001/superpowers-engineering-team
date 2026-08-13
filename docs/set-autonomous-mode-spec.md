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

Independent of `--autonomous`. Valid on any pipeline command, with or without it.

- **Default (no `--verbose`):** report at phase boundaries — entering and leaving each
  phase, with the phase's headline result (spec path, task count, build verdict, review
  verdict, iterate round outcomes).
- **`--verbose`:** additionally report each agent spawn and return.

Orthogonal by design: verbosity is about observability, autonomy is about gates. A long
unattended run is the case that most needs progress output, but a supervised run may
want it too.

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

The mechanism already exists and needs no installer changes:

- `install.sh` fetches the **`main` branch** tarball and copies
  `plugins/set/commands/*.md` → `~/.claude/commands/set-*.md`.
- All five command files this feature edits are already in that copy list.
- Plugin files are the single source of truth — no command bodies are embedded in the
  installer, so editing the plugin files is sufficient.
- `/set-update` re-runs `install.sh`, so a user on any prior SET version picks the
  feature up on their next update with no migration step.

**The one binding condition: the work must land on `main`.** A feature sitting on a
feature branch is invisible to `/set-update`.

No project-side migration is required. The switches carry in the conversation only and
write nothing to `.claude/set/`, so `/set-update`'s Step 1 project migration has nothing
to reconcile.

### Acceptance criteria

1. The five edited command files live under `plugins/set/commands/` and are merged to
   `main`.
2. `install.sh` requires no changes; the existing `install_file` calls cover every
   edited file.
3. A user running `/set-update` against `main` receives the switches with no manual step
   and no migration prompt.
4. `README.md` and `docs/commands.md` describe both switches, so an updating user can
   discover the feature without reading the command specs.

## Files Touched

- `plugins/set/commands/design.md` — accept flags; autonomous brainstorming path; chain to plan
- `plugins/set/commands/plan.md` — accept flags; suppress approval gate; chain to build
- `plugins/set/commands/build.md` — accept flags; auto-select execution path; suppress Phase C gate; chain to review
- `plugins/set/commands/review.md` — accept flags; iterate loop; fix-pass routing; chain to learn
- `plugins/set/commands/learn.md` — accept flags (terminal); shard origin tagging; final report
- `README.md` — document both switches; design-phase caution note
- `docs/commands.md`, `docs/workflow.md` — switch reference

## Out of Scope

- Resumability after a crash (deliberate — see Mechanism)
- Autonomy on `/set-init` and `/set-learn`
- Any change to the four-lens return contract or the build's TDD/verifier bar
- Pushing, PR creation, or merging under any flag

## Open Questions

None. All decisions resolved during design.
