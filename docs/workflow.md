# SET Workflow — End-to-End Walkthrough

This walkthrough shows what a complete SET cycle looks like for a real feature request.

## Scenario: Add a CSV export feature

### Phase 0: Initialize (first time only)

```
/set-init
```

```
Checking prerequisites...
✓ Superpowers: installed
✓ Compound Teams: installed
✓ Agent Teams: enabled

Detecting stack...
  TypeScript, React, Node.js, PostgreSQL, Drizzle ORM

Proposed changes:
  Create .claude/agents/db-drizzle.md
  Create .claude/agents/react-ui.md
  Create .claude/agents/api.md
  Create .claude/agents/qa.md
  Augment CLAUDE.md with Build Commands section

Proceed? (y/n)
```

After confirmation, specialist agents are scaffolded with domain knowledge specific to your stack.

---

### Phase 1: Design

```
/set-design Add CSV export for event results
```

Superpowers walks through the design section by section. You review and approve each part:

- **Problem** — What are we solving and why?
- **Users** — Who benefits and how do they use it?
- **Solution** — What exactly will we build?
- **Scope** — What's in and what's explicitly out?
- **Technical approach** — How will it be implemented?
- **Edge cases** — What can go wrong?

After approval, the spec is saved:
```
Spec saved: docs/superpowers/specs/csv-export-2025-06-15.md
Run /set-plan to create the task plan.
```

---

### Phase 2: Plan

```
/set-plan
```

The agent reads your spec and produces a plan like:

```
Plan: CSV Export for Event Results
Saved: .claude/plans/csv-export.md

Tasks (5):
  T1: Add export endpoint                    Specialist: api
  T2: Implement CSV formatter                Specialist: api
  T3: Add results query with filters         Specialist: db-drizzle
  T4: Add Export button to results page      Specialist: react-ui
  T5: Integration tests                      Specialist: qa

Dependencies:
  T4 blocked by T1
  T5 blocked by T1, T2, T3, T4

Run /set-build to execute.
```

Each task has detailed acceptance criteria, TDD steps, and a self-review checklist embedded in the plan.

---

### Phase 3: Build

```
/set-build
```

**Worktree setup:**
```
Creating worktree at .worktrees/csv-export
Branch: feat/csv-export
Running pnpm install... done
Running pnpm test... 47 tests passing
Baseline clean. Spawning team.
```

**Team spawns:**
- `api-builder` (reads `.claude/agents/api.md`)
- `db-builder` (reads `.claude/agents/db-drizzle.md`)
- `ui-builder` (reads `.claude/agents/react-ui.md`)
- `qa-agent` (reads `.claude/agents/qa.md`)

**Builders work in parallel.** Each builder:
1. Claims an unblocked task
2. Writes failing tests first
3. Implements minimal code to pass
4. Refactors
5. Runs lint, typecheck, self-review
6. Commits and marks complete

**QA reviews each completed task** — spec compliance first, then code quality. Creates fix tasks if anything is wrong.

**Wrap up:**
```
All tasks complete. QA: all passed both stages.
Final test run: 62 tests passing (15 new)

Worktree: .worktrees/csv-export
Branch: feat/csv-export

Run /set-review for final holistic review.
```

---

### Phase 4: Review

```
/set-review
```

Four reviewers run in parallel:

```
SPEC COMPLIANCE: ✓ All 8 acceptance criteria implemented
SECURITY: ⚠ Warning — export endpoint not rate-limited
ARCHITECTURE: ✓ Follows API patterns, DRY
CORRECTNESS: ⚠ Warning — large result sets not paginated

Fix tasks created for 2 warnings.
Builders addressing issues...
All issues resolved.

How would you like to finish?
  1. Merge to main
  2. Create pull request
  3. Keep branch (merge later)
  4. Discard changes
```

---

### Phase 5: Learn

```
/set-learn
```

```
Analyzing cycle: csv-export

CLAUDE.md updates:
  + Export endpoints must be rate-limited (from security review)
  + Large result queries need pagination (from correctness review)

Agent updates:
  api.md: + Always add rate limiting to export/download endpoints
  db-drizzle.md: + Add LIMIT/OFFSET when query could return >1000 rows

Plan archived: .claude/plans/archive/csv-export-2025-06-15.md

Next cycle will be smarter. ✓
```

---

## Key Principles

**Spec first, always.** Code is never written before a human has approved the design spec. This prevents building the wrong thing.

**Tests before code.** Every builder writes failing tests before implementation. If the tests pass before writing code, they aren't testing new behavior.

**QA is adversarial.** QA independently verifies every acceptance criterion. It does not trust the builder's self-review. If a builder pushes back on a finding, QA escalates to the team lead.

**Each cycle improves the next.** `/set-learn` doesn't just log what happened — it updates the actual instructions agents use. An agent that misses rate limiting once will have rate limiting in its domain knowledge for every future cycle.
