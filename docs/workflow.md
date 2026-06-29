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
✓ Dynamic workflows: available
✓ Agent Teams: flag set (optional, for --use-agent-team)

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
Baseline clean. Compiling build brief and fanning out builders.
```

**Builder subagents fan out** — one per task, routed by the task's specialist:
- `api` task (reads `.claude/agents/api.md`)
- `db-drizzle` task (reads `.claude/agents/db-drizzle.md`)
- `react-ui` task (reads `.claude/agents/react-ui.md`)
- `qa` task (reads `.claude/agents/qa.md`)

**Builders work in parallel.** Each builder:
1. Claims an unblocked task
2. Writes failing tests first
3. Implements minimal code to pass
4. Refactors
5. Runs lint, typecheck, self-review
6. Commits and marks complete

**A fresh verifier audits each completed task** against a rubric — spec compliance, TDD discipline, lint/typecheck. The workflow runs a verify-and-revise loop until each task meets the bar before folding it back.

**Wrap up:**
```
All tasks complete. Verifier: all passed the rubric.
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

**Verification is adversarial.** A fresh verifier independently checks every acceptance criterion. It did not write the code and does not trust the builder's self-review. The workflow revises and re-verifies until each task meets the bar.

**Each cycle improves the next.** `/set-learn` doesn't just log what happened — it updates the actual instructions agents use. An agent that misses rate limiting once will have rate limiting in its domain knowledge for every future cycle.
