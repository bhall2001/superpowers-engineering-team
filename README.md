# Superpowers Engineering Team (SET)

A premium AI engineering workflow for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that turns a single coding assistant into a coordinated, self-improving engineering team.

SET combines [Superpowers](https://github.com/obra/superpowers) (structured design) with Claude Code's native dynamic workflows (parallel subagent execution) into a unified pipeline with TDD enforcement, spec compliance verification, domain-specialist routing, and a two-level self-improving learning loop.

## Pipeline

```
/set-init  (once per project — detects stack, scaffolds agents, configures CLAUDE.md)
    |
/set-design  →  /set-plan  →  /set-build  →  /set-review  →  /set-learn
    |               |              |               |               |
  Design spec   Task plan     Dynamic         4-perspective    Two-level
  with human    optimized     workflow        review           learning:
  approval      for parallel  with TDD        (spec, security, project +
  at each       execution     loop + verify   architecture,    agent
  section                                     correctness)     evolution
```

## What Makes SET Different

**Two-level self-improving learning loop.** After each cycle, `/set-learn` extracts learnings at two levels:
- **Project level** (sharded by free-form domain in `.claude/set/learnings/`) — patterns, failures, and recurring bugs. `/set-build` injects only the shards relevant to each task, keeping per-task context small while total learnings grow without bound.
- **Agent level** (.claude/agents/*.md) — domain-specific lessons that make each specialist smarter at its job

Agents that repeatedly make the same mistake get that mistake added to their instructions. The system improves itself with use.

**Spec-first discipline.** Every feature goes through a design spec reviewed and approved by a human before code is written. The spec is verified at three points: builder self-review, QA spec compliance check, and final spec compliance review.

**Domain specialist routing.** `/set-init` scaffolds specialist agents (DB, UI, API, QA, architect) based on your detected stack. `/set-plan` tags each task with the best-fit specialist. `/set-build` routes tasks to the right agent.

**Per-task TDD loop.** Every builder writes failing tests first, implements minimal code to pass, then refactors — looping until all checks (tests, lint, typecheck, self-review) pass. A fresh verifier then audits each task against a rubric (spec compliance, TDD, lint/typecheck), and the workflow runs a verify-and-revise loop until each task meets the bar.

## Install

SET is not in an official Claude plugin marketplace. Install via the script:

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

Registers the Superpowers marketplace and installs SET commands directly into `~/.claude/commands/`. It also writes the Agent Teams environment flag, which is only needed for the optional `/set-build --use-agent-team` mode — the default build path uses dynamic workflows and needs no flag.

Then open Claude Code and install the prerequisite plugin:

```
/plugin install superpowers@claude-plugins-official
```

Dynamic workflows are built into Claude Code (Pro/Max/Team/Enterprise). Pro users enable them once via `/config`; Max/Team/Enterprise have them on by default.

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
| `/set-build` | Build | Dynamic workflow — fans out parallel builder subagents (one per task, routed by specialist), each runs the per-task TDD loop, a fresh verifier checks each task against a rubric. Optional `--use-agent-team` runs an autonomous Agent Team instead |
| `/set-review` | Review | Dynamic-workflow fan-out across 4 lenses (spec compliance, security, architecture, correctness) × affected modules; `--light` runs 4 plain parallel subagents for small diffs |
| `/set-learn` | Learn | Extracts learnings to CLAUDE.md + evolves agent definitions based on cycle performance |
| `/set-update` | Maintenance | Updates SET, Superpowers, and Serena to latest versions |

## How the Learning Loop Works

After each build/review cycle, run `/set-learn`. It:

1. Analyzes the full arc — design through review
2. Extracts project-level learnings (what worked, what failed, recurring bugs) and classifies each against the project's free-form domain taxonomy (`.claude/set/taxonomy.md`) → writes to the appropriate shard(s) in `.claude/set/learnings/`
3. Routes the rare cross-cutting, universally-applicable learning to CLAUDE.md
4. Evaluates each agent's performance (QA rejections, review findings, TDD-loop struggles) → proposes updates to agent .md files
5. Archives the completed plan

`/set-plan` tags each task with the shard domains it touches. `/set-build` loads only those shards into each task's context — a DB task doesn't see UI learnings, and vice versa. This keeps context lean as the learning base grows.

Next session, Claude reads CLAUDE.md, relevant shards per task, and evolved agent definitions. Each cycle makes the next one faster and more accurate.

## Optional: Serena MCP Integration

SET can optionally use [Serena MCP](https://github.com/oraios/serena) as a semantic index over your learning shards. Shards remain the source of truth; Serena adds recall.

**What it adds:**
- **Semantic retrieval per task.** `/set-build` queries Serena with each task's description and injects the top-5 most relevant memories alongside the statically-selected shards. Catches learnings the shard-tagging missed.
- **Cross-domain matching.** A learning filed under `db` may still surface for an `api` task if it's semantically relevant — without duplicating it across shards.
- **LSP-backed symbol tools** that Serena brings along are usable by builder/review agents.

**How it works:**
- Shards are authoritative. `/set-learn` mirrors each learning to `.serena/memories/` with domain tags in frontmatter.
- If Serena is uninstalled or the call fails, SET falls back to shards unchanged — nothing breaks.
- You can enable/disable at any time: `/set-init` prompts on fresh projects; `/set-learn` and `/set-build` detect Serena lazily for existing projects (prompted once, persisted); `/set-update` lets you re-toggle.

**When it's worth it:**
- Your learning base has grown past what static domain tagging catches cleanly
- You want cross-project memory (Serena's memories can be shared across projects)
- You already use Serena for its symbol tools and want the integration

Not needed for smaller projects — sharding alone handles most scale.

## Current Status

SET is functional and has been used in production development, but it is early-stage.

- Tested on one production codebase (TypeScript/React + Python + PostgreSQL + AWS)
- The workflow will evolve as more teams use it
- The default build and review paths run on Claude Code's dynamic workflows (Pro/Max/Team/Enterprise; Pro opt-in via `/config`). The optional `/set-build --use-agent-team` mode uses Claude Code's Agent Teams feature
- Token cost is higher than single-agent work — this is a premium workflow that trades cost for quality

## License

MIT
