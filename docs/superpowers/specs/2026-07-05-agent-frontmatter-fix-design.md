# Fix: Specialist agent frontmatter for `agentType` spawnability

**Date:** 2026-07-05
**Status:** Approved

## Problem

`/set-init` scaffolds domain specialist files into `.claude/agents/*.md` using a
Markdown-heading template with **no YAML frontmatter** (`init.md` Step 7c, template
at lines 182–202: `# {Name} — {Domain} Specialist` + a `## Model` body section).

Claude Code only registers a `.claude/agents/*.md` file as a **spawnable agent type**
when it carries YAML frontmatter (`name:`, `description:`). Because SET's scaffolded
files have none, they are never registered.

Downstream contract that this breaks:
- `plan.md:58,94` — every task gets a `Specialist` = an agent name from `.claude/agents/`.
- `build.md:135` — `/set-build` spawns each builder with `agentType = the task's Specialist`.
- `agentType` resolves only registered agent types → with no frontmatter it **silently
  falls back to the generic default workflow agent**.

Observed 2026-07-05 on a real `/set-build` run (log): *".claude/agents/*.md specialist
files aren't registered as spawnable agent types (missing registry frontmatter)."*

**Effect:** Native per-specialist routing (per-agent `tools`/`model` overrides) never fires.
Domain guidance is *not* lost — builders separately `Read .claude/agents/{Specialist}.md`
as base context (`build.md:107`) — but the intended agent-type routing is a no-op.

Two populations need fixing:
1. **New projects** — `/set-init` must emit correct frontmatter.
2. **Existing projects** — `/set-update` must migrate already-scaffolded files.

## The contract (linchpin)

For routing to work, an agent file's frontmatter `name:` **MUST equal its filename stem**
(e.g. `db-specialist.md` → `name: db-specialist`). That stem is the value `/set-plan`
tags as `Specialist` and `/set-build` passes as `agentType`. If `name:` and the stem
diverge, routing silently breaks again.

Per verified platform facts (project memory): Workflow's `agent({agentType})` applies only
`tools` / `model` / `disallowedTools` frontmatter. `skills` and `mcpServers` are **not**
applied, so we deliberately omit them; the agent body already instructs builders to call
`mcp__serena__*` directly at runtime.

## Fix — Part 1: `/set-init` (init.md Step 7c)

Replace the frontmatter-less template with:

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

Rules to state explicitly in the instructions around the template:
- `name:` **must equal the filename stem** (`db-specialist`, `ui-specialist`, `api-specialist`,
  `qa-specialist`, `architect`). This is the `agentType` SET routes on — call it out as the
  contract linchpin.
- `description:` is a single line describing when to route to this specialist (used by the
  agent registry and by planners scanning specialists).
- `model:` frontmatter key **replaces** the old `## Model` body section (which is removed).
- `tools:` = `[Read, Edit, Write, Bash, Grep, Glob]` — the builder toolset (write code, run
  tests, search) matching the TDD loop. Same list for all scaffolded specialists including
  `qa-specialist` (kept uniform; QA independence is enforced by the workflow using a *fresh*
  verifier agent, not by tool restriction).
- Do **not** add `skills:` or `mcpServers:` keys — Workflow ignores them.

Everything else in Step 7c is unchanged (populate from CLAUDE.md + shards, show each file,
confirm before writing).

## Fix — Part 2: `/set-update` (update.md Step 1b)

Step 1b already opens each `.claude/agents/*.md` for the stale-phrase migration. Extend it to
also normalize frontmatter. For each file:

1. **Has no `---` frontmatter block** → synthesize and prepend one:
   - `name:` = filename stem (always — this is the critical key for spawnability).
   - `description:` = derived from the `# {Name} — {Domain} Specialist` heading if parseable;
     else the safe default `SET specialist (review & refine)`.
   - `model:` = value from the old `## Model` section if present, else `sonnet`.
   - `tools:` = `[Read, Edit, Write, Bash, Grep, Glob]`.
   - Remove the now-redundant `## Model` body section (its value moved to frontmatter).
   - Leave the rest of the body untouched (do not rewrite user customizations).
2. **Has frontmatter but `name:` missing or ≠ filename stem** → set/fix `name:` to the stem.
   Leave other keys as-is.
3. **Already correct** (frontmatter present, `name:` matches stem) → no change.

Edge case — undecipherable/heavily customized file (no derivable domain or model):
still inject `name:` (stem), `description: SET specialist (review & refine)`, `model: sonnet`,
`tools: [Read, Edit, Write, Bash, Grep, Glob]`, leave body untouched, and **flag the file in
the migration report** for the user to review and refine.

Consistent with the rest of Step 1: **idempotent**, **show each proposed per-file diff, apply
only on confirmation**. Update Step 1c's report to list frontmatter changes (added / name-fixed
/ flagged-for-review) alongside the existing stale-phrase results.

## Scope

- **In:** `plugins/set/commands/init.md` (Step 7c), `plugins/set/commands/update.md` (Step 1b + 1c report).
- **Out:** `build.md` / `plan.md` — the `agentType` mechanism and Specialist tagging are correct;
  the files were the defect.
- **Out:** `install.sh` — verified it no longer embeds command bodies or the agent template
  (copies/fetches plugin files as the single source of truth), so nothing to change there.

## Testing

No test tooling exists (SET is markdown command specs + a bash installer). Verification is manual:
1. **Init template review:** the generated template has frontmatter whose `name:` matches the
   filename stem and includes `description`/`model`/`tools`; no `## Model` body section remains;
   no `skills`/`mcpServers` keys.
2. **Migration dry-run:** transform a representative pre-fix agent file (heading template, `## Model`
   section, no frontmatter) and confirm it gains correct frontmatter, keeps its body, and is
   idempotent on a second pass.
3. **Contract check:** confirm the resulting `name:` equals the value `/set-plan` would tag as
   `Specialist` and `/set-build` passes as `agentType`.

## Unresolved questions

None.
