# SET Autonomous Mode — Shared Contract

Cited by `/set-design`, `/set-plan`, `/set-build`, `/set-review`, `/set-learn`.
This file is the single definition of flag behavior; the commands do not restate it.

## Flag Parsing

Both flags are parsed from the command argument string and stripped before the remaining
arguments are interpreted as the command's normal input (feature name, spec
path, branch range).

- `--autonomous` — run this phase and every remaining phase through
  `/set-learn` without stopping at human gates.
- `--verbose` — report each agent spawn and return.

Flags may appear in any order and in combination with existing flags
(`--light`, `--use-workflow`, `--no-worktree`, `--resume`).

`--autonomous` is valid on all five cycle phases: `/set-design`, `/set-plan`,
`/set-build`, `/set-review`, and `/set-learn`.

On `/set-learn` it chains nowhere — nothing follows it — but it still **suppresses that
phase's own gates**, which is the point. `/set-learn` otherwise asks the user to approve a
taxonomy, approve each new domain, and approve every agent update; an autonomous run stalls
at all three. Under the flag it applies them and reports what it applied.

So `/set-learn` treats `--autonomous` and a chained arrival identically — see the Chaining
Contract for how it recognizes the latter. A user who types the flag directly gets the same
gate suppression as the chain does.

It is **not** valid on `/set-init` or `/set-update`. Neither is a cycle phase, neither
fans out agents, and neither has a chain to continue. Passing it there does nothing; those
commands need no flag handling.

## Verbosity Levels

Identical whether or not `--autonomous` is set.

**Default** — report at phase boundaries:

```
▶ SET {phase} — starting{, autonomous chain} [n/N]
◀ SET {phase} — {headline result}
```

**Copy these shapes literally.** The opening line is one em-dash-separated clause, then a
comma, then `autonomous chain`, then the bracket last — nothing is parenthesized, and
`chain` never moves inside the brackets. `▶ SET design — starting (autonomous, chain
[1/2])` is wrong twice over: reformatted, and numbered by guess. Each phase file carries
its own precomputed table for `[n/N]`; use that table rather than deriving the numbers.

**Read this file before emitting the line, not after.** A boundary line written from
memory of what the format "looks like" is the first sign a phase is paraphrasing the
contract instead of following it — and the hop at the end of that same phase is the step
that paraphrasing breaks.

`N` = the total number of phases in the chain being run: the entry phase through
`/set-learn` inclusive. `n` = this phase's 1-based position in that chain. Both are
fixed at the entry phase and never recomputed.

`n` counts from the **entry phase**, not from `/set-design`. The full table, so this is
lookup rather than arithmetic:

| Entry phase | N | Positions |
|---|---|---|
| `design` | 5 | design 1, plan 2, build 3, review 4, learn 5 |
| `plan`   | 4 | plan 1, build 2, review 3, learn 4 |
| `build`  | 3 | build 1, review 2, learn 3 |
| `review` | 2 | review 1, learn 2 |
| `learn`  | 1 | learn 1 |

So a run entered at `/set-build` shows `[1/3]`, `[2/3]`, `[3/3]` — a `/set-review` line
reading `[3/4]` means the chain thinks it entered at `/set-plan`. Without `--autonomous`
there is no chain — omit `[n/N]`.

The headline result per phase: design → spec path; plan → task count and
plan path; build → tasks passed/failed and diff stat; review → verdict;
learn → shards written.

**`--verbose`** — additionally report each agent spawn and return:

```
  → spawn {agentType} :: {task or lens name}
  ← {agentType} :: {pass/fail or finding count}
```

Under `--autonomous --verbose`, also report decisions a human at a gate could
otherwise ask about: which specialist each review finding was routed to in a
fix pass, and which exit condition ended the iterate loop.

## Chaining Contract

Under `--autonomous`, a phase does NOT print "Run `/set-x` next" and stop.
Instead it reads the next command file and continues executing it in the same
session, carrying both flags forward.

Chain order: `design` → `plan` → `build` → `review` → `learn`.

### The hop is a procedure, not an intention

**This is the step the chain actually fails at.** Every other handoff in SET is a tool
call; this one has historically been prose, and prose loses to the end-of-phase instinct
to stop and report. The hop is therefore specified as literal steps. Execute them as the
**last action of the phase, in the same assistant turn that emits the closing
phase-boundary line** — not after a pause, not as a suggestion, not in a message that
ends first.

The failure mode this prevents, observed in real runs: the phase finishes its work,
prints its results, says something like "say the word and I'll run `/set-review`" or
"ready to proceed?", and ends the turn. Under `--autonomous` there is no one to say the
word. **A question addressed to the user is a broken chain**, whatever its wording.

At the end of a chaining phase, do all four, in order:

1. **Determine `{next}`** from the fixed chain order above — the phase immediately after
   this one. Never from memory of what a phase "usually" does, and never from a run-store
   or CLI name. The only legal values are `design`, `plan`, `build`, `review`, `learn`.
   (`set-run` is the run-store CLI, not a phase — it is never a hop target.)
2. **Verify the file exists** at `~/.claude/commands/set-{next}.md` by reading it. A hop
   to a path you have not read is not a hop.
3. **Announce the hop on its own line**, so a break is visible in the transcript at the
   moment it happens rather than inferred later:

   ```
   ⇢ SET chain — {this phase} → {next} [n/N]
   ```

4. **Execute the contents of that file now**, in this turn, as the operative instructions,
   with the carried flags and payload as its arguments. Its arguments are what you
   carry forward: the flags, this phase's normal handoff, and the accumulated Final
   Report payload.

If step 2 fails, halt per **Halting** below and say which file was missing.

### Halting is for impossibility, not for judgment

A chained phase does **not** get to end the chain because continuing seems unwise. That
authority belongs to the human who typed the flag; taking it back mid-run is how an
autonomous run silently becomes a supervised one.

**Concerns are recorded, not obeyed.** When a phase sees a real problem — the build
modifies its own machinery, the project was never `/set-init`'d, most tasks have no
executable test, tests were already failing at baseline — it records the concern in the
Final Report payload under `concerns_raised` and **chains anyway**. The concern reaches
the human in the Autonomous Final Report, which is where a judgment call they did not
delegate belongs.

Only these end a chain early:

- The next command file is missing (step 2 above).
- The phase cannot run at all: no plan for `/set-build`, no spec for `/set-plan`, no
  feature idea for `/set-design` with an empty remainder.
- A **Hard Boundary** below would have to be crossed to continue.

When halting, emit a machine-greppable line and then chain to `/set-learn` anyway if it
is reachable, so the user still gets a Final Report:

```
⇠ SET chain HALTED — {phase}: {reason}
```

Never halt silently, and never let a halt be inferred from the mere absence of the next
phase's output.

**Exception at the last hop.** `--autonomous` is not a valid flag on `/set-learn` (see
Flag Parsing), so the chain does NOT pass it there — passing it would trip the error
message. `--verbose` still carries forward; it is valid on every phase.

**How `/set-learn` knows it was reached via an autonomous chain.** Not from a flag —
from the handoff. `/set-review` chains into `/set-learn` and hands it the accumulated
Final Report payload (below). **The presence of that payload IS the signal**, and it is
the condition `/set-learn` means by "reached via an autonomous chain": tag shards
`(unverified cycle)`, emit the Autonomous Final Report in place of its normal report, and
apply the halted-run handling. A user who types `/set-learn` themselves arrives with no
payload and takes the normal path.

**Autonomy is never written to disk.** The flags live in the conversation only. A
session that ends drops autonomy naturally, so a later manual `/set-build` can
never be silently auto-chained.

**Run state is a separate matter, and it IS durable.** `/set-build` records progress
in `~/.claude/set-runs/` and takes checkpoint commits as it goes, so a crashed build
resumes with `/set-build --resume {run-id}` instead of redoing finished work. See
`references/run-store.md`.

The two do not conflict, because resuming never restores autonomy: `--resume` alone
runs supervised, and continuing an autonomous chain requires typing `--autonomous`
again. A stale run record can never silently re-enter autonomous mode — which is the
property the conversation-only flag was protecting.

Phases other than `/set-build` are not resumable; recovery there is a manual re-invoke
from the last completed phase.

Each phase still writes its normal artifacts (spec, plan, commits, shards).
Those artifacts are the handoff between phases, exactly as in a supervised run.

**Each phase also accumulates the Final Report payload and passes it forward**, on top of
whatever its successor specifically needs. The payload starts at the entry phase and only
grows: the entry phase name, the phases run so far, and each phase's headline result and
artifact paths — spec path, plan path, per-task verdicts and diff stat, branch/worktree
location, review verdict and iterate-loop outcome. `/set-learn` renders it as the
Autonomous Final Report; anything dropped mid-chain is missing from what the user reads.

The payload also carries **`concerns_raised`**: a list of `{phase, concern}` entries from
phases that saw a problem worth a human's attention but chained past it per **Halting is
for impossibility, not for judgment**. This is the release valve that makes non-halting
safe — a phase gives up the power to stop the run, and in exchange it is guaranteed its
concern reaches the user. Never drop these; an unreported concern turns a deliberate
design into a silent one.

## Hard Boundaries

`--autonomous` NEVER:

- pushes to a remote
- opens a pull request
- merges a branch
- claims the work is done or verified

These come from project policy, not from supervision. The chain ends by handing
the human the acceptance check and the push decision.

**The acceptance check is whatever THIS project uses to decide a change actually
works.** Automated tests are not it — the builders already ran those, and the run is
reporting its own homework. Read `CLAUDE.md` for how the project defines done and name
that specific step: exercising the feature in a browser for a web app, running the CLI
for a command-line tool, hitting the endpoint for a service, running the notebook, doing
the manual QA pass. If `CLAUDE.md` says nothing, write "Verify the change works" and let
the human decide what that means. Never assume a browser.

## Autonomous Final Report

Emitted once, by `/set-learn`, at the end of a chained run:

```markdown
## SET Autonomous Run Complete

**Started at:** /set-{phase}    **Phases run:** {list}

### Result
- Build: {n} passed, {m} failed
- Review verdict: {SHIP | ITERATE | BLOCK | HALTED}
- Iterate rounds: {n} of 2 — exited on {clean | no new findings | round cap | BLOCK | lens FAILED}
- Remaining findings: {count by severity, or "none"}
- Unresolved questions: {list from the plan, or "none"}

### Concerns raised during the run
{For each `concerns_raised` entry: **{phase}** — {concern}. If none, "none".}
These did not stop the run. They are judgment calls the chain deliberately left to you.

### Artifacts
- Spec: {path}
- Plan: {path}
- Branch/worktree: {location} — still on disk, yours to keep or remove
- Shards written: {list}

### Not done for you
- [ ] {this project's acceptance check — see above; never assume a browser}
- [ ] Push / open a PR (never done autonomously)
- [ ] Remove the build worktree at {location} when you are done with it
```

The branch/worktree location is **required**, not optional. No autonomous phase removes a
worktree — the work is unreviewed, so deleting it is destructive. Reporting the location
is what keeps it from being an orphan the user never learns about. If the run used no
worktree, say so on that line rather than omitting it.

If the chain halted early, say which phase and why in place of the missing
sections. Never present a halted run as a completed one.
