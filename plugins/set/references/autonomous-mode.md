# SET Autonomous Mode — Shared Contract

Cited by `/set-design`, `/set-plan`, `/set-build`, `/set-review`, `/set-learn`.
This file is the single definition of flag behavior; the commands do not restate it.

## Flag Parsing

Both flags are parsed from `$ARGUMENTS` and stripped before the remaining
arguments are interpreted as the command's normal input (feature name, spec
path, branch range).

- `--autonomous` — run this phase and every remaining phase through
  `/set-learn` without stopping at human gates.
- `--verbose` — report each agent spawn and return.

Flags may appear in any order and in combination with existing flags
(`--light`, `--use-workflow`, `--no-worktree`).

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

`N` = the total number of phases in the chain being run: the entry phase through
`/set-learn` inclusive. `n` = this phase's 1-based position in that chain. Both are
fixed at the entry phase and never recomputed. Entering at `/set-design` gives `N` = 5
(`[1/5]` … `[5/5]`); entering at `/set-review` gives `N` = 2 (`[1/2]`, `[2/2]`).
Without `--autonomous` there is no chain — omit `[n/N]`.

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

Resolve the next command from `~/.claude/commands/set-{phase}.md`. If that file
is missing, halt and report the missing file — do not attempt the phase from
memory.

**No state is written to disk.** The flags live in the conversation only. A
session that ends drops autonomy naturally, so a later manual `/set-build` can
never be silently auto-chained. Autonomous runs are therefore NOT resumable
after a crash; recovery is a manual re-invoke from the last completed phase.

Each phase still writes its normal artifacts (spec, plan, commits, shards).
Those artifacts are the handoff between phases, exactly as in a supervised run.

**Each phase also accumulates the Final Report payload and passes it forward**, on top of
whatever its successor specifically needs. The payload starts at the entry phase and only
grows: the entry phase name, the phases run so far, and each phase's headline result and
artifact paths — spec path, plan path, per-task verdicts and diff stat, branch/worktree
location, review verdict and iterate-loop outcome. `/set-learn` renders it as the
Autonomous Final Report; anything dropped mid-chain is missing from what the user reads.

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
