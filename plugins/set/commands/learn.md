---
description: "Extracts patterns, failures, and insights from the most recent SET cycle and persists them as sharded domain learnings and Serena memories, then evolves agent definitions. Use after /set-review completes, when a user says 'capture learnings', 'run learn', 'update the agents', or 'finish the cycle'. Do NOT use mid-build or when no build/review cycle has completed."
---

# SET Learn — Extract, Learn, Improve

Extract and persist learnings from the most recent SET cycle.

## Input

`$ARGUMENTS` is optional — a feature name or context hint. If empty, analyze the most recent build/review cycle.

## Process

### 1. Gather Context

```bash
# Recent commits from this cycle
git diff HEAD~10..HEAD --stat
git log --oneline -10

# Design spec used
ls docs/superpowers/specs/*.md 2>/dev/null | tail -5

# Plan used
ls .claude/plans/*.md 2>/dev/null
```

Read the most recent spec from `docs/superpowers/specs/` and plan from `.claude/plans/` by name. Also read any review findings from `/set-review`.

### 2. Analyze the Cycle

Examine the full arc — design through review — not just the final code:

**What worked — patterns to reinforce:**
- Code patterns that solved problems cleanly
- Libraries or approaches that proved effective
- Task decomposition that enabled good parallelism
- Build orchestration that reduced conflicts (Agent Team coordination, or workflow fan-out in `--use-workflow` runs)

**What failed — patterns to avoid:**
- Approaches tried and abandoned (and WHY they failed)
- Libraries that didn't work as expected
- Wrong assumptions in the design or plan
- Spec ambiguities that led to rework

**Recurring bugs — patterns to prevent:**
- Errors that appeared repeatedly during the per-task TDD loop
- Common mistakes builder agents made
- Things linter/type checker caught repeatedly
- Review/QA findings that could have been caught earlier

**Process insights — improvements to SET itself:**
- Was task granularity right?
- Did specialist routing work?
- Were acceptance criteria specific enough for QA to verify?

### 3. Update Sharded Learnings in `.claude/set/learnings/`

Learnings are sharded by domain into `.claude/set/learnings/{domain}.md` files. The domain taxonomy lives in `.claude/set/taxonomy.md`.

#### 3a: Migrate existing shards to Serena memories (one-time)

**Gate on `serena_enabled` first.** Read `.claude/set/config.json`. If `serena_enabled`
is not `true` — including when the key or the file is **missing** — skip this step
entirely and do not call `mcp__serena__*`. Only `/set-build` writes that key, so a
project that has not built yet will legitimately have no value; absent means off. SET
runs Serena-less by design in walled environments (devcontainers, isolated worktrees)
where no MCP server is reachable; shards are the source of truth and lose nothing.

Then check for the sentinel:
```bash
ls .claude/set/.serena-migrated 2>/dev/null
```

If the sentinel exists: skip this step entirely — migration already completed.

If NOT present:
1. Run `mcp__serena__list_memories` — get existing memory slugs.
2. For each `.md` file in `.claude/set/learnings/`:
   - Derive expected slugs from entries (kebab-case key concept).
   - Write any un-mirrored entries using `mcp__serena__write_memory`.
3. Write the sentinel: `touch .claude/set/.serena-migrated`
4. Log: "Migrated N existing shard entries to Serena memories."

#### 3b: Migrate monolithic `learnings.md` if present (first-run only)

If `.claude/set/learnings.md` exists, auto-split it:

1. Read the full file
2. Propose a taxonomy (5-15 domains typical) by grouping entries by topic. Use project-specific names — `security`, `pg-drizzle`, `react-components`, etc.
3. Show the proposed taxonomy to the user:
   > "Proposed taxonomy from existing learnings:
   > - {domain1}: {short description}
   > ...
   > Approve, edit, or reject."
4. After approval, write `.claude/set/taxonomy.md`:
   ```markdown
   # Learning Taxonomy

   Free-form domains for sharded learnings in `.claude/set/learnings/`.

   - {domain1}: {short description}
   ```
5. Classify each entry into one or more domains. Duplicate cross-domain entries (see 3d).
6. Write each to `.claude/set/learnings/{domain}.md` with frontmatter:
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

#### 3c: Classify new learnings against the taxonomy

For each new learning from this cycle:

1. Read `.claude/set/taxonomy.md`. If empty, propose an initial taxonomy from this cycle's learnings (same approval flow as 3b step 3).
2. Match the learning against domain names + descriptions. Pick the best-fit domain(s).
3. If the learning spans multiple domains, assign to ALL relevant domains (duplication is expected — see 3d).
4. If NO existing domain fits, propose a new domain name + description. Ask user to approve before adding to `taxonomy.md`.

#### 3d: Duplicate cross-domain learnings

Learnings that apply to multiple domains are **copied into each relevant shard**. A learning about "validating user input on API routes that write to the DB" goes into BOTH `api.md` and `db.md`.

#### 3e: Write to shard files

Append each learning to `.claude/set/learnings/{domain}.md` under the correct section (`## What Works` / `## What Failed` / `## Recurring Bugs`). Create the file with frontmatter if it doesn't exist.

Read `references/learn-entry-format.md` for entry format rules and examples before writing any shard entries.

#### 3f: Global-importance learnings → CLAUDE.md

A learning that every agent must always apply goes into `CLAUDE.md` instead of (or in addition to) a shard. Bar is high — examples: project-wide security rules, absolute conventions that cause silent bugs if missed. Most learnings do NOT meet this bar. When in doubt, shard.

#### 3g: Mirror to Serena memories

**Skip this entire step unless `serena_enabled` is `true` in `.claude/set/config.json`.**
The shards written above are complete and authoritative on their own; the Serena mirror
is a runtime index over them, rebuildable at any time by a session that has Serena. Never
block or fail `/set-learn` on Serena being absent or erroring — log and continue.

For each new learning, write a Serena memory using `mcp__serena__write_memory`:
- Name/slug: short kebab-case from the learning's key concept (e.g. `shared-field-high-run-exclusion`)
- Frontmatter:
  ```
  domains: [{domain1}, {domain2}]
  date: {YYYY-MM-DD}
  source: .claude/set/learnings/{domain1}.md
  ```
- Body: the full learning text

Cross-domain learnings get ONE memory with multiple `domains:` tags. Shards are the source of truth; Serena is the runtime index.

### 4. Update Build Commands in CLAUDE.md (if needed)

If test/lint/typecheck commands changed or new ones were discovered, update the "Build Commands" section in `CLAUDE.md`.

### 5. Update Architecture in CLAUDE.md (if needed)

If the project structure changed (new directories, new major modules), update `CLAUDE.md`.

### 6. Evolve Agents

#### 6a: Identify participating agents

Derive which agents actually worked this cycle from git log — do NOT read all agent files:

```bash
git log --oneline -20 --format="%s %b"
```

Look for agent names in commit messages (builders sign commits with their agent name or task descriptions reference specialists). Task history may also help — from `TaskList()` on the default Agent Team path, or the workflow's per-task verdicts in a `--use-workflow` run — if available; `git log` is the primary signal.

Only read `.claude/agents/{name}.md` for agents confirmed to have participated. If no agents can be identified from git log, skip to step 7.

For each confirmed participant, look for:
- Verification/QA rejections — what was wrong?
- Review findings in code this agent wrote
- TDD-loop struggles — errors hit repeatedly (the verifier or test loop flagged the same issue)
- Scope violations — code modified outside assigned task
- Patterns handled well — clean implementations that passed verification on first attempt

#### 6b: Propose agent updates

For each agent with findings, propose additions to its `.md` file:

**Domain Knowledge** — project-specific patterns:
```
- Always use `prepare: false` when creating postgres connections for Supabase
```

**Conventions** — rules the agent violated:
```
- Never modify logic outside the files listed in your task.
```

**Common Mistakes** — repeated errors:
```
## Common Mistakes (avoid these)
- [2026-03-18] Putting `from copy import copy` inside function bodies instead of at module top
```

**Key Files** — new files relevant to this agent's domain.

#### 6c: Apply updates

- Show the user each proposed change before writing. Get confirmation.
- NEVER remove existing content — only append or update.
- Date new entries with `[YYYY-MM-DD]`.
- If an agent file exceeds ~100 lines, suggest splitting domain knowledge into a referenced file.

#### 6d: Cross-agent learnings

If a finding applies to ALL agents, put it in `CLAUDE.md` or a `conventions` shard. Do NOT duplicate across every agent file.

### 7. Archive Plan

```bash
mkdir -p .claude/plans/archive
mv .claude/plans/{feature}.md .claude/plans/archive/{feature}.md 2>/dev/null
```

### 7b: Verify shards are visible to git

`/set-learn` never commits — that call is the human's. But shards only carry forward to
future cycles if they are *committable*, so verify they are not silently ignored. Many
repos ignore `.claude/` wholesale, which would make every learning written above
invisible to `git status` and lost when a worktree or container is torn down.

```bash
git check-ignore -q .claude/set/learnings/ && echo IGNORED || echo TRACKABLE
```

If it prints `IGNORED`, warn prominently in the report:

> ⚠️  `.claude/set/learnings/` is gitignored — the {N} learnings written this cycle will
> NOT persist. Future agent teams will not see them.
>
> Fix `.gitignore` by excluding `.claude/`'s *contents* rather than the directory, then
> negating `.claude/set/`:
>
> ```
> .claude/*
> !.claude/set/
> ```
>
> The trailing `*` is required. Git will not re-include a path whose parent directory is
> itself excluded, so a bare `.claude/` line makes `!.claude/set/` a silent no-op.
>
> Keep `.serena/` ignored — it is a rebuildable index, not source of truth.

Then list the shard files changed this cycle so the human can review and commit them:

```bash
git status --short .claude/set/
```

### 8. Report to User

- How many new learnings added, broken down by shard (`{domain}: N entries`)
- Any new domains proposed and added to the taxonomy
- Whether a migration from monolithic `learnings.md` happened
- Any updates to `CLAUDE.md` — these should be rare
- Count of Serena memories written (new + migrated), or `skipped (serena_enabled: false)`
- **Shard files changed, and whether they are trackable by git** — plus the ignored-path
  warning from 7b if it fired. State plainly that committing them is the user's call.
- Which agents were updated and what was added
- Any patterns that contradict previous ones (update, don't duplicate)
- Process insights about SET itself (task sizing, specialist routing, etc.)
- Suggestions for what to build or fix next

## Maintenance Rules

- **Don't duplicate entries.** Search existing learnings first — update if the learning evolved.
- **Remove stale entries.** If tech was removed or pattern superseded, delete the old entry.
- **Keep entries concise.** Noise degrades signal for every agent that reads the file.
- **Contradictions**: If a new learning contradicts an old one, update the old entry with a dated note.
- **No automatic rotation.** Let shard files grow. A future `/set-compact-learnings` command will handle consolidation.
- **Taxonomy maintenance.** If a domain goes stale, the user can prune it manually from `taxonomy.md` and delete the shard. `/set-learn` does not auto-prune.
