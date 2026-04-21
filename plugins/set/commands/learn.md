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

### 0. Resolve Serena State (Lazy Detection)

Before anything else, reconcile Serena configuration. This handles users who installed Serena *after* running `/set-init`.

1. Read `.claude/set/config.json` (create it as `{}` if missing).
2. If the `serena_enabled` key is **present** (either `true` or `false`), skip the rest of this step. The user has already decided.
3. If the key is **missing**, detect Serena:
   ```bash
   ls .serena/ 2>/dev/null
   grep -l '"serena"' ~/.claude/*.json ~/.config/claude/*.json .claude/*.json 2>/dev/null | head -1
   ```
   - **Detected** → prompt the user ONCE: "Serena MCP detected. Enable semantic learning retrieval? Shards remain the source of truth; Serena provides additional recall during `/set-build`. [y/N]". Write the answer to `config.json` as `serena_enabled: true/false`. If yes, `mkdir -p .serena/memories`.
   - **Not detected** → write `serena_enabled: false` silently. No prompt.

Once set, the user can re-toggle later via `/set-update`.

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

### 3. Update Sharded Learnings in `.claude/set/learnings/`

Project-level dated learnings are sharded by domain into `.claude/set/learnings/{domain}.md` files, NOT stored in `CLAUDE.md` and NOT stored as a single monolithic `learnings.md`. Sharding keeps per-task context small — `/set-build` only loads the shards relevant to each task.

The domain taxonomy is **free-form** (project-specific) and lives in `.claude/set/taxonomy.md`.

#### 3a: Migrate monolithic `learnings.md` if present (first-run only)

If `.claude/set/learnings.md` exists, auto-split it:

1. Read the full file
2. Propose a taxonomy (5-15 domains is typical but no cap) by grouping entries by topic. Use project-specific names — `security`, `scheduling-algorithm`, `pg-drizzle`, `react-components`, etc. Not generic categories.
3. Show the proposed taxonomy to the user:
   > "Proposed taxonomy from existing learnings:
   > - {domain1}: {short description}
   > - {domain2}: {short description}
   > ...
   > Approve, edit, or reject."
4. After approval, write `.claude/set/taxonomy.md` with the approved list:
   ```markdown
   # Learning Taxonomy

   Free-form domains for sharded learnings in `.claude/set/learnings/`.

   - {domain1}: {short description}
   - {domain2}: {short description}
   ```
5. For each entry in the old `learnings.md`, classify it into one or more domains (duplicate if cross-domain — see 3c).
6. Write each classified entry to `.claude/set/learnings/{domain}.md`. Each shard file begins with frontmatter:
   ```markdown
   ---
   domain: {domain}
   description: {short description from taxonomy}
   ---

   # {Domain} Learnings

   ## What Works
   ## What Failed
   ## Recurring Bugs
   ```
7. Delete the old `.claude/set/learnings.md`. Tell the user it was split and deleted.

#### 3b: Classify new learnings against the taxonomy

For each new learning from this cycle:

1. Read `.claude/set/taxonomy.md`. If it's empty (no migration and no prior runs), propose an initial taxonomy from this cycle's learnings (same approval flow as 3a step 3).
2. Match the learning against domain names + descriptions. Pick the best-fit domain(s).
3. If the learning spans multiple domains clearly, assign it to ALL relevant domains (see 3c — duplication is expected).
4. If NO existing domain fits, propose a new domain name + description. Ask user to approve before adding to `taxonomy.md`. No cap on total domains.

#### 3c: Duplicate cross-domain learnings

Learnings that apply to multiple domains are **copied into each relevant shard**, not split. A learning about "validating user input on API routes that write to the DB" goes into BOTH `api.md` and `db.md` — each agent needs the full context.

#### 3d: Write to shard files

Append each learning to `.claude/set/learnings/{domain}.md` under the correct section (`## What Works` / `## What Failed` / `## Recurring Bugs`). Create the file with the frontmatter header if it doesn't exist.

Each entry MUST be:

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

#### 3e: Global-importance learnings → CLAUDE.md

A learning that is **cross-cutting and critical enough that every agent on every task must always apply it** goes directly into `CLAUDE.md` instead of (or in addition to) a shard. Use judgment — the bar is high. Examples that qualify:

- Project-wide security rules ("NEVER log user PII")
- Absolute conventions that would cause silent bugs if missed

The vast majority of learnings do NOT meet this bar and should live in shards only. When in doubt, shard.

#### 3f: Mirror to Serena (if enabled)

Read `.claude/set/config.json`. If `serena_enabled: true`:

For each new learning, write a Serena memory:
- Path: `.serena/memories/{slug}.md`
- Slug: short kebab-case derived from the learning's key concept (e.g. `shared-field-high-run-exclusion`)
- Frontmatter:
  ```markdown
  ---
  domains: [{domain1}, {domain2}]
  date: {YYYY-MM-DD}
  source: .claude/set/learnings/{domain1}.md
  ---
  ```
- Body: the full learning text

Cross-domain learnings get ONE Serena memory with multiple `domains:` tags (no duplication in Serena — Serena can match on any tag). Shards remain the source of truth; Serena is an index. If Serena write fails for any reason, log a warning and continue — do not block the run.

### 4. Update Build Commands in CLAUDE.md (if needed)

If the test/lint/typecheck commands changed or new ones were discovered, update the "Build Commands" section in `CLAUDE.md`. These are structural facts, not accumulating history, so they stay in `CLAUDE.md`.

### 5. Update Architecture in CLAUDE.md (if needed)

If the project structure changed (new directories, new major modules), update `CLAUDE.md` accordingly. Structural, not accumulating — stays in `CLAUDE.md`.

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

If a finding applies to ALL agents (e.g., "never modify code outside task scope"), it is universal — put it in `CLAUDE.md` (see 3e) or in a `conventions` shard if one exists in the taxonomy. Do NOT duplicate it across every agent file. Agent-specific learnings go in the agent file; universal learnings go in the appropriate shard or CLAUDE.md.

### 7. Archive Plan

```bash
# Move completed plan to archive
mkdir -p .claude/plans/archive
mv .claude/plans/{feature}.md .claude/plans/archive/{feature}.md 2>/dev/null
```

### 8. Report to User

Tell the user:
- How many new learnings were added, broken down by shard (`{domain}: N entries`)
- Any new domains proposed and added to the taxonomy
- Whether a migration from monolithic `learnings.md` happened this run
- Any updates to `CLAUDE.md` (Build Commands, Architecture, global-importance learnings) — these should be rare
- Whether Serena memories were mirrored (count)
- Which agents were updated and what was added to each
- Any patterns that contradict previous ones (update, don't duplicate)
- Any process insights about SET itself (task sizing, specialist routing, etc.)
- Suggestions for what to build or fix next

## Maintenance Rules

- **Don't duplicate entries.** Search existing learnings first — update if the learning evolved.
- **Remove stale entries.** If tech was removed or a pattern was superseded, delete the old entry.
- **Keep entries concise.** Noise degrades signal for every agent that reads the file.
- **Contradictions**: If a new learning contradicts an old one, update the old entry with a dated note explaining the change.
- **No automatic rotation.** Let shard files grow. A future `/set-compact-learnings` command will handle consolidation and archival into `.claude/set/learnings-archive/`.
- **Taxonomy maintenance.** If a domain goes stale (no entries for many cycles, superseded by a new domain), the user can prune it manually from `taxonomy.md` and delete the corresponding shard. `/set-learn` does not auto-prune.

## Why This Phase Matters

The learning loop is SET's core differentiator. Without it, AI coding tools treat every session as independent — repeating mistakes, missing conventions, rediscovering patterns. With it, SET accumulates institutional knowledge at two levels:

- **Project level** (`.claude/set/learnings/{domain}.md` shards, optionally indexed by Serena) — dated patterns, failures, and recurring bugs. `/set-build` loads only the shards relevant to each task; `/set-plan` and `/set-review` scan the taxonomy and pull shards as needed.
- **Agent level** (`.claude/agents/*.md`) — domain-specific lessons passed as base context when each specialist is spawned

This is what makes SET compound: **the system improves itself with use — both the project knowledge and the agents themselves.**
