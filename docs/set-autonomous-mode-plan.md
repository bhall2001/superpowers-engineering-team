# SET Autonomous Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--autonomous` (chain remaining SET phases without human gates) and `--verbose` (per-agent progress output) to the five SET cycle commands.

**Architecture:** A shared reference file defines flag parsing, chaining, and reporting once; each of the five command specs cites it and adds an Autonomous Mode section describing how that phase suppresses its own gate and hands off to the next. `/set-review` additionally gains the bounded iterate loop. No installer changes — `install.sh` already copies every edited file.

**Tech Stack:** Markdown command specs (no build system, no test runner). Distribution via `install.sh` copying `plugins/set/commands/*.md` → `~/.claude/commands/set-*.md`.

**Spec:** `docs/set-autonomous-mode-spec.md`

## Global Constraints

- **This repo has no build, test, or lint tooling.** All "code" is markdown command specs. Verification is by reading the file and by grep assertions, not by a test runner.
- **Plugin files are the single source of truth.** Never edit `~/.claude/commands/` — `install.sh` copies from `plugins/set/commands/`.
- **The work must land on `main`** to reach users via `/set-update`.
- **`--verbose` applies to the five cycle phases only** (`design`, `plan`, `build`, `review`, `learn`). `/set-init` and `/set-update` are untouched.
- **`--autonomous` is rejected on `/set-learn`** (terminal) with a one-line explanation, never a silent no-op.
- **Autonomous runs never push, open a PR, merge, or claim the work verified.** These are hard boundaries.
- **Editing a command's inter-command contract requires checking downstream commands** (repo CLAUDE.md:44).
- Commit style: `feat:` / `docs:` prefix, and end every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `plugins/set/references/autonomous-mode.md` | **New.** Single definition of flag parsing, the chaining mechanism, verbosity levels, and the final report format. Cited by all five commands. |
| `plugins/set/commands/design.md` | Accept flags; autonomous brainstorming path; chain → plan |
| `plugins/set/commands/plan.md` | Accept flags; suppress approval gate; chain → build |
| `plugins/set/commands/build.md` | Accept flags; auto-resolve availability gate; suppress Phase C gate; chain → review |
| `plugins/set/commands/review.md` | Accept flags; iterate loop; fix-pass routing; chain → learn |
| `plugins/set/commands/learn.md` | Accept `--verbose`; reject `--autonomous`; shard origin tagging; final chain report |
| `install.sh` | Add the one new reference file to the copy list + verify loop |
| `README.md`, `docs/commands.md`, `docs/workflow.md` | User-facing switch documentation |

Why a shared reference: the parse rules and chaining contract are identical across five files. Duplicating them five times guarantees drift — and this repo has no tests to catch it. The repo already uses `references/` for exactly this (`enhanced-builder-prompt.md`).

---

### Task 1: Shared autonomous-mode reference

**Files:**
- Create: `plugins/set/references/autonomous-mode.md`
- Modify: `install.sh` (copy list ~line 330, verify loop ~line 407)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: the file `references/autonomous-mode.md`, installed to `~/.claude/commands/references/autonomous-mode.md`. Tasks 2–6 cite it by that installed path. Defines these named concepts that later tasks reference verbatim: **Flag Parsing**, **Chaining Contract**, **Verbosity Levels**, **Autonomous Final Report**, **Hard Boundaries**.

- [ ] **Step 1: Read the existing reference file and installer copy list to match conventions**

Read `plugins/set/references/enhanced-builder-prompt.md` (structure/tone) and `install.sh` lines 320–340 and 400–415 (how references are copied and verified).

- [ ] **Step 2: Create the reference file**

Create `plugins/set/references/autonomous-mode.md`:

```markdown
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

### Artifacts
- Spec: {path}
- Plan: {path}
- Branch/worktree: {location}
- Shards written: {list}

### Not done for you
- [ ] Browser-verify the change
- [ ] Push / open a PR (never done autonomously)
```

If the chain halted early, say which phase and why in place of the missing
sections. Never present a halted run as a completed one.
```

- [ ] **Step 3: Add the reference to the installer copy list**

In `install.sh`, find the `install_file "references/..."` block (~line 330) and add:

```bash
  install_file "references/autonomous-mode.md" "references/autonomous-mode.md"
```

- [ ] **Step 4: Add it to the installer verify loop**

Find the verify loop over reference names (~line 407, `for ref in ...`) and add `autonomous-mode` to that list.

- [ ] **Step 5: Verify the installer wiring**

```bash
cd ~/develop/superpowers-engineering-team
grep -n "autonomous-mode" install.sh
```

Expected: two hits — one `install_file` line, one in the verify loop list.

- [ ] **Step 6: Verify the reference file defines all five named concepts**

```bash
for s in "Flag Parsing" "Verbosity Levels" "Chaining Contract" "Hard Boundaries" "Autonomous Final Report"; do
  grep -q "^## $s\$" plugins/set/references/autonomous-mode.md && echo "OK   $s" || echo "MISS $s"
done
```

Expected: all five OK.

Do not assert a total `^## ` count — the Autonomous Final Report template contains
its own `## SET Autonomous Run Complete` heading inside a fenced block, so a raw
count returns 6, not 5.

- [ ] **Step 7: Commit**

```bash
git add plugins/set/references/autonomous-mode.md install.sh
git commit -m "$(cat <<'EOF'
feat: shared autonomous-mode contract + installer wiring

Single definition of flag parsing, chaining, verbosity, and the final report.
The five cycle commands cite it rather than restating the rules, which would
drift in a repo with no tests to catch it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `/set-design` — flags and chain to plan

**Files:**
- Modify: `plugins/set/commands/design.md` (add Autonomous Mode section; modify handoff at lines 24–28; modify Input at lines 34–38)

**Interfaces:**
- Consumes: `references/autonomous-mode.md` (Task 1) — Flag Parsing, Chaining Contract, Verbosity Levels
- Produces: a chained handoff to `/set-plan` carrying both flags. `/set-plan` (Task 3) receives the spec path as its normal argument.

- [ ] **Step 1: Update the Input section to parse flags**

Replace lines 34–38 (`## Input` through the empty-arguments line) with:

```markdown
## Input

User provides the feature idea via: `/set-design $ARGUMENTS`

Parse `--autonomous` and `--verbose` per
`~/.claude/commands/references/autonomous-mode.md` and strip them; the remainder
is the feature idea.

If the remainder is empty **and** `--autonomous` is not set, ask: "What would you
like to build?"

If the remainder is empty **and** `--autonomous` is set, halt: an autonomous run
has no one to ask. Print: "`/set-design --autonomous` needs a feature idea as an
argument — there is no interactive prompt in autonomous mode."
```

- [ ] **Step 2: Add the Autonomous Mode section**

Insert after the `## Key Difference from Standard Superpowers` section (after line 32), before `## Input`:

```markdown
## Autonomous Mode

Under `--autonomous`, the brainstorming skill's interactive gates are suppressed.
Read `~/.claude/commands/references/autonomous-mode.md` first.

Run the design phase against yourself:

1. Explore project context as normal.
2. Answer your own clarifying questions from the codebase and the feature idea.
   Where a question is genuinely underdetermined, choose the option that keeps
   scope smallest and record the choice in the spec's Open Questions section.
3. Propose approaches to yourself, select one on its own merits, and record the
   rejected alternatives in the spec.
4. Write the spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` as normal
   — the artifact is unchanged, only the approval is.
5. Run the existing spec self-review loop. Fix what it finds.
6. Do NOT wait for human spec approval. Chain to `/set-plan` per the Chaining
   Contract, passing the spec path plus both flags.

**This is the least reliable phase to automate.** The agent authors its own
requirements, so a poor design costs tokens twice — building it, then fixing it.
Prefer starting autonomy at `/set-plan` from a human-approved spec.
```

- [ ] **Step 3: Make the handoff conditional**

Replace step 3–4 of the Process (lines 24–28) with:

```markdown
3. **STOP before invoking writing-plans.** Unlike the standard Superpowers flow, do NOT automatically transition to writing-plans.

4. Then:

   - **Without `--autonomous`** — tell the user:

     > "Design complete and saved to `<path>`. Ready to plan the implementation? Run `/set-plan <feature-name>` to create a parallel-execution plan for the build workflow."

   - **With `--autonomous`** — do not print the prompt above. Emit the phase-boundary line and chain to `/set-plan` per the Chaining Contract.
```

- [ ] **Step 4: Verify the edits landed and are self-consistent**

```bash
cd ~/develop/superpowers-engineering-team
grep -n "autonomous\|verbose" plugins/set/commands/design.md
```

Expected: an `## Autonomous Mode` section, flag parsing in Input, a conditional handoff, and the caution paragraph. Confirm the non-autonomous handoff text is byte-identical to what it was before (a supervised run must behave exactly as it did).

- [ ] **Step 5: Commit**

```bash
git add plugins/set/commands/design.md
git commit -m "$(cat <<'EOF'
feat: --autonomous and --verbose on /set-design

Autonomous design answers its own clarifying questions, self-approves the spec,
and chains to /set-plan. Records underdetermined choices and rejected
alternatives in the spec so a human can audit what it decided alone.

Halts if given no feature idea — there is no one to ask in autonomous mode.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `/set-plan` — flags and chain to build

**Files:**
- Modify: `plugins/set/commands/plan.md` (Input section lines 11–18; approval gate lines 108–114)

**Interfaces:**
- Consumes: `references/autonomous-mode.md` (Task 1); a spec path from Task 2's chain
- Produces: a chained handoff to `/set-build` carrying both flags, passing `{feature-name}` as the argument. `/set-build` (Task 4) receives that name.

- [ ] **Step 1: Update Input to parse flags**

After line 18 (the `- Empty — search ...` bullet), add:

```markdown

Parse `--autonomous` and `--verbose` per
`~/.claude/commands/references/autonomous-mode.md` and strip them before
interpreting the remainder as the spec name or path.

Under `--autonomous` with an empty remainder, do not "confirm with user" — take
the most recent spec in `docs/superpowers/specs/` and report which one was chosen
on the phase-boundary line.
```

- [ ] **Step 2: Replace the approval gate with a conditional**

Replace lines 108–114 (`### 5. Present for Approval` through the handoff quote) with:

```markdown
### 5. Present for Approval

**Without `--autonomous`:** Show the plan. Wait for user to approve, modify, or reject.

After approval:

> "Plan saved to `.claude/plans/{feature-name}.md`. Ready to build? Run `/set-build {feature-name}` to execute it as a native Agent Team by default (or `/set-build {feature-name} --use-workflow` for the dynamic-workflow path)."

**With `--autonomous`:** Do not wait. Re-read the plan against the Step 4 review
criteria (parallelism marks are real, acceptance criteria are verifiable, TDD steps
make sense, no missing tasks) and fix what fails. Then emit the phase-boundary line
and chain to `/set-build {feature-name}` per the Chaining Contract.

Carry the plan's Unresolved Questions into the chain: they are reported in the
Autonomous Final Report rather than blocking, since there is no human to answer them.
```

- [ ] **Step 3: Verify**

```bash
cd ~/develop/superpowers-engineering-team
grep -n "autonomous\|Unresolved" plugins/set/commands/plan.md
```

Expected: flag parsing in Input, a conditional at step 5, unresolved-questions carry-forward. The supervised branch's handoff text must be unchanged.

- [ ] **Step 4: Commit**

```bash
git add plugins/set/commands/plan.md
git commit -m "$(cat <<'EOF'
feat: --autonomous and --verbose on /set-plan

Autonomous planning self-reviews the plan against the existing step 4 criteria
instead of waiting for approval, then chains to /set-build. Unresolved questions
travel to the final report rather than blocking, since no human is there to
answer them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `/set-build` — flags, gate auto-resolution, chain to review

**Files:**
- Modify: `plugins/set/commands/build.md` (Execution Mode lines 11–25; Agent Team Availability Gate lines 160–200; failing-test prompt line 90; Phase C lines 372–383)

**Interfaces:**
- Consumes: `references/autonomous-mode.md` (Task 1); a feature name from Task 3's chain
- Produces: a chained handoff to `/set-review` carrying both flags. Passes forward: the branch/worktree location, per-task verdicts, and the diff stat — Task 5's iterate loop and Task 6's final report both consume these.

- [ ] **Step 1: Add flag parsing to the Execution Mode section**

In the `Check $ARGUMENTS:` block at line 17, add these bullets alongside the existing `--use-workflow` handling:

```markdown
- `--autonomous` / `--verbose` — parse and strip per
  `~/.claude/commands/references/autonomous-mode.md`.
```

- [ ] **Step 2: Auto-resolve the Agent Team availability gate**

At the `Agent Team Availability Gate` section (line 160), before the "present exactly two options and wait for the user" instruction at line 172, insert:

```markdown
**Under `--autonomous`, do not present options or wait.** Select the
dynamic-workflow path (Phase B-workflow, the `--use-workflow` semantics) and
report on the phase-boundary line: `Agent Teams unavailable — using workflow path`.
The workflow path needs no env var, so it always runs.
```

- [ ] **Step 3: Make the failing-baseline prompt conditional**

At line 90 (`If tests fail, ask the user whether to proceed or investigate`), replace with:

```markdown
Run the test suite from CLAUDE.md "Build Commands".

- **Without `--autonomous`:** if tests fail, ask the user whether to proceed or investigate.
- **With `--autonomous`:** if tests fail, record the failing baseline and proceed. A
  pre-existing failure is not this cycle's regression, and `/set-review`'s correctness
  lens will surface it as a `critical` finding if it matters. Report the failure count
  on the phase-boundary line.
```

- [ ] **Step 4: Make Phase C conditional**

Replace Phase C step 5 (line 380, the `Suggest:` line) and add a branch after step 4:

```markdown
5. Then:

   - **Without `--autonomous`** — suggest: "Run `/set-review` for the independent holistic review, then `/set-learn` to capture learnings."

   - **With `--autonomous`** — do not suggest; emit the phase-boundary line and chain to
     `/set-review` per the Chaining Contract, passing the branch/worktree location and
     the per-task verdicts. The verification report travels as **claims to audit**,
     exactly as in a supervised run — autonomy does not upgrade self-grading into truth.
```

- [ ] **Step 5: Verify all four edit sites landed**

```bash
cd ~/develop/superpowers-engineering-team
grep -n "autonomous" plugins/set/commands/build.md
```

Expected: 4+ hits — flag parsing, availability gate auto-resolution, failing-baseline branch, Phase C branch. Confirm the "human gate" language at Phase C step 2 still applies to the supervised path.

- [ ] **Step 6: Verify the worktree is preserved for review**

```bash
grep -n "do NOT remove\|Do \*\*not\*\* remove" plugins/set/commands/build.md
```

Expected: the existing instruction to leave the worktree for `/set-review` is intact — the chain depends on it.

- [ ] **Step 7: Commit**

```bash
git add plugins/set/commands/build.md
git commit -m "$(cat <<'EOF'
feat: --autonomous and --verbose on /set-build

Availability gate auto-selects the workflow path instead of waiting; a failing
baseline is recorded and passed to review rather than prompting. Phase C chains
to /set-review, still framing the verification report as claims to audit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `/set-review` — flags, iterate loop, fix-pass routing

**Files:**
- Modify: `plugins/set/commands/review.md` (line 43 flag check; new Step 3b after line 162; Step 4 routing lines 164–172; Step 5 finishing lines 174–182)

**Interfaces:**
- Consumes: `references/autonomous-mode.md` (Task 1); branch/worktree + verdicts from Task 4's chain
- Produces: a chained handoff to `/set-learn` carrying both flags plus the iterate-loop outcome (`rounds_spent`, `exit_condition`, `remaining_findings`) — Task 6's final report consumes these three by name.

- [ ] **Step 1: Extend the existing flag check**

Replace line 43 (`Check $ARGUMENTS for --light.`) with:

```markdown
Check `$ARGUMENTS` for `--light`. Parse and strip `--autonomous` and `--verbose`
per `~/.claude/commands/references/autonomous-mode.md`.
```

- [ ] **Step 2: Add the iterate loop as a new Step 3b**

Insert after the `### Optional: Adversarial Round` section (after line 162), before `## Step 4`:

```markdown
## Step 3b: The Iterate Loop (autonomous only)

Skipped entirely without `--autonomous`.

On the synthesized verdict:

- **SHIP / clean** → chain to `/set-learn`.
- **BLOCK, or any lens returned `FAILED`** → **halt immediately, iterations unspent.**
  BLOCK means something is fundamentally wrong; a `FAILED` lens means missing coverage,
  not a findings list a fix agent can act on. Neither is fixable by another round, and
  spending one produces two expensive passes papering over the real problem. Report and
  hand back to the human.
- **ITERATE** → run a fix pass (below), then a **fresh** re-review — a full Step 2
  fan-out, not a re-read of prior findings.

### Loop exit conditions

Stop on whichever comes first:

1. **Review comes back clean** → chain to `/set-learn`.
2. **No new findings** — every finding this round was already reported last round,
   matched on file + issue. A shrinking list of known findings means the fix pass works
   but is incomplete: report and hand back rather than spend a round on diminishing
   returns.
3. **2 rounds spent** → halt. A loop still surfacing genuinely new issues after two
   rounds is itself the signal.

The cap is a ceiling, not a target; condition 2 is expected to fire more often than 3.

### The fix pass routes findings by domain

A fix pass is **NOT** a build re-run.

1. Compile the findings into a fix brief, one entry per finding: file, line, severity,
   the lens that raised it, and the suggested fix.
2. Route each finding to the specialist that owns its domain, using the same
   specialist-matching `/set-plan` uses — **including specialists the original build
   never spawned.** A security finding in an API/sync module gets that owner even when
   the build only touched UI and database tasks. This is the point of routing by
   finding rather than handing everything back to the original builders.
3. Spawn fix agents in **fresh contexts**, each receiving only its own findings plus the
   relevant learning shards.
4. Under `--verbose`, report each finding's routing decision.

The re-review is a fresh independent four-lens run, so a lens never reviews code it
helped fix — the independence guaranteed by the Step 2b return contract holds across
rounds.

Carry forward to `/set-learn`: `rounds_spent`, `exit_condition`
(`clean` | `no new findings` | `round cap` | `BLOCK` | `lens FAILED`), and
`remaining_findings`.
```

- [ ] **Step 3: Make Step 4 verdict routing conditional**

At the top of `## Step 4: Route the Verdict` (line 164), insert:

```markdown
**Under `--autonomous`, Step 3b has already routed the verdict** — skip this step and
proceed to the chain. The prompts below are for supervised runs, where a human chooses.
```

- [ ] **Step 4: Make Step 5 finishing conditional**

At the top of `## Step 5: Finishing` (line 174), insert:

```markdown
**Under `--autonomous`, skip this step entirely.** The four integration options below
include pushing and opening a PR, which autonomous mode never does (see Hard
Boundaries). Leave the branch and worktree exactly as they are; chain to `/set-learn`.
```

- [ ] **Step 5: Verify the loop and boundary edits**

```bash
cd ~/develop/superpowers-engineering-team
grep -n "Step 3b\|iterate\|Iterate\|rounds_spent\|exit_condition" plugins/set/commands/review.md
```

Expected: the Step 3b section, three exit conditions, the three carry-forward field names.

- [ ] **Step 6: Verify hard boundaries are enforced at the one place that could violate them**

```bash
grep -n -A3 "Step 5: Finishing" plugins/set/commands/review.md
```

Expected: the autonomous skip appears immediately under the heading, before the four options that include "Push and create a Pull Request".

- [ ] **Step 7: Verify the lens return contract was not disturbed**

```bash
grep -n "schema\|LENS_SCHEMA\|reviewed: false" plugins/set/commands/review.md
```

Expected: unchanged from before this task — the iterate loop reuses Step 2's fan-out and must not alter the return contract.

- [ ] **Step 8: Commit**

```bash
git add plugins/set/commands/review.md
git commit -m "$(cat <<'EOF'
feat: bounded iterate loop on /set-review --autonomous

ITERATE runs a fix pass then a fresh four-lens re-review. Exits on clean, no new
findings, or 2 rounds. BLOCK or a FAILED lens halts immediately with iterations
unspent — neither is a findings list a fix agent can act on.

Fix passes route each finding to the specialist owning its domain, including
specialists the original build never spawned.

Step 5 finishing is skipped under --autonomous: it offers push and PR.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `/set-learn` — flag rejection, shard tagging, final report

**Files:**
- Modify: `plugins/set/commands/learn.md` (Input lines 9–11; shard-writing section 3 at line 58; Report section 8 at line 267)

**Interfaces:**
- Consumes: `references/autonomous-mode.md` (Task 1); `rounds_spent`, `exit_condition`, `remaining_findings` from Task 5's chain
- Produces: the terminal Autonomous Final Report. Nothing consumes this — it is the end of the chain.

- [ ] **Step 1: Add flag handling to Input**

After line 11 in `## Input`, add:

```markdown

Parse `--verbose` per `~/.claude/commands/references/autonomous-mode.md`.

`--autonomous` is an error here — `/set-learn` is the last phase. Print:

> `--autonomous` has no effect on `/set-learn`: it is the last phase of the cycle.
> Running `/set-learn` normally.

Then continue normally.
```

- [ ] **Step 2: Tag shards written during an autonomous run**

In section `### 3. Update Sharded Learnings` (line 58), add after the shard entry format description:

```markdown
**Autonomous-cycle tagging.** When reached via an autonomous chain, append
` (unverified cycle)` to each entry's date prefix:

```
[2026-08-13] (unverified cycle) Some learning...
```

The tag exists because `/set-learn` runs before any human has browser-verified the
work, so a learning captured here may encode a mistake as a pattern. Tagged entries stay
traceable and removable rather than anonymous. Shards are plain markdown — a human can
delete or promote the entry after verifying.
```

- [ ] **Step 3: Emit the final report**

In `### 8. Report to User` (line 267), add at the end:

```markdown
**When reached via an autonomous chain,** emit the Autonomous Final Report from
`~/.claude/commands/references/autonomous-mode.md` instead of the normal report,
filling in every field from the chain: phases run, build results, review verdict,
`rounds_spent`, `exit_condition`, `remaining_findings`, artifact paths, and the shards
written this run.

End with the two unchecked handoff items — browser verification and the push decision.
Never present the run as done: nothing has been verified in a browser and nothing has
been pushed.
```

- [ ] **Step 4: Verify all three edits**

```bash
cd ~/develop/superpowers-engineering-team
grep -n "autonomous\|unverified cycle" plugins/set/commands/learn.md
```

Expected: flag rejection in Input, shard tagging in section 3, final report in section 8.

- [ ] **Step 5: Verify the git-visibility check still runs**

```bash
grep -n "7b\|visible to git" plugins/set/commands/learn.md
```

Expected: section 7b intact — an autonomous run writes shards that must still be checked for trackability, or the learnings vanish.

- [ ] **Step 6: Commit**

```bash
git add plugins/set/commands/learn.md
git commit -m "$(cat <<'EOF'
feat: /set-learn rejects --autonomous, tags unverified shards, ends the chain

Shards written during an autonomous run carry an (unverified cycle) tag: learn
runs before any human browser check, so a learning may encode a mistake as a
pattern. Tagged entries stay traceable rather than anonymous.

Emits the Autonomous Final Report, ending with the browser check and push
decision unchecked.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: User-facing documentation

**Files:**
- Modify: `README.md`, `docs/commands.md`, `docs/workflow.md`

**Interfaces:**
- Consumes: the behavior defined in Tasks 1–6
- Produces: nothing consumed by later tasks (final task)

- [ ] **Step 1: Read the existing docs to match structure**

```bash
cd ~/develop/superpowers-engineering-team
grep -n "^#\{1,3\} " README.md docs/commands.md docs/workflow.md
```

- [ ] **Step 2: Document both switches in `docs/commands.md`**

Add a section following the file's existing per-command structure:

```markdown
## Switches

### `--autonomous`

Valid on `/set-design`, `/set-plan`, `/set-build`, `/set-review`. Runs that phase and
every remaining phase through `/set-learn` without stopping at human gates.

```bash
/set-plan my-feature --autonomous
```

On an `ITERATE` verdict, `/set-review` runs a bounded fix-and-re-review loop: findings
are routed to the specialist owning each domain, then re-reviewed by a fresh four-lens
pass. It stops when the review is clean, when a round turns up no new findings, or after
2 rounds. A `BLOCK` verdict or a failed lens halts immediately.

An autonomous run **never pushes, opens a PR, merges, or claims the work verified.** It
ends by handing you the browser check and the push decision.

Autonomy carries in the session only — nothing is written to disk, so a later manual
command is never silently auto-chained. Runs are not resumable after a crash; re-invoke
from the last completed phase.

### `--verbose`

Valid on all five cycle phases, with or without `--autonomous`.

Default output is one line entering and leaving each phase. `--verbose` adds each agent
spawn and return — useful on a supervised `/set-build`, which otherwise runs an entire
Agent Team silently between spawn and the final gate.

There is no `--quiet`: phase boundaries are the floor, since a supervised run's output is
what you act on at the gate.
```

- [ ] **Step 3: Add the switches and the design caution to `README.md`**

In the command/pipeline section:

```markdown
### Autonomous runs

Add `--autonomous` to `/set-design`, `/set-plan`, `/set-build`, or `/set-review` to run
that phase and everything after it through `/set-learn` without stopping at gates. Add
`--verbose` (independently) for per-agent progress output.

> **Caution: `--autonomous` on `/set-design` is not currently best practice.** The agent
> authors its own requirements, so a poor design costs tokens twice — once building it,
> and again fixing it. Prefer starting autonomy at `/set-plan`, from a human-approved
> spec.

Autonomous runs never push, open a PR, or merge. They end by handing you the browser
check and the push decision.
```

- [ ] **Step 4: Note the autonomous path in `docs/workflow.md`**

Add to the pipeline description: from any phase, `--autonomous` chains the remaining
phases through `/set-learn` in one session; link to `docs/commands.md` for the full
switch reference.

- [ ] **Step 5: Verify the caution note is present and the docs agree with the commands**

```bash
cd ~/develop/superpowers-engineering-team
grep -n "not currently best practice" README.md
grep -rn "quiet" README.md docs/commands.md
```

Expected: the caution note appears in README; **no** `--quiet` references anywhere (it does not exist).

- [ ] **Step 6: Verify the docs claim matches the reference file**

```bash
grep -n "2 rounds\|no new findings" docs/commands.md plugins/set/references/autonomous-mode.md plugins/set/commands/review.md
```

Expected: the exit conditions described in the docs match those in `review.md`.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/commands.md docs/workflow.md
git commit -m "$(cat <<'EOF'
docs: document --autonomous and --verbose

Includes the caution that autonomous design is not yet best practice: the agent
authors its own requirements, so a poor design costs tokens twice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification

Run after all tasks. This repo has no test suite, so verification is grep assertions over the specs.

- [ ] **All five commands cite the shared reference**

```bash
cd ~/develop/superpowers-engineering-team
for f in design plan build review learn; do
  printf '%-8s %s\n' "$f" "$(grep -c 'references/autonomous-mode.md' plugins/set/commands/$f.md)"
done
```

Expected: every command ≥ 1.

- [ ] **The installer copies every edited file**

```bash
for f in design plan build review learn; do
  grep -q "commands/$f.md" install.sh && echo "$f OK" || echo "$f MISSING"
done
grep -q "references/autonomous-mode.md" install.sh && echo "reference OK" || echo "reference MISSING"
```

Expected: all OK. This is the distribution acceptance criterion — a file not in the copy list never reaches users.

- [ ] **Hard boundaries hold**

```bash
grep -rn "autonomous" plugins/set/commands/*.md plugins/set/references/autonomous-mode.md \
  | grep -i "push\|pull request\| PR\|merge"
```

Expected: every hit is a prohibition, not an instruction to do it.

- [ ] **No `--quiet` crept in**

```bash
grep -rn '\-\-quiet' plugins/set/ README.md docs/ || echo "none — correct"
```

- [ ] **`--autonomous` is rejected on the two terminal commands**

```bash
grep -n "no effect on" plugins/set/commands/learn.md
grep -c "autonomous" plugins/set/commands/init.md plugins/set/commands/update.md
```

Expected: learn prints the rejection; init and update have 0 hits (untouched).

- [ ] **Supervised behavior is unchanged**

```bash
git diff main --stat
git diff main -- plugins/set/commands/ | grep '^-' | grep -v '^---'
```

Review every removed line: each must be either replaced by a conditional whose
non-autonomous branch preserves the original text, or a genuine intentional change. A
supervised run must behave exactly as it did before this feature.

## Self-Review Notes

**Spec coverage** — every spec section maps to a task: switches → 1–6; mechanism → 1; gate suppression table → 2–6 (one row each); iterate loop → 5; terminal state and shard tagging → 6; distribution → 1 (installer) + Final Verification; README caution → 7.

**Naming consistency** — `rounds_spent`, `exit_condition`, `remaining_findings` are produced in Task 5 and consumed by name in Task 6 and in Task 1's report template. The five named concepts in Task 1 (Flag Parsing, Chaining Contract, Verbosity Levels, Autonomous Final Report, Hard Boundaries) are referenced by those exact names in Tasks 2–6.

**Known risk** — Tasks 2–6 all cite `~/.claude/commands/references/autonomous-mode.md`, the *installed* path. It only exists after `install.sh` runs. This is consistent with how the repo already treats `references/enhanced-builder-prompt.md`, but it means the feature cannot be exercised from the repo checkout alone — it must be installed first. Task 1's installer wiring is therefore a hard prerequisite for testing anything, not just for shipping.
