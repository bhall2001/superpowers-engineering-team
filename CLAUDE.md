# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SET (Superpowers Engineering Team) is a Claude Code plugin that provides a 6-command workflow pipeline turning a single Claude Code instance into a coordinated, self-improving engineering team. It combines [Superpowers](https://github.com/obra/superpowers) (design framework) and [Compound Teams](https://github.com/tbdng/compound-teams-plugin) (parallel agent execution).

**Pipeline:** `/set-init` → `/set-design` → `/set-plan` → `/set-build` → `/set-review` → `/set-learn` (+ `/set-update` for maintenance)

## Repository Structure

- `plugins/set/commands/*.md` — Core implementation. Each file is a markdown command spec that Claude Code loads as a slash command. This is the main code to edit.
- `install.sh` — Installation orchestrator for SET + dependencies (Superpowers, Compound Teams). Modifies `~/.claude/settings.json` and copies commands to `~/.claude/commands/`.
- `docs/` — User-facing documentation (getting-started, workflow, agents, commands, learning-loop).
- `.claude-plugin/marketplace.json` — Plugin marketplace entry config.
- `plugins/set/.claude-plugin/plugin.json` — Plugin metadata (name, version, author).

## No Build System

This is a plugin distribution, not a compiled app. All "code" is markdown command specs and a bash installer. No build, test, or lint tooling exists.

## Installation

```bash
# Script install (installs SET + Superpowers + Compound Teams)
bash install.sh

# Or via plugin marketplace
/plugin install set
```

Requires env var `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` for Agent Teams support.

## Key Design Principles

- **Spec-first**: Human-approved design before any coding
- **TDD enforced**: Every builder writes failing tests first (Ralph Loops)
- **Self-improving**: `/set-learn` updates CLAUDE.md + agent definitions after each cycle
- **Domain specialist routing**: Tasks matched to agents with relevant domain knowledge
- **Parallel execution**: Plan phase decomposes tasks for maximum parallelism via Compound Teams
- **Four-perspective review**: Spec compliance, security, architecture, correctness

## When Editing Commands

Each command in `plugins/set/commands/` is a self-contained prompt spec. Changes to one command's output format may affect downstream commands in the pipeline (e.g., `/set-plan` output feeds `/set-build`). Verify pipeline compatibility when modifying inter-command contracts.
