# Agent Frontmatter Spawnability Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SET scaffold and migrate `.claude/agents/*.md` specialist files with correct YAML frontmatter so `/set-build`'s `agentType` routing actually resolves them.

**Architecture:** Two markdown command specs change. `init.md` Step 7c gets a new agent-file template (frontmatter-first). `update.md` Step 1b/1c gains a frontmatter-normalization migration for existing projects. No executable code — SET is markdown command specs interpreted by Claude Code at runtime.

**Tech Stack:** Markdown command specs (Claude Code slash commands). No build/test/lint tooling. "Testing" = inspecting the authored spec text against the routing contract and dry-running the described migration transform by hand on a sample file.

## Global Constraints

- Agent-file frontmatter `name:` **MUST equal the filename stem** (e.g. `db-specialist.md` → `name: db-specialist`). This is the value `/set-plan` tags as `Specialist` and `/set-build` passes as `agentType`. Verbatim contract; do not diverge.
- Default `tools:` list is exactly `[Read, Edit, Write, Bash, Grep, Glob]` for every scaffolded specialist (including `qa-specialist`).
- Default `model:` is `sonnet`.
- Do NOT emit `skills:` or `mcpServers:` frontmatter keys — Workflow does not apply them.
- Migration in `update.md` must be **idempotent** and **show-diff-then-confirm** — never silently overwrite (consistent with existing Step 1 behavior).
- Source of truth is `plugins/set/commands/*.md`; `install.sh` no longer embeds these bodies — do not edit it.

---

### Task 1: Fix `/set-init` agent template (init.md Step 7c)

**Files:**
- Modify: `plugins/set/commands/init.md:180-204` (Step 7c template + surrounding instructions)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the canonical scaffolded-agent format that Task 2's migration converges existing files *toward*. Task 2 must produce files structurally identical to this template's output (frontmatter keys: `name`, `description`, `model`, `tools`; body starts with the "You are a {domain} specialist…" line; no `## Model` body section).

- [ ] **Step 1: Read the current Step 7c template to anchor the edit**

Run: `Read plugins/set/commands/init.md offset 178 limit 30`
Expected: see the `### 7c: Write agent files` heading, the ```` ```markdown ```` fenced template beginning `# {Name} — {Domain} Specialist`, its `## Model` / `sonnet` section, and the trailing "Read CLAUDE.md and any existing shards…" instruction line.

- [ ] **Step 2: Replace the template block with the frontmatter-first version**

Replace the fenced template (currently lines ~182-202, from ```` ```markdown ```` through the closing ```` ``` ````) with:

````markdown
```markdown
---
name: {agent-slug}
description: {one line — when SET should route a task to this specialist}
model: sonnet
tools: [Read, Edit, Write, Bash, Grep, Glob]
---

You are a {domain} specialist agent in the SET workflow. You have deep expertise in {specific technologies detected}.

## Domain Knowledge

- {Project-specific patterns from CLAUDE.md}
- {Key files and directories for this domain}
- {Conventions to follow}

## Key Files
- {List specific files/directories this specialist should know about}

## Conventions
- {Domain-specific conventions from CLAUDE.md or detected patterns}
```
````

- [ ] **Step 3: Add the contract + key rules immediately after the template**

Insert this instruction block between the fenced template and the existing "Read CLAUDE.md and any existing shards…" line:

```markdown
**Frontmatter rules (these make the agent spawnable — do not skip):**
- `name:` **MUST equal the filename stem** — `db-specialist.md` → `name: db-specialist`, `architect.md` → `name: architect`. This is the `agentType` that `/set-plan` tags as a task's `Specialist` and `/set-build` spawns. If `name:` and the stem diverge, routing silently falls back to the generic agent.
- `description:` — one line stating when SET should route a task to this specialist.
- `model:` — replaces the old `## Model` section; keep it in frontmatter only (no `## Model` body heading).
- `tools:` — `[Read, Edit, Write, Bash, Grep, Glob]` for every specialist (builders write code, run tests, search). `qa-specialist` uses the same list; QA independence comes from `/set-build` using a fresh verifier agent, not from tool restriction.
- Do NOT add `skills:` or `mcpServers:` keys — the Workflow tool does not apply them. The body already directs builders to call `mcp__serena__*` directly at runtime.
```

- [ ] **Step 4: Verify the edited section reads correctly against the contract**

Run: `Read plugins/set/commands/init.md offset 178 limit 45`
Expected/verify:
- Template shows `---` frontmatter with `name`, `description`, `model`, `tools` keys, then the "You are a {domain} specialist…" body.
- No `## Model` heading remains inside the template.
- No `skills:`/`mcpServers:` keys present.
- The `name: {agent-slug}` MUST-equal-filename-stem rule is stated.
- The "Read CLAUDE.md and any existing shards…" instruction still follows the new block intact.

- [ ] **Step 5: Commit**

```bash
git add plugins/set/commands/init.md
git commit -m "fix: /set-init scaffolds agents with spawnable frontmatter

Agent files now emit YAML frontmatter (name=filename stem, description,
model, tools) so /set-build agentType routing resolves them. Replaces
the frontmatter-less heading template; drops the ## Model body section.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migrate existing agents in `/set-update` (update.md Step 1b + 1c)

**Files:**
- Modify: `plugins/set/commands/update.md:38-48` (Step 1b migration + Step 1c report)

**Interfaces:**
- Consumes: the target format defined by Task 1 (frontmatter keys `name`/`description`/`model`/`tools`; body opens with "You are a {domain} specialist…"; no `## Model` section). Migration converges existing files toward this.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Read the current Step 1b/1c to anchor the edit**

Run: `Read plugins/set/commands/update.md offset 38 limit 12`
Expected: see `#### 1b: Migrate agent scaffolds in .claude/agents/*.md`, the stale-phrase replacement (`specialist on a SET Agent Team` → `specialist agent in the SET workflow`), the `message team lead` note, and `#### 1c: Report migration result`.

- [ ] **Step 2: Append the frontmatter-normalization sub-step to 1b**

After the existing 1b paragraph (ending "…Show each proposed per-file change and apply on confirmation.") and before `#### 1c`, insert:

```markdown
**Then normalize frontmatter (makes the agent spawnable as an `agentType`).** For each `.claude/agents/*.md` file, apply the first matching case:

1. **No `---` frontmatter block** → synthesize one and prepend it:
   - `name:` = filename stem (always — this is the critical key; `db-specialist.md` → `name: db-specialist`).
   - `description:` = derived from the `# {Name} — {Domain} Specialist` heading if parseable; else `SET specialist (review & refine)`.
   - `model:` = the value under the old `## Model` section if present; else `sonnet`.
   - `tools:` = `[Read, Edit, Write, Bash, Grep, Glob]`.
   - Remove the now-redundant `## Model` section from the body (its value moved to frontmatter).
   - Leave the rest of the body untouched — do NOT rewrite user customizations.
2. **Has frontmatter but `name:` is missing or ≠ filename stem** → set/fix `name:` to the stem; leave other keys as-is.
3. **Already correct** (frontmatter present, `name:` matches stem) → no change.

**Undecipherable/heavily-customized file** (no derivable domain or model): still inject `name:` (stem), `description: SET specialist (review & refine)`, `model: sonnet`, `tools: [Read, Edit, Write, Bash, Grep, Glob]`; leave the body untouched; and **flag the file in the 1c report** for the user to review and refine.

This normalization is **idempotent** and follows the same rule as the rest of Step 1: show each proposed per-file diff and apply only on confirmation.
```

- [ ] **Step 3: Extend the 1c report to cover frontmatter changes**

In `#### 1c: Report migration result`, update the "List exactly what was migrated" sentence to also enumerate frontmatter outcomes. Replace:

```markdown
List exactly what was migrated (CLAUDE.md block: yes/no; which agent files changed) or confirm the project was already current.
```

with:

```markdown
List exactly what was migrated (CLAUDE.md block: yes/no; which agent files had stale-phrase edits; which agent files had frontmatter added, `name:` fixed, or were flagged for review) or confirm the project was already current.
```

- [ ] **Step 4: Dry-run the migration transform on a sample (the "test")**

Construct — mentally or in scratch — a pre-fix sample file `db-specialist.md`:

```markdown
# DB — Database Specialist

You are a db specialist on a SET Agent Team.

## Model

sonnet

## Domain Knowledge
- Drizzle migrations live in db/migrations
```

Walk the Step-2 rules over it and confirm the result is:

```markdown
---
name: db-specialist
description: Database Specialist
model: sonnet
tools: [Read, Edit, Write, Bash, Grep, Glob]
---

# DB — Database Specialist

You are a db specialist agent in the SET workflow.

## Domain Knowledge
- Drizzle migrations live in db/migrations
```

Verify: `name` = stem `db-specialist`; `model` pulled from old `## Model`; `## Model` section removed; stale phrase fixed by the pre-existing 1b rule; body otherwise intact. Run the rules a second time over the *output* and confirm it lands in case 3 (already correct) → no change = idempotent.

- [ ] **Step 5: Verify the edited command reads correctly**

Run: `Read plugins/set/commands/update.md offset 38 limit 40`
Expected/verify: the three-case normalization + undecipherable-file rule are present under 1b; idempotent + show-diff-then-confirm stated; 1c report sentence enumerates frontmatter outcomes.

- [ ] **Step 6: Commit**

```bash
git add plugins/set/commands/update.md
git commit -m "fix: /set-update migrates existing agents to spawnable frontmatter

Step 1b now normalizes .claude/agents/*.md frontmatter (name=stem,
description, model, tools), idempotent and show-diff-then-confirm.
Undecipherable files get safe defaults and are flagged. 1c report
enumerates frontmatter outcomes.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Init template fix → Task 1. ✓
- `name` = filename stem contract → Global Constraints + Task 1 Step 3 + Task 2 Step 2. ✓
- Omit `skills`/`mcpServers` → Global Constraints + Task 1 Step 3. ✓
- `tools` list + uniform QA → Task 1 Step 3. ✓
- `## Model` → `model:` frontmatter → Task 1 Steps 2-3, Task 2 Step 2. ✓
- Migration: no-frontmatter / name-mismatch / already-correct cases → Task 2 Step 2. ✓
- Undecipherable-file flagging → Task 2 Step 2. ✓
- Idempotent + show-diff-confirm → Global Constraints + Task 2 Steps 2,4. ✓
- 1c report update → Task 2 Step 3. ✓
- install.sh out of scope → Global Constraints (do not edit). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every edit shows exact replacement text. The `{…}` tokens inside the agent template are intentional scaffolding placeholders that SET fills at runtime, not plan gaps. ✓

**Type consistency:** Frontmatter key set (`name`, `description`, `model`, `tools`) and body shape are identical between Task 1's output and Task 2's convergence target. Filename-stem rule worded identically in both tasks. ✓
