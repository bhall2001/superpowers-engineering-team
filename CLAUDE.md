# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SET (Superpowers Engineering Team) is a Claude Code plugin that provides a 6-command workflow pipeline turning a single Claude Code instance into a coordinated, self-improving engineering team. It combines [Superpowers](https://github.com/obra/superpowers) (design framework) with Claude Code's native [dynamic workflows](https://code.claude.com/docs/en/workflows) (the `Workflow` tool — parallel subagent execution) for the build and review phases. An optional autonomous Agent Team mode (`/set-build --use-agent-team`) is also supported.

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

The default build/review path uses native dynamic workflows and needs no special env var (Pro users enable dynamic workflows once via `/config`). The env var `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is written by the installer and is only needed for the optional `/set-build --use-agent-team` mode.

## Key Design Principles

- **Spec-first**: Human-approved design before any coding
- **TDD enforced**: Every builder writes failing tests first, then a fresh verifier confirms the bar before the work is folded back
- **Self-improving**: `/set-learn` updates CLAUDE.md + agent definitions after each cycle
- **Domain specialist routing**: Tasks matched to agents with relevant domain knowledge
- **Parallel execution**: Plan phase decomposes tasks for maximum parallelism; `/set-build` fans them out via a dynamic workflow (or an autonomous Agent Team)
- **Four-perspective review**: Spec compliance, security, architecture, correctness

## When Editing Commands

Each command in `plugins/set/commands/` is a self-contained prompt spec. Changes to one command's output format may affect downstream commands in the pipeline (e.g., `/set-plan` output feeds `/set-build`). Verify pipeline compatibility when modifying inter-command contracts.

## SET Shared Definitions

**Shard format:** `.claude/set/learnings/{domain}.md` — frontmatter with `domain:` + `description:`, then `## What Works` / `## What Failed` / `## Recurring Bugs` sections. Each entry dated `[YYYY-MM-DD]`.

**Taxonomy:** `.claude/set/taxonomy.md` — one line per domain: `- name: short description`. Free-form, project-specific names.

**Serena memories:** Runtime index of shard entries. Slugs are kebab-case key concepts. Frontmatter includes `domains:`, `date:`, `source:` fields. Written/read via `mcp__serena__*` tools. Shards are the source of truth; Serena is the index.

**Serena requirement:** Serena MCP is a hard dependency. `install.sh` installs it. `/set-init` verifies it at project init time.
