# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SET (Superpowers Engineering Team) is a Claude Code plugin that provides a 6-command workflow pipeline turning a single Claude Code instance into a coordinated, self-improving engineering team. It combines [Superpowers](https://github.com/obra/superpowers) (design framework) with Claude Code's native Agent Teams and [dynamic workflows](https://code.claude.com/docs/en/workflows) (the `Workflow` tool — parallel subagent execution). The build phase (`/set-build`) runs as a native Agent Team by default; the review phase (`/set-review`) runs on dynamic workflows. A dynamic-workflow build mode is available via `/set-build --use-workflow`.

**Pipeline:** `/set-init` → `/set-design` → `/set-plan` → `/set-build` → `/set-review` → `/set-learn` (+ `/set-update` for maintenance)

## Repository Structure

- `plugins/set/commands/*.md` — Core implementation. Each file is a markdown command spec that Claude Code loads as a slash command. This is the main code to edit.
- `install.sh` — Installation orchestrator for SET + Superpowers. Modifies `~/.claude/settings.json` and installs command files to `~/.claude/commands/` by copying from `plugins/set/commands/` (or fetching them from GitHub raw when run via `curl | bash`). It no longer embeds command bodies — the plugin files are the single source of truth.
- `docs/` — User-facing documentation (getting-started, workflow, agents, commands, learning-loop).
- `.claude-plugin/marketplace.json` — Plugin marketplace entry config.
- `plugins/set/.claude-plugin/plugin.json` — Plugin metadata (name, version, author).

## Testing

This is a plugin distribution, not a compiled app: most "code" is markdown command specs and a bash installer, and there is no build or lint step. The JavaScript that does exist — the durable-run store and hook wiring under `plugins/set/bin/`, plus the hooks in `plugins/set/hooks/` — has tests:

```bash
node --test "plugins/set/tests/*.test.mjs"
```

Requires Node with `node:sqlite` (stable on Node 24; Node 22 needs `--experimental-sqlite`). The quotes matter — Node resolves a bare directory as a module, not a glob root.

**No CI runs this suite.** It is contributor-run only, so a green tree is evidence someone ran it, not that it is enforced.

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

**Retrieval is keyword search over plain markdown.** Shards under `.claude/set/learnings/` are the source of truth, and every command reads them with `grep`. Nothing in the pipeline depends on an MCP server, by design: when a team runs walled inside a devcontainer or isolated worktree, **no** agent can reach one — the lead included. Committing shards is what carries learnings between cycles, and that is the human's call at `/set-learn`.

## What install.sh touches in `~/.claude/`

`settings.json` — `env` vars and `extraKnownMarketplaces` only, always merged rather than
overwritten. It never edits `.mcpServers` in any of the four places Claude Code reads them
from; MCP configuration is the user's or their team's call. It also places the enforcement
hook scripts at `~/.claude/set/hooks/` but **never registers them there**: hooks are
appended to a project's `.claude/settings.json` (`hooks.PreToolUse`) by `/set-init` /
`/set-update` via `set-hooks.mjs`, so they bind only SET-managed repos. The registered
command is the **literal** `$HOME/.claude/set/hooks/<script>` (Claude Code runs hook
commands through a shell), never an expanded home path — the project file is committed and
must resolve on the host, in a devcontainer, and on a collaborator's machine.

## Enforcement hooks

`plugins/set/hooks/` — `set-deny-push.sh` (matcher `Bash`) and `set-guard-agent-name.sh`
(matcher `Agent`; a named spawn with a verifier-shaped prompt is denied). Both fail closed on
their own errors. Each script's header comments carry its parsing and timeout constraints —
read them before editing, since a hook that exceeds its timeout is treated as fail-open.

The push gate denies `git push` / `gh pr create|merge` only when **both** hold: the caller is
a spawned agent, **and** `<worktree>/.claude/set/RUN-IN-PROGRESS.md` exists and is live.
`/set-build` writes that marker before spawning anyone (`build.md` step 1g) and deletes it at
gate-back. Identity alone cannot separate a builder from the assistant helping a human — the
payloads are identical outside a run — so run state is the discriminator.

Liveness mirrors `probeDead`/`staleMinutes` in `bin/claim.mjs`: dead **only** on an explicit
"no such process". EPERM, an unknown pid, another host, or an unparseable marker all keep the
gate **on**. `kill -0` cannot distinguish ESRCH from EPERM by exit status and `ps -p` is
unreliable under the hook sandbox, so the check reads `kill`'s message — do not "simplify" it
back to an exit-status test. A stale marker denying is recoverable with `rm`; a gate dropping
mid-build is not.

Design: `docs/superpowers/specs/2026-08-16-run-scoped-push-gate-design.md`. The run store
(`~/.claude/set-runs/runs.db`) is **not** consulted by this gate.

Payload facts the identity logic depends on are recorded in
`docs/superpowers/specs/2026-08-16-hook-payload-probe-findings.md`; re-probe before
changing it. The main-session carve-out is verified for in-process `Agent` spawns only —
**not** workflow agents, **not** tmux teammates. Table-driven tests live in
`plugins/set/tests/`.
