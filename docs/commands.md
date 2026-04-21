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

Reads the latest design spec and transposes it into a parallelizable task plan optimized for Agent Teams.

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

Executes the plan using an Agent Team with enhanced TDD and QA discipline.

### Step 1: Isolated Worktree
Creates a `feat/{feature-name}` branch in an isolated worktree. Runs project setup. Verifies tests pass before any implementation begins.

**Disabling worktrees:** If `git worktree` isn't viable on your system, you can skip worktree creation and build on the current branch:

- Per-run: `/set-build --no-worktree`
- Per-run override (force on): `/set-build --worktree`
- Per-project default: add `SET: no-worktree` to CLAUDE.md

Precedence: CLI flag > CLAUDE.md > default (enabled). In no-worktree mode, project setup and baseline tests still run, but on the current branch with no `cd`.

### Step 2–4: Team Execution
Spawns specialist agents (matched from `.claude/agents/`) and QA. Builders follow the TDD Ralph Loop. QA performs two-stage review.

**TDD Ralph Loop:**
1. Write failing tests first
2. Implement minimal code to pass
3. Refactor while keeping green
4. Lint → typecheck → self-review
5. Commit only when all checks pass

**QA Two-Stage Review:**
- Stage 1: Spec compliance (every acceptance criterion verified independently)
- Stage 2: Code quality (test quality, edge cases, architecture, security, DRY)

### Wrap Up
Shuts down agents. Reports worktree location. Suggests `/set-review`.

**Note:** Worktree is preserved for `/set-review` to examine. In no-worktree mode, `/set-review` operates against the current branch instead.

**Next step:** `/set-review`

---

## `/set-review`

**Phase 4 — Review**

Four parallel reviewers examine all changes:

1. **Spec Compliance** — reads design spec + plan, verifies everything was built as designed
2. **Security** — injection, XSS, hardcoded secrets, auth gaps, missing validation
3. **Architecture** — patterns, conventions, abstractions, dependencies
4. **Correctness** — logic errors, edge cases, test coverage

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

Updates all three components to latest versions. SET is not in an official Claude marketplace — update by re-running the installer.

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

```
/plugin update superpowers@claude-plugins-official
/plugin update compound-teams@compound-teams-marketplace
```

Run periodically to get improvements and bug fixes.
