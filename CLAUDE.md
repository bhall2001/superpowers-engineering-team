# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SET (Superpowers Engineering Team) is a Claude Code plugin that provides a 6-command workflow pipeline turning a single Claude Code instance into a coordinated, self-improving engineering team. It combines [Superpowers](https://github.com/obra/superpowers) (design framework) with Claude Code's native Agent Teams and [dynamic workflows](https://code.claude.com/docs/en/workflows) (the `Workflow` tool — parallel subagent execution). The build phase (`/set-build`) runs as a native Agent Team by default; the review phase (`/set-review`) runs on dynamic workflows. A dynamic-workflow build mode is available via `/set-build --use-workflow`.

**Pipeline:** `/set-init` → `/set-design` → `/set-plan` → `/set-build` → `/set-review` → `/set-learn` (+ `/set-update` for maintenance)

## Repository Structure

- `plugins/set/commands/*.md` — Core implementation. Each file is a markdown command spec that Claude Code loads as a slash command. This is the main code to edit.
- `install.sh` — Installation orchestrator for SET + Superpowers + Serena. Modifies `~/.claude/settings.json` and installs command files to `~/.claude/commands/` by copying from `plugins/set/commands/` (or fetching them from GitHub raw when run via `curl | bash`). It no longer embeds command bodies — the plugin files are the single source of truth.
- `docs/` — User-facing documentation (getting-started, workflow, agents, commands, learning-loop).
- `.claude-plugin/marketplace.json` — Plugin marketplace entry config.
- `plugins/set/.claude-plugin/plugin.json` — Plugin metadata (name, version, author).

## No Build System

This is a plugin distribution, not a compiled app. All "code" is markdown command specs and a bash installer. No build, test, or lint tooling exists.

## Installation

SET is NOT in an official Claude marketplace. Install via script only (the plugin-marketplace path is not supported for now):

```bash
bash install.sh
```

The default `/set-build` path runs as a native Agent Team and REQUIRES the env var `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (written by the installer; a session restart is needed after first write). `/set-review` and `/set-build --use-workflow` run on dynamic workflows and need no special env var (Pro users enable dynamic workflows once via `/config`).

## Key Design Principles

- **Spec-first**: Human-approved design before any coding
- **TDD enforced**: Every builder writes failing tests first, then a fresh verifier confirms the bar before the work is folded back
- **Self-improving**: `/set-learn` updates CLAUDE.md + agent definitions after each cycle
- **Domain specialist routing**: Tasks matched to agents with relevant domain knowledge
- **Parallel execution**: Plan phase decomposes tasks for maximum parallelism; `/set-build` fans them out as a native Agent Team by default (or a dynamic workflow under `--use-workflow`)
- **Four-perspective review**: Spec compliance, security, architecture, correctness

## When Editing Commands

Each command in `plugins/set/commands/` is a self-contained prompt spec. Changes to one command's output format may affect downstream commands in the pipeline (e.g., `/set-plan` output feeds `/set-build`). Verify pipeline compatibility when modifying inter-command contracts.

## SET Shared Definitions

**Shard format:** `.claude/set/learnings/{domain}.md` — frontmatter with `domain:` + `description:`, then `## What Works` / `## What Failed` / `## Recurring Bugs` sections. Each entry dated `[YYYY-MM-DD]`.

**Taxonomy:** `.claude/set/taxonomy.md` — one line per domain: `- name: short description`. Free-form, project-specific names.

**Serena memories:** Runtime index of shard entries. Slugs are kebab-case key concepts. Frontmatter includes `domains:`, `date:`, `source:` fields. Written/read via `mcp__serena__*` tools. Shards are the source of truth; Serena is the index.

**Serena is optional.** It is a semantic index over the learning shards, nothing more. Shards under `.claude/set/learnings/` are plain markdown and the source of truth; every command degrades to keyword retrieval over them when Serena is absent, gated on `serena_enabled` in `.claude/set/config.json`. `install.sh` installs it best-effort; `/set-init` detects and records it.

This matters for autonomous teams: when the whole team runs walled inside a devcontainer or isolated worktree, **no** agent can reach an MCP server — the lead included. Serena being lead-only does not rescue that topology, so nothing in the pipeline may depend on it. Committing shards is what carries learnings between cycles, and that is the human's call at `/set-learn`.

## Where MCP config lives

Claude Code reads MCP servers from four places. `install.sh`'s `scan_legacy_serena`
checks all four for a standalone `serena` key, because one running alongside the
plugin's means duplicate `uvx` processes and `/plugin` reporting `-32000` on the
conflicting keys:

1. `~/.claude/settings.json` → `.mcpServers` — universal servers belong here
2. `~/.claude.json` → `.projects["<abs path>"].mcpServers` — per-project, host-only
3. `<repo>/.mcp.json` → `.mcpServers` — checked in, project-specific servers belong here
4. `<repo>/.claude/settings.local.json` → `.mcpServers` — personal, not checked in

The scan is diagnostic only — it warns and lists the paths, never edits these files,
since per-project and repo-level config is the user's or their team's call.

Note `~/.claude.json` sits OUTSIDE `~/.claude/`, so it does not cross into
devcontainers that bind-mount `~/.claude` — anything stored there is host-only.
