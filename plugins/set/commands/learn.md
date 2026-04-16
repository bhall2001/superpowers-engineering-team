---
description: "Extract learnings from the most recent SET cycle and update CLAUDE.md. The self-improving learning loop — each cycle makes the next one smarter. Final step: /set-design → /set-plan → /set-build → /set-review → /set-learn"
---

# SET Learn — Extract, Learn, Improve

You are running the **learn** phase of the Superpowers Engineering Team (SET) workflow.

This is the most important phase. Everything else in SET produces code — this phase produces knowledge. Without it, every session starts from zero. With it, SET compounds: each cycle makes the next one faster, more accurate, and better aligned with the project's conventions.

## Input

User provides: `/set-learn $ARGUMENTS`

`$ARGUMENTS` is optional — a feature name or context hint. If empty, analyze the most recent build/review cycle.

## Process

### 1. Gather Context

```bash
# Recent commits from this cycle
git log --oneline -20

# Design spec used
ls docs/superpowers/specs/*.md 2>/dev/null | tail -5

# Plan used
ls .claude/plans/*.md 2>/dev/null

# Current CLAUDE.md
cat CLAUDE.md
```

Also read:
- The design spec (if one exists for this cycle)
- The plan (if one exists)
- Any review findings from `/set-review`

### 2. Analyze the Cycle

Examine the full arc — design through review — not just the final code. Look for learnings in each category:

**What worked — patterns to reinforce:**
- Code patterns that solved problems cleanly
- Libraries or approaches that proved effective
- Task decomposition that enabled good parallelism
- Spec decisions that made implementation straightforward
- Agent coordination patterns that reduced conflicts

**What failed — patterns to avoid:**
- Approaches tried and abandoned (and WHY they failed)
- Libraries that didn't work as expected
- Wrong assumptions in the design or plan
- Task boundaries that caused coordination problems
- Spec ambiguities that led to rework

**Recurring bugs — patterns to prevent:**
- Errors that appeared repeatedly during Ralph loops
- Common mistakes builders made
- Things the linter/type checker caught repeatedly
- QA findings that could have been caught earlier

**Process insights — improvements to SET itself:**
- Was the plan's task granularity right? Too big? Too small?
- Did specialist routing work? Were tasks assigned to the right agents?
- Did the TDD steps in the plan lead to good tests?
- Were the acceptance criteria specific enough for QA to verify?
- Did the review phase catch things that should have been caught earlier?

### 3. Update CLAUDE.md — Learned Patterns

Append entries to the "Learned Patterns" sections. Each entry MUST be:

- **Dated**: `[YYYY-MM-DD]`
- **Specific**: reference actual files, functions, or error messages
- **Actionable**: future Claude should know what to DO differently

**Good entry:**
```
[2026-03-17] Shared field high-run exclusion via `grouping.py`: Pass `shared_field_numbers`
to `assign_grouped_game_groups()` and union with `time_limited_fields`. Simpler than modifying
`get_field_capacities()` — directly uses already-computed shared schedule info.
```

**Bad entry:**
```
[2026-03-17] Be careful with shared fields.
```

Place entries in the correct subsection:
- `#### What Works` — reinforced patterns
- `#### What Failed` — abandoned approaches with reasons
- `#### Recurring Bugs` — errors to prevent proactively

### 4. Update Build Commands (if needed)

If the test/lint/typecheck commands changed or new ones were discovered, update the "Build Commands" section.

### 5. Update Architecture (if needed)

If the project structure changed (new directories, new major modules), update accordingly.

### 6. Evolve Agents

This step makes agents smarter after each cycle. Read every agent file in `.claude/agents/` and evaluate each agent's performance during this cycle.

#### 6a: Gather agent performance data

For each agent that participated in this cycle, look for:

- **QA rejections**: Tasks the agent completed that QA sent back — what was wrong?
- **Review findings**: Issues flagged during `/set-review` in code this agent wrote
- **Ralph Loop struggles**: Errors the agent hit repeatedly (3+ retries on the same error)
- **Scope violations**: Did the agent modify code outside its assigned task?
- **Patterns the agent handled well**: Clean implementations that passed QA on first attempt

If no agents participated (e.g., this was a manual build), skip to step 7.

#### 6b: Propose agent updates

For each agent with findings, propose specific additions to its `.md` file. Updates fall into these categories:

**Domain Knowledge** — add project-specific patterns the agent should know:
```
- Always use `prepare: false` when creating postgres connections for Supabase
- MUI imports must be individual (e.g., `import Box from '@mui/material/Box'`), never barrel imports
```

**Conventions** — add rules the agent violated or should follow:
```
- Never modify logic outside the files listed in your task. Message team lead if adjacent changes seem needed.
- Always check for existing utility functions in ~/utils/ before writing new helpers.
```

**Common Mistakes** — add a section if the agent made repeated errors:
```
## Common Mistakes (avoid these)
- [2026-03-18] Putting `from copy import copy` inside function bodies instead of at module top
- [2026-03-18] Using total run count instead of max-single-game count for HRH identification
```

**Key Files** — update if the agent should know about new files discovered during the cycle.

#### 6c: Apply updates

- **Show the user each proposed change before writing.** Get confirmation.
- **NEVER remove existing content** from agent files — only append or update.
- **Date new entries** with `[YYYY-MM-DD]` so stale learnings can be identified later.
- **Keep agent files focused.** If an agent's file exceeds ~100 lines, suggest splitting domain knowledge into a referenced file.

#### 6d: Cross-agent learnings

If a finding applies to ALL agents (e.g., "never modify code outside task scope"), add it to the Ralph Loop section in CLAUDE.md instead of duplicating it across every agent file. Agent-specific learnings go in the agent file; universal learnings go in CLAUDE.md.

### 7. Archive Plan

```bash
# Move completed plan to archive
mkdir -p .claude/plans/archive
mv .claude/plans/{feature}.md .claude/plans/archive/{feature}.md 2>/dev/null
```

### 8. Report to User

Tell the user:
- How many new learnings were added to CLAUDE.md (and which sections)
- Which agents were updated and what was added to each
- Any patterns that contradict previous ones (update, don't duplicate)
- Any process insights about SET itself (task sizing, specialist routing, etc.)
- Suggestions for what to build or fix next

## Maintenance Rules

- **Don't duplicate entries.** Search existing learnings first — update if the learning evolved.
- **Remove stale entries.** If tech was removed or a pattern was superseded, delete the old entry.
- **Keep entries concise.** CLAUDE.md is read every session — noise degrades signal.
- **If CLAUDE.md exceeds ~500 lines**, suggest splitting into topic files that CLAUDE.md references.
- **Contradictions**: If a new learning contradicts an old one, update the old entry with a dated note explaining the change.

## Why This Phase Matters

The learning loop is SET's core differentiator. Without it, AI coding tools treat every session as independent — repeating mistakes, missing conventions, rediscovering patterns. With it, SET accumulates institutional knowledge at two levels:

- **Project level** (CLAUDE.md) — patterns, failures, and recurring bugs that any agent benefits from
- **Agent level** (.claude/agents/*.md) — domain-specific lessons that make each specialist smarter at its job

This is what makes SET compound: **the system improves itself with use — both the project knowledge and the agents themselves.**
