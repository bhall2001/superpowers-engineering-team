# SET Token Optimization Design

**Date:** 2026-06-11
**Status:** Approved

## Context

SET burns through Claude API quota faster than expected. The root causes are: (1) large command files with repeated explanatory prose, (2) duplicated Serena detection/branching logic across build/review/learn, (3) agents loading broad file context instead of targeted symbolic context. This design addresses all three by making Serena a hard dependency and restructuring agents to use it as the primary context-loading mechanism.

## Goals

- Reduce per-invocation token cost by ~30–40% on the heaviest commands (build, review, learn)
- Remove all optional Serena branching — Serena is always present
- Agents load minimal, targeted context via Serena rather than reading whole files
- No regression in output quality

## Non-Goals

- Windows compatibility shims
- Changes to design/plan commands (already lean)
- Changes to the /set-update command

---

## 1. Serena as Hard Requirement

### install.sh changes

- Detect if `uv` is installed; if not, print a clear error and exit
- Run `uv tool install serena-agent` if `serena` binary not found in PATH
- Write the `mcpServers.serena` entry to `~/.claude/settings.json` if not already present
- Print a clear success/failure message for each step
- Fail fast with actionable errors — do not silently continue with a broken Serena state

### /set-init changes

- Remove the "Step 0: Resolve Serena State (Lazy Detection)" block entirely
- Add a hard check at the top: verify `mcp__serena__*` tools are available; if not, print an error pointing to `install.sh` and stop
- Initialize `.serena/project.yml` for the project as part of init (already partially done — make it unconditional)

### All other commands

- Remove every Serena detection block (the `ls .serena/`, `grep -l '"serena"'` conditional patterns)
- Remove all "if Serena is available, use it; otherwise fall back to file reads" branching
- Serena tools are called directly, unconditionally

**Estimated savings:** ~300 lines removed across build/review/learn

---

## 2. Serena-First Context Loading

### Principle

Agents must not read whole files to gather context. They use Serena's symbolic tools to fetch only what's relevant to the task at hand.

### Build agents

Current behavior: builder reads full plan file, full design spec, all agent files, full taxonomy.md, all shard files.

New behavior:
- Read plan task assignment only (the specific task, not the full plan)
- Use `mcp__serena__get_symbols_overview` on files relevant to the task
- Use `mcp__serena__find_symbol` with `include_body=true` only for symbols being changed
- Use `mcp__serena__list_memories` + `mcp__serena__read_memory` to fetch only the domain shard relevant to the task — not all shards
- Full file reads only as a last resort when symbolic tools return insufficient context

### Review agents

Current behavior: each reviewer reads design spec, plan, relevant shards, all agent files.

New behavior:
- Spec compliance reviewer: read spec file (unavoidable — spec is the source of truth)
- Security reviewer: use Serena to navigate to changed symbols only
- Architecture reviewer: use `get_symbols_overview` on changed files
- Correctness reviewer: use Serena to read test files and implementation symbols

### Learn agent

Current behavior: reads full commit history, full specs, full plans, full CLAUDE.md, all learnings, all agent files.

New behavior:
- Use `git diff` scoped to the current cycle's commits (not full history)
- Use `mcp__serena__list_memories` to identify which domain shards to update
- Use `mcp__serena__read_memory` / `mcp__serena__edit_memory` to update shards in place — no full-file reads

### Shard storage

Learnings shards move to Serena memories as the canonical store. The `.claude/set/learnings/{domain}.md` files become the export/backup format, written only during `/set-learn`. Agents read shards via Serena memory tools, not file reads.

---

## 3. Prose Reduction

### Approach

Every command file is rewritten with terse directives. Explanatory paragraphs become single imperative lines. Rationale is cut; the "why" lives in this spec and in CLAUDE.md, not in runtime prompts.

### Specific targets

| File | Current lines | Target lines | Method |
|------|--------------|--------------|--------|
| build.md | 351 | ~200 | Cut Serena blocks, tighten Ralph Loop spec, remove explanatory prose |
| learn.md | 290 | ~160 | Cut Serena blocks, tighten agent evolution instructions |
| review.md | 137 | ~90 | Tighten reviewer prompts, remove rationale prose |
| init.md | 319 | ~180 | Cut Serena detection, tighten step descriptions |

### Ralph Loop

Full Ralph Loop spec stays in build.md. References in plan.md and init.md become a single line: "Builders follow the Ralph Loop (defined in /set-build)."

### Shared definitions

Concepts defined once in CLAUDE.md (auto-loaded every session):
- Shard format and path convention
- Taxonomy structure
- Pipeline phase order

Removed from all command files. Commands reference the concept by name only.

---

## 4. install.sh Serena Setup Flow

```
install.sh
├── Check uv installed → error + exit if missing
├── Check serena binary → run `uv tool install serena-agent` if missing
├── Check ~/.claude/settings.json for mcpServers.serena entry
│   └── Write entry if missing (detect OS for correct binary path)
├── Install SET commands (existing behavior)
└── Print summary: Serena ✓, Commands ✓, Agent Teams env var reminder
```

Error messages must be actionable:
- Missing uv: "Install uv from https://docs.astral.sh/uv/ then re-run install.sh"
- Serena install fails: "uv tool install serena-agent failed — check Python 3.11+ is available"

---

## Verification

1. Run `install.sh` on a clean machine (no Serena) — confirm it installs Serena and writes settings.json
2. Run `/set-init` on a new project — confirm no Serena detection prompts, just works
3. Run `/set-build` on a mid-size project — compare token usage before/after via Claude Code session token counter
4. Run `/set-learn` — confirm shards are written to Serena memories and `.claude/set/learnings/` files
5. Run `/set-review` — confirm reviewers use symbolic navigation, not full file reads
6. Confirm that removing Serena from settings.json causes `/set-init` to print a clear error and stop

---

## Decisions

- **Shard migration:** `/set-learn` handles lazy migration from `.claude/set/learnings/*.md` → Serena memories on next run. Existing users are unlikely to re-run `/set-init`.
- **settings.json scope:** `install.sh` writes to `~/.claude/settings.json` (global) — same location as Superpowers and Compound Teams plugin registrations.
