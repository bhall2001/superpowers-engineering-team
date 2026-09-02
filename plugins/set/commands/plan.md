---
description: "Converts an approved design spec into a parallel-execution implementation plan with TDD steps, specialist routing, and shard tagging for dynamic-workflow builders. Use after /set-design produces a spec, when a user says 'create a plan', 'plan this out', or 'ready to plan'. Do NOT use before a design spec exists or when the user wants to jump straight to building."
---

# SET Plan — Bridge Superpowers Design to a Workflow-Ready Plan

You are running the **planning** phase of the Superpowers Engineering Team (SET) workflow.

Take a Superpowers design spec and produce a plan optimized for parallel dynamic-workflow execution. The `Specialist`, `Shards`, `Blocked by`, TDD-steps, and self-review fields map directly to how `/set-build` compiles its brief: `Specialist` → the builder's `agentType`, `Shards` → injected learning context, `Blocked by` → the workflow's dependency graph, and the TDD + self-review content → the verification rubric.

## Input

User provides: `/set-plan $ARGUMENTS`

That argument string is either:
- A feature name matching an existing design spec in `docs/superpowers/specs/`
- A path to a design spec file
- Empty — search `docs/superpowers/specs/` for the most recent spec and confirm with user

Parse `--autonomous` and `--verbose` per
`~/.claude/commands/references/autonomous-mode.md` and strip them before
interpreting the remainder as the spec name or path.

**When `--autonomous` or `--verbose` appears, read
`~/.claude/commands/references/autonomous-mode.md` in full before emitting the opening
boundary line or doing any other work.** That file defines the line's exact format, the
gate suppression this phase applies, and the hop this phase must execute at the end.
Emitting the boundary line first and reading afterwards is how the format drifts and the
hop gets skipped.

**Emit phase-boundary lines on every run**, with or without `--autonomous`, in the
Verbosity Levels format from that reference: the `▶ SET plan — starting` line once flags
are parsed, and the `◀ SET plan — {task count}, {plan path}` line as the phase ends. Under
`--autonomous` the same lines carry the chain annotation and `[n/N]`; without it, omit
both. Emit each line once per run. This phase dispatches no agents, so `--verbose` adds
no per-agent lines here.

**The literal opening line, when `--autonomous` is set** (copy this shape exactly —
comma before `autonomous chain`, brackets last, nothing parenthesized):

```
▶ SET plan — starting, autonomous chain [n/N]
```

`[n/N]` depends only on where the run **entered**, which never changes mid-chain:

| Entered at | plan's line |
|---|---|
| `design` (chained in) | `[2/5]` |
| `plan` (you were typed directly) | `[1/4]` |

Without `--autonomous`, emit `▶ SET plan — starting` with no chain annotation.

Under `--autonomous` with an empty remainder, do not "confirm with user" — take
the most recent spec in `docs/superpowers/specs/` and report which one was chosen
on the phase-boundary line.

## Process

### 1. Load the Design Spec

Read the Superpowers design spec. If none exists, tell the user to run `/set-design` first.

### 2. Research the Codebase

- Read CLAUDE.md for conventions and build commands
- Read `.claude/set/taxonomy.md` (if it exists) — list of learning domains used by this project. You'll tag each task with the relevant shards.
- Scan `.claude/set/learnings/*.md` (if it exists) for accumulated "What Works", "What Failed", and "Recurring Bugs" across domains — factor these into task decomposition and approach choice. If only a legacy `.claude/set/learnings.md` exists, read it too (it will be auto-split on next `/set-learn`).
- Explore directory structure and find related code
- Identify utilities, patterns, and abstractions to reuse
- Check git log for recent changes in relevant areas
- **Scan `.claude/agents/`** for project-defined specialist agents. Read each to understand what domains are covered (e.g., DB, UI, API/sync, QA, architecture). You'll tag each task with the best-fit specialist.

### 3. Write the Plan

Save to `.claude/plans/{feature-name}.md`:

```markdown
# Plan: {Feature Name}

> **Execution:** Use `/set-build` to execute this plan as a native Agent Team by default (or `/set-build --use-workflow` for the dynamic-workflow path).
> **Design spec:** `docs/superpowers/specs/{spec-file}.md`

## Goal
One sentence describing success.

## Context
What exists today. Reference specific files and modules.

## Approach
High-level strategy. Why this over alternatives.

## Progress

<!-- Orchestrator-maintained. Builders never edit this section. -->

- [ ] T-{slug} — pending
- [ ] T-{slug} — pending

## Tasks

### T-{slug}: {name}
- **Specialist**: {agent name from `.claude/agents/` or "generic" if none fits}
- **Shards**: {comma-separated domain names from `.claude/set/taxonomy.md` — the learning shards relevant to this task. Empty list if none apply or taxonomy is empty.}
- **What**: Clear deliverable
- **Files**: Specific paths to create/modify
- **Tests**: Workflow-shaped test description(s) — one test per behavior end-to-end, not a case list — plus exact commands to run them (see `references/testing-principles.md`)
- **Blocked by**: Other task slugs (if any)
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
- [ ] Tests are workflow-shaped per `references/testing-principles.md` — no redundant or tautological cases, lightest flavor that falsifies the behavior
- [ ] Follows project conventions from CLAUDE.md and the learning shards injected for this task
- [ ] No hardcoded values, missing validation, or security issues

### T-{slug}: {name}
...
```

### Plan Design Principles

**Task IDs are stable slugs, not positions.** Compute `T-{slug}` from the task title with
this exact algorithm — a slug that differs between two runs silently re-dispatches
finished work, so follow it literally:

1. Lowercase the title.
2. Replace every run of `[^a-z0-9]+` with a single `-`.
3. Strip leading and trailing `-`.
4. Truncate to **36** characters.
5. Strip any trailing `-` again (truncation may have left one).
6. Prefix `T-`. The final ID is at most 38 characters, leaving room for a suffix.

**On collision with another task in the same plan**, append `-` plus the first 3 hex
characters of `sha256(exact original title, UTF-8, untrimmed)` to **both** colliding
slugs — never to just one, and **never** an ordinal like `-2`. An ordinal is assigned by
position, so re-planning in a different order swaps which task owns it and a checkpoint
trailer then resolves to the wrong work.

```bash
# the hash, exactly:
printf '%s' "$TITLE" | shasum -a 256 | cut -c1-3
```

Collision is judged **within the current plan only**. If a re-plan introduces a task that
collides with an existing one, both get suffixes — the pre-existing task's slug changes,
so its completed work re-dispatches once. Prefer distinct titles in the first 36 characters
to avoid this.

Slugs are what let a plan be re-planned without breaking a crashed run's resume: a task
whose title is unchanged keeps its slug. A **re-titled** task is a new task with a new slug
and will re-dispatch — correct, because its work changed. Full rules:
`references/run-store.md`.

**The Progress section belongs to the orchestrator.** Emit it with one unchecked line per
task. `/set-build` ticks it as verdicts return; builders never edit the plan file. It is
human-facing status only — nothing parses it to decide what to skip.

**Task granularity:** Each task = 10-30 minutes of work for one builder. Big enough to be a coherent unit. Small enough that a builder can hold it in context.

**Parallelism:** Tasks that touch different files and have no data dependencies should NOT have `Blocked by` entries. Maximize the number of tasks that can run in parallel.

**TDD steps in every task:** Each task includes a TDD cycle. The builder writes the failing test FIRST, then implements. This is enforced in the builder prompt during `/set-build`.

**Self-review checklist in every task:** Each task includes the checklist. Builders must check every box before marking complete. This catches spec drift before QA.

**Specialist assignment:** Every task gets a `Specialist` field. If `.claude/agents/` has a matching specialist (e.g., a DB agent for schema tasks, a UI agent for component tasks), use that agent's name. If no specialist fits, use "generic". During `/set-build`, this tag routes the work: it becomes the builder teammate's `subagent_type` on the default Agent Team path, or the builder agent's `agentType` in a `--use-workflow` run.

**Shard tagging:** Every task gets a `Shards` field listing the domain names from `.claude/set/taxonomy.md` whose learnings apply to this task. During `/set-build`, the brief compiler loads those shard files and injects them as per-task context. Be generous — it's better to include a borderline-relevant shard than omit a relevant one. Empty list is fine when no shards apply (e.g. first-ever task in a fresh project, or purely mechanical scaffolding). If the taxonomy is empty, use `[]` for all tasks.

**Exact commands:** Include exact test/lint/typecheck commands, expected outputs, and file paths. Builders should never have to guess.

### 4. Review the Plan

After writing, review critically:
- Can tasks actually run in parallel as marked?
- Are acceptance criteria specific enough to verify?
- Do TDD steps make sense for each task?
- Any missing tasks?

### 5. Present for Approval

**Without `--autonomous`:** Show the plan. Wait for user to approve, modify, or reject.

After approval:

> "Plan saved to `.claude/plans/{feature-name}.md`. Ready to build? Run `/set-build {feature-name}` to execute it as a native Agent Team by default (or `/set-build {feature-name} --use-workflow` for the dynamic-workflow path)."

**With `--autonomous`:** Do not wait, and do not ask the user to approve the plan. Re-read
the plan against the Step 4 review criteria (parallelism marks are real, acceptance
criteria are verifiable, TDD steps make sense, no missing tasks) and fix what fails. Then
chain to `/set-build {feature-name}` per the Chaining Contract, executing the hop in this
same turn: read `~/.claude/commands/set-build.md`, emit
`⇢ SET chain — plan → build [n/N]`, then execute that file's contents with the carried
flags and the feature name.

**Reservations about the plan do not stop the chain.** If the build looks inadvisable —
it modifies SET's own machinery, the project was never `/set-init`'d so every task routes
to `generic` with no shards, or most tasks have no executable test for the TDD loop to
grip — record each as a `concerns_raised` entry and chain anyway. Those are judgment calls
for the human reading the Final Report, not grounds for ending a run they asked to be
autonomous.

Carry the plan's Unresolved Questions into the chain: they are reported in the
Autonomous Final Report rather than blocking, since there is no human to answer them.

## Unresolved Questions

At the end of the plan, list any unresolved questions — things the design spec left ambiguous that builders will need answers to. Keep concise.
