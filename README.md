# Superpowers Engineering Team (SET)

A premium AI engineering workflow for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that turns a single coding assistant into a coordinated, self-improving engineering team.

SET combines [Superpowers](https://github.com/obra/superpowers) (structured design) with Claude Code's native Agent Teams and dynamic workflows (parallel multi-agent execution) into a unified pipeline with TDD enforcement, spec compliance verification, domain-specialist routing, and a two-level self-improving learning loop.

## Pipeline

```
/set-init  (once per project — detects stack, scaffolds agents, configures CLAUDE.md)
    |
/set-design  →  /set-plan  →  /set-build  →  /set-review  →  /set-learn
    |               |              |               |               |
  Design spec   Task plan     Agent Team      4-perspective    Two-level
  with human    optimized     with TDD        review           learning:
  approval      for parallel  loop + verify   (spec, security, project +
  at each       execution     (dynamic        architecture,    agent
  section                     workflow via    correctness)     evolution
                               --use-workflow)
```

## What Makes SET Different

**Two-level self-improving learning loop.** After each cycle, `/set-learn` extracts learnings at two levels:
- **Project level** (sharded by free-form domain in `.claude/set/learnings/`) — patterns, failures, and recurring bugs. `/set-build` injects only the shards relevant to each task, keeping per-task context small while total learnings grow without bound.
- **Agent level** (.claude/agents/*.md) — domain-specific lessons that make each specialist smarter at its job

Agents that repeatedly make the same mistake get that mistake added to their instructions. The system improves itself with use.

**Spec-first discipline.** Every feature goes through a design spec reviewed and approved by a human before code is written. The spec is verified at three points: builder self-review, QA spec compliance check, and final spec compliance review.

**Domain specialist routing.** `/set-init` scaffolds specialist agents (DB, UI, API, QA, architect) based on your detected stack. `/set-plan` tags each task with the best-fit specialist. `/set-build` routes tasks to the right agent.

**Per-task TDD loop.** Every builder writes failing tests first, implements minimal code to pass, then refactors — looping until all checks (tests, lint, typecheck, self-review) pass. A dedicated verifier teammate then audits each task against a rubric (spec compliance, TDD, lint/typecheck), and the team runs a verify-and-revise loop until each task meets the bar.

## Install

SET is not in an official Claude plugin marketplace. Install via the script:

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

Registers the Superpowers marketplace and installs SET commands directly into `~/.claude/commands/`. It also writes the Agent Teams environment flag, which the default `/set-build` path requires — restart Claude Code after the first install so the flag takes effect.

`jq` and the Claude Code CLI are the only hard prerequisites.

Then open Claude Code and install the prerequisite plugin:

```
/plugin install superpowers@claude-plugins-official
```

Dynamic workflows (used by `/set-review` and `/set-build --use-workflow`) are built into Claude Code (Pro/Max/Team/Enterprise). Pro users enable them once via `/config`; Max/Team/Enterprise have them on by default.

## Upgrading from a pre-1.0 install

**If you already use SET, do this one-time step to reach v1 — run it in your own terminal, NOT via `/set-update`:**

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

Why the terminal, and why just this once: your installed `/set-update` is the pre-1.0 version, and when Claude runs it the installer executes inside Claude Code's sandbox, which blocks the network and writes it needs — so it can't pull the new commands. Running the same one-liner directly in your terminal sidesteps the sandbox and installs v1 cleanly.

After this one-time upgrade you'll have the v1 `/set-update`, and from then on **`/set-update` works normally from inside Claude Code** — it will (a) migrate the current project's SET-generated files (the old `Ralph Loop` block in `CLAUDE.md`, `"SET Agent Team"` agent scaffolds) with a diff-and-confirm, and (b) re-run the installer for you. No more terminal step, no repo clone needed — ever.

> Nothing else changes: your plans, specs, learning shards, taxonomy, and `/set-learn` data are all format-compatible with v1. You can also uninstall the old `compound-teams` plugin — SET no longer uses it.

## Getting Started

1. Run the install script (see above)
2. Open Claude Code and install the Superpowers plugin (see above)
3. Open your project in Claude Code
4. Run `/set-init` — detects your stack, scaffolds domain specialists, configures CLAUDE.md
5. Run `/set-design <feature idea>` — starts the pipeline

## Commands

| Command | Phase | What it does |
|---------|-------|-------------|
| `/set-init` | Setup (once) | Detects stack, scaffolds agents, augments CLAUDE.md, creates directories |
| `/set-design` | Design | Superpowers brainstorming → approved design spec |
| `/set-plan` | Plan | Transposes design spec into parallelizable task plan with TDD steps and specialist tags |
| `/set-build` | Build | Native Agent Team — spawns builder teammates (one per task, routed by specialist) each running the per-task TDD loop, plus a dedicated verifier teammate per task that checks it against a rubric. `--use-workflow` runs the same brief as a dynamic workflow instead |
| `/set-review` | Review | Dynamic-workflow fan-out across 4 lenses (spec compliance, security, architecture, correctness) × affected modules; `--light` runs 4 plain parallel subagents for small diffs |
| `/set-learn` | Learn | Extracts learnings to CLAUDE.md + evolves agent definitions based on cycle performance |
| `/set-update` | Maintenance | Updates SET and Superpowers; migrates projects from earlier SET versions |

### Autonomous runs

Add `--autonomous` to any cycle phase to run that phase and everything after it through
`/set-learn` without stopping at gates. On `/set-learn` itself it suppresses that phase's
approval prompts (taxonomy, new domains, agent updates). Add `--verbose` (independently)
for per-agent progress output.

> **Caution: `--autonomous` on `/set-design` is not currently best practice.** The agent
> authors its own requirements, so a poor design costs tokens twice — once building it,
> and again fixing it. Prefer starting autonomy at `/set-plan`, from a human-approved
> spec.

Autonomous runs never push, open a PR, or merge. They end by handing you your project's
acceptance check and the push decision — whatever `CLAUDE.md` says decides a change
actually works, be that running the CLI, hitting the endpoint, exercising the page, or a
manual QA pass.

See [`docs/commands.md`](docs/commands.md#switches) for the full switch reference.

## How the Learning Loop Works

After each build/review cycle, run `/set-learn`. It:

1. Analyzes the full arc — design through review
2. Extracts project-level learnings (what worked, what failed, recurring bugs) and classifies each against the project's free-form domain taxonomy (`.claude/set/taxonomy.md`) → writes to the appropriate shard(s) in `.claude/set/learnings/`
3. Routes the rare cross-cutting, universally-applicable learning to CLAUDE.md
4. Evaluates each agent's performance (QA rejections, review findings, TDD-loop struggles) → proposes updates to agent .md files
5. Archives the completed plan

`/set-plan` tags each task with the shard domains it touches. `/set-build` loads only those shards into each task's context — a DB task doesn't see UI learnings, and vice versa. This keeps context lean as the learning base grows.

Next session, Claude reads CLAUDE.md, relevant shards per task, and evolved agent definitions. Each cycle makes the next one faster and more accurate.

## Code Intelligence for Agent Teams

SET fans work out to many agents at once — builder and verifier teammates in `/set-build`, four review lenses × affected modules in `/set-review` — all inside a git worktree. That parallelism changes which code-navigation tools are safe to use.

**Short version:** spawned agents use Claude Code's built-in LSP tool, never an MCP server.

### Why not an MCP server

An MCP server is a **single stdio subprocess** shared by the lead and every agent it spawns — not one instance each. Servers that hold mutable per-project state expose it to every caller at once, and stdio has no per-caller session to isolate them. Under fan-out inside a worktree, one agent reconfiguring the server silently changes what every other agent sees.

Calls are typically serialized, so nothing crashes. The failure is quieter: **wrong answers, silently**.

### What teammates use instead

Claude Code has a **built-in LSP tool** — this is a core feature, not an MCP server. Code-intelligence plugins simply declare which language-server binary to launch. Each Claude Code session runs its own language server scoped to its own working directory, so parallel teammates cannot interfere with one another. The shared-state problem cannot occur, because nothing is shared.

Install the plugin for your stack plus its language server:

```bash
# TypeScript / JavaScript
npm install -g typescript-language-server typescript
claude plugin install typescript-lsp@claude-plugins-official

# Python
npm install -g pyright
claude plugin install pyright-lsp@claude-plugins-official
```

Restart Claude Code afterward — plugins load at session start.

Also available from `claude-plugins-official`: `clangd-lsp`, `csharp-lsp`, `gopls-lsp`, `jdtls-lsp` (Java), `kotlin-lsp`, `liquid-lsp`, `lua-lsp`, `php-lsp`, `ruby-lsp`, `rust-analyzer-lsp`, `swift-lsp`. Each needs its own language-server binary installed separately.

### Summary

| Need | Use | Why |
|---|---|---|
| Learnings from past cycles | Injected as text by Phase A | Compiled once in the lead; zero contention |
| Symbol navigation, references, diagnostics | **Built-in LSP tool** + a code-intelligence plugin | Per-session language server; safe under parallel teammates |
| Spawned agents calling any MCP server | **Avoid** | One shared subprocess; mutable state with no per-caller isolation |

> **Caveat.** Anthropic does not explicitly document "one language server process per session." The per-session model is inferred from the plugin architecture and from docs noting memory pressure across concurrent sessions.

## Current Status

SET is functional and has been used in production development, but it is early-stage.

- Tested on one production codebase (TypeScript/React + Python + PostgreSQL + AWS)
- The workflow will evolve as more teams use it
- The default `/set-build` path runs on Claude Code's Agent Teams (experimental; the installer sets the required env flag). `/set-review` and `/set-build --use-workflow` run on dynamic workflows (Pro/Max/Team/Enterprise; Pro opt-in via `/config`)
- Token cost is higher than single-agent work — this is a premium workflow that trades cost for quality

## License

MIT
