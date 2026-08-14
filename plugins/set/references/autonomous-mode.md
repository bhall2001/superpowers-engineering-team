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

`--autonomous` is valid on `/set-design`, `/set-plan`, `/set-build`,
`/set-review`. On `/set-learn` it is an error — print exactly:

> `--autonomous` has no effect on `/set-learn`: it is the last phase of the
> cycle. Running `/set-learn` normally.

Then continue normally. Do not silently ignore it.

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
the human the browser check and the push decision.

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
- [ ] Browser-verify the change
- [ ] Push / open a PR (never done autonomously)
- [ ] Remove the build worktree at {location} when you are done with it
```

The branch/worktree location is **required**, not optional. No autonomous phase removes a
worktree — the work is unreviewed, so deleting it is destructive. Reporting the location
is what keeps it from being an orphan the user never learns about. If the run used no
worktree, say so on that line rather than omitting it.

If the chain halted early, say which phase and why in place of the missing
sections. Never present a halted run as a completed one.
