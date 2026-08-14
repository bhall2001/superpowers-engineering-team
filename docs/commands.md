# SET Command Reference

## `/set-init`

**Run once per project** before starting the pipeline.

Detects your tech stack, scaffolds domain specialist agents, augments `CLAUDE.md` with conventions and build commands, and creates required directories.

**What it creates:**
- `.claude/agents/` — specialist agent definitions (DB, UI, API, QA, architect based on detected stack)
- `.claude/plans/` — where task plans are stored
- `docs/superpowers/specs/` — where design specs are saved

**Safety:** Never overwrites existing files. Shows proposed changes and asks for confirmation.

---

## `/set-design [feature idea]`

**Phase 1 — Design**

Runs the Superpowers collaborative design process for your feature. Works through the idea section by section, stops for human approval at each stage.

**Output:** Design spec saved to `docs/superpowers/specs/`

**Next step:** `/set-plan`

---

## `/set-plan`

**Phase 2 — Plan**

Reads the latest design spec and transposes it into a parallelizable task plan optimized for parallel subagent fan-out.

**Each task in the plan includes:**
- Acceptance criteria ("Done when...")
- TDD steps (specific tests to write first)
- Self-review checklist
- Specialist tag (which agent should handle it)
- Dependency links (blockedBy)

**Output:** Plan saved to `.claude/plans/`

**Next step:** `/set-build`

---

## `/set-build`

**Phase 3 — Build**

Executes the plan as a native Agent Team with enhanced TDD and verification discipline.

**Build modes.** By default, `/set-build` compiles the plan into a build brief, then spawns builder teammates — one per task, routed by the task's `Specialist` — plus a dedicated verifier teammate per task that writes no code and checks the work against the rubric. This requires the Agent Teams env flag, which the installer writes by default.

Pass `--use-workflow` to run the same brief as a dynamic workflow instead. That path needs no env flag and is what `/set-build` offers as a fallback if Agent Teams are unavailable. `--use-agent-team` is accepted as a no-op alias for the default.

### Step 1: Isolated Worktree
Creates a `feat/{feature-name}` branch in an isolated worktree. Runs project setup. Verifies tests pass before any implementation begins.

**Disabling worktrees:** If `git worktree` isn't viable on your system, you can skip worktree creation and build on the current branch:

- Per-run: `/set-build --no-worktree`
- Per-run override (force on): `/set-build --worktree`
- Per-project default: add `SET: no-worktree` to CLAUDE.md

Precedence: CLI flag > CLAUDE.md > default (enabled). In no-worktree mode, project setup and baseline tests still run, but on the current branch with no `cd`.

### Step 2–4: Parallel Build and Verify
Spawns one builder teammate per task, each routed by the task's specialist (matched from `.claude/agents/`). Each builder runs the per-task TDD loop. A dedicated verifier teammate — one that did not write the code — then checks each task against a rubric before it folds back. SET no longer hand-rolls retry or escalation mechanics: the team runs a verify-and-revise loop until each task meets the bar.

**Per-task TDD loop:**
1. Write failing tests first
2. Implement minimal code to pass
3. Refactor while keeping green
4. Lint → typecheck → self-review
5. Commit only when all checks pass

**Per-task verification rubric:**
- Spec compliance (every acceptance criterion verified independently)
- TDD discipline (failing test first, then green)
- Lint and typecheck clean

### Wrap Up
Folds completed tasks back, reports worktree location, and suggests `/set-review`.

**Note:** Worktree is preserved for `/set-review` to examine. In no-worktree mode, `/set-review` operates against the current branch instead.

**Next step:** `/set-review`

---

## `/set-review`

**Phase 4 — Review**

A dynamic-workflow fan-out examines all changes across four lenses × the affected modules. Each lens agent is independent — it did not write the code, and it treats the build's verification report as claims to audit rather than facts:

1. **Spec Compliance** — reads design spec + plan, verifies everything was built as designed
2. **Security** — injection, XSS, hardcoded secrets, auth gaps, missing validation
3. **Architecture** — patterns, conventions, abstractions, dependencies
4. **Correctness** — logic errors, edge cases, test coverage

SET synthesizes the findings into a single ship/iterate/block verdict. For small diffs, `/set-review --light` runs four plain parallel subagents instead of the full per-module fan-out.

**Finishing step:** Offers four options (merge to main, create PR, keep branch, discard) via Superpowers' `finishing-a-development-branch`.

**Next step:** `/set-learn`

---

## `/set-learn`

**Phase 5 — Learn**

The self-improving loop. Analyzes the full cycle (design through review) and updates the system.

**Project-level updates (CLAUDE.md):**
- What worked well (patterns to repeat)
- What failed (mistakes to avoid)
- Recurring bugs (things to watch for)
- Build command updates
- Architecture updates

**Agent-level updates (`.claude/agents/*.md`):**
- Domain knowledge gaps revealed by the cycle
- Common mistakes this agent made
- Patterns this agent handled well
- New conventions to follow

Each agent gets updates specific to its performance. Cross-agent learnings go to `CLAUDE.md`.

**Archives** the completed plan.

---

## `/set-update`

**Maintenance**

Updates SET and Superpowers to the latest versions, and migrates project files from earlier SET versions. SET is not in an official Claude marketplace — update by re-running the installer.

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

```
/plugin update superpowers@claude-plugins-official
```

Run periodically to get improvements and bug fixes.

---

## Switches

### `--autonomous`

Valid on all five cycle phases. Runs that phase and every remaining phase through
`/set-learn` without stopping at human gates.

On `/set-learn` there is nothing left to chain to, but the flag still suppresses that
phase's own gates — it otherwise asks you to approve the taxonomy, each new domain, and
every agent update. Under the flag it applies them and reports what it applied.

```bash
/set-plan my-feature --autonomous
```

On an `ITERATE` verdict, `/set-review` runs a bounded fix-and-re-review loop: findings
are routed to the specialist owning each domain, then re-reviewed by a fresh four-lens
pass. It stops when the review is clean, when a round turns up no new findings, or after
2 rounds. A `BLOCK` verdict or a failed lens halts immediately.

An autonomous run **never pushes, opens a PR, merges, or claims the work verified.** It
ends by handing you your project's acceptance check and the push decision — whatever
`CLAUDE.md` says decides that a change actually works: running the CLI, hitting the
endpoint, exercising the page, a manual QA pass. Automated tests do not count; the run
already ran those and would be grading its own homework.

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
