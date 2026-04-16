---
description: "Create a parallel-execution plan from a Superpowers design spec. Reformats for Agent Team builders with self-review loops. Second step: /set-design → /set-plan → /set-build → /set-review → /set-learn"
---

# SET Plan — Bridge Superpowers Design to Agent Team Plan

You are running the **planning** phase of the Superpowers Engineering Team (SET) workflow.

Take a Superpowers design spec and produce a plan optimized for Compound Teams' parallel Agent Team execution.

## Input

User provides: `/set-plan $ARGUMENTS`

`$ARGUMENTS` is either:
- A feature name matching an existing design spec in `docs/superpowers/specs/`
- A path to a design spec file
- Empty — search `docs/superpowers/specs/` for the most recent spec and confirm with user

## Process

### 1. Load the Design Spec

Read the Superpowers design spec. If none exists, tell the user to run `/set-design` first.

### 2. Research the Codebase

- Read CLAUDE.md for conventions, build commands, and learned patterns
- Explore directory structure and find related code
- Identify utilities, patterns, and abstractions to reuse
- Check git log for recent changes in relevant areas
- **Scan `.claude/agents/`** for project-defined specialist agents. Read each to understand what domains are covered (e.g., DB, UI, API/sync, QA, architecture). You'll tag each task with the best-fit specialist.

### 3. Write the Plan

Save to `.claude/plans/{feature-name}.md`:

```markdown
# Plan: {Feature Name}

> **Execution:** Use `/set-build` to execute this plan with an Agent Team.
> **Design spec:** `docs/superpowers/specs/{spec-file}.md`

## Goal
One sentence describing success.

## Context
What exists today. Reference specific files and modules.

## Approach
High-level strategy. Why this over alternatives.

## Tasks

### Task 1: {name}
- **Specialist**: {agent name from `.claude/agents/` or "generic" if none fits}
- **What**: Clear deliverable
- **Files**: Specific paths to create/modify
- **Tests**: What tests to write and exact commands to run them
- **Blocked by**: Other task numbers (if any)
- **Done when**: Acceptance criteria — specific, verifiable conditions

#### TDD Steps
1. Write failing test(s) for [specific behavior]
2. Run tests — verify they fail with expected error
3. Implement minimal code to pass
4. Run tests — verify green
5. Refactor if needed, verify still green

#### Self-Review Checklist
- [ ] All acceptance criteria met — nothing missing
- [ ] No extra features beyond what was specified
- [ ] Tests cover happy path AND edge cases
- [ ] Follows project conventions from CLAUDE.md
- [ ] No hardcoded values, missing validation, or security issues

### Task 2: {name}
...
```

### Plan Design Principles

**Task granularity:** Each task = 10-30 minutes of work for one builder. Big enough to be a coherent unit. Small enough that a builder can hold it in context.

**Parallelism:** Tasks that touch different files and have no data dependencies should NOT have `Blocked by` entries. Maximize the number of tasks that can run in parallel.

**TDD steps in every task:** Each task includes a TDD cycle. The builder writes the failing test FIRST, then implements. This is enforced in the builder prompt during `/set-build`.

**Self-review checklist in every task:** Each task includes the checklist. Builders must check every box before marking complete. This catches spec drift before QA.

**Specialist assignment:** Every task gets a `Specialist` field. If `.claude/agents/` has a matching specialist (e.g., a DB agent for schema tasks, a UI agent for component tasks), use that agent's name. If no specialist fits, use "generic". During `/set-build`, the team lead uses these tags to spawn the right specialist agents and route tasks to them.

**Exact commands:** Include exact test/lint/typecheck commands, expected outputs, and file paths. Builders should never have to guess.

### 4. Review the Plan

After writing, review critically:
- Can tasks actually run in parallel as marked?
- Are acceptance criteria specific enough to verify?
- Do TDD steps make sense for each task?
- Any missing tasks?

### 5. Present for Approval

Show the plan. Wait for user to approve, modify, or reject.

After approval:

> "Plan saved to `.claude/plans/{feature-name}.md`. Ready to build? Run `/set-build {feature-name}` to spawn the Agent Team."

## Unresolved Questions

At the end of the plan, list any unresolved questions — things the design spec left ambiguous that builders will need answers to. Keep concise.
