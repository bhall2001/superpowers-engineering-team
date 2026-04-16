# Superpowers Engineering Team (SET)

A premium AI engineering workflow for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that turns a single coding assistant into a coordinated, self-improving engineering team.

SET combines [Superpowers](https://github.com/obra/superpowers) (structured design) + [Compound Teams](https://github.com/tbdng/compound-teams-plugin) (parallel agent execution) into a unified pipeline with TDD enforcement, spec compliance verification, domain-specialist routing, and a two-level self-improving learning loop.

## Pipeline

```
/set-init  (once per project — detects stack, scaffolds agents, configures CLAUDE.md)
    |
/set-design  →  /set-plan  →  /set-build  →  /set-review  →  /set-learn
    |               |              |               |               |
  Design spec   Task plan     Agent Team      4-perspective    Two-level
  with human    optimized     with TDD        review           learning:
  approval      for parallel  Ralph Loops     (spec, security, project +
  at each       execution     + QA            architecture,    agent
  section                                     correctness)     evolution
```

## What Makes SET Different

**Two-level self-improving learning loop.** After each cycle, `/set-learn` extracts learnings at two levels:
- **Project level** (CLAUDE.md) — patterns, failures, and recurring bugs that benefit all agents
- **Agent level** (.claude/agents/*.md) — domain-specific lessons that make each specialist smarter at its job

Agents that repeatedly make the same mistake get that mistake added to their instructions. The system improves itself with use.

**Spec-first discipline.** Every feature goes through a design spec reviewed and approved by a human before code is written. The spec is verified at three points: builder self-review, QA spec compliance check, and final spec compliance review.

**Domain specialist routing.** `/set-init` scaffolds specialist agents (DB, UI, API, QA, architect) based on your detected stack. `/set-plan` tags each task with the best-fit specialist. `/set-build` routes tasks to the right agent.

**TDD Ralph Loops.** Every builder writes failing tests first, implements minimal code to pass, then refactors — looping until all checks (tests, lint, typecheck, self-review) pass. Max 5 retries per unique error. Escalation after 3 attempts.

## Install

**Step 1** — Run the install script:

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

This registers the plugin marketplaces, enables Agent Teams, and installs the SET commands.

**Step 2** — Open Claude Code and install the two required plugins:

```
/plugin install superpowers@claude-plugins-official
/plugin install compound-teams@compound-teams-marketplace
```

Plugin installation requires Claude Code's interactive environment and cannot be done from the install script.

## Getting Started

1. Run the install script (see above)
2. Open Claude Code and install the two required plugins (see above)
3. Open your project in Claude Code
4. Run `/set-init` — detects your stack, scaffolds domain specialists, configures CLAUDE.md
5. Run `/set-design <feature idea>` — starts the pipeline

## Commands

| Command | Phase | What it does |
|---------|-------|-------------|
| `/set-init` | Setup (once) | Detects stack, scaffolds agents, augments CLAUDE.md, creates directories |
| `/set-design` | Design | Superpowers brainstorming → approved design spec |
| `/set-plan` | Plan | Transposes design spec into parallelizable task plan with TDD steps and specialist tags |
| `/set-build` | Build | Spawns Agent Team — specialists run TDD Ralph Loops, QA does two-stage review |
| `/set-review` | Review | 4 parallel reviewers: spec compliance, security, architecture, correctness |
| `/set-learn` | Learn | Extracts learnings to CLAUDE.md + evolves agent definitions based on cycle performance |
| `/set-update` | Maintenance | Updates SET, Superpowers, and Compound Teams to latest versions |

## How the Learning Loop Works

After each build/review cycle, run `/set-learn`. It:

1. Analyzes the full arc — design through review
2. Extracts project-level learnings (what worked, what failed, recurring bugs) → appends to CLAUDE.md
3. Evaluates each agent's performance (QA rejections, review findings, Ralph Loop struggles) → proposes updates to agent .md files
4. Archives the completed plan

Next session, Claude reads the updated CLAUDE.md and evolved agent definitions at startup. Each cycle makes the next one faster and more accurate.

## Current Status

SET is functional and has been used in production development, but it is early-stage.

- Tested on one production codebase (TypeScript/React + Python + PostgreSQL + AWS)
- The workflow will evolve as more teams use it
- Depends on Claude Code's Agent Teams (experimental feature)
- Token cost is higher than single-agent work — this is a premium workflow that trades cost for quality

## License

MIT
