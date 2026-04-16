## Executive Summary

---

### What It Is

SET is a workflow system for Claude Code (Anthropic's AI coding CLI) that turns a single AI coding assistant into a coordinated engineering team. It orchestrates multiple AI agents working in parallel — each with specialized roles — to design, plan, build, and review software features with production-grade quality discipline.

SET combines two existing open-source Claude Code plugins into a unified pipeline:

**Superpowers** — a structured design and brainstorming framework

**Compound Teams** — a parallel agent execution engine with iterative quality loops

The innovation is in the integration layer: six custom commands (`/set-init`, `/set-design`, `/set-plan`, `/set-build`, `/set-review`, `/set-learn`) that bridge these systems into a single end-to-end workflow, adding project initialization with auto-scaffolded domain specialists, TDD enforcement, spec compliance verification, domain-specialist routing, and a persistent self-improving learning loop.

---

### How It Works

SET follows a six-phase pipeline. A human operator initiates each phase and approves transitions.

**Phase 0 — Init** (`/set-init`, run once per project)
The AI audits the project — detecting languages, frameworks, test runners, linters, database layers, and API patterns. It then scaffolds domain-specialist agent definitions (e.g., a database specialist, a UI specialist) tailored to the detected stack, augments the project's CLAUDE.md with SET-specific workflow sections and build commands, and creates the required directory structure. This one-time setup ensures the rest of the pipeline has the specialist agents, build commands, and learned-patterns sections it needs to function.

**Phase 1 — Design** (`/set-design`)
The AI explores the codebase, asks clarifying questions, proposes multiple approaches with trade-offs, and produces a written design specification. The human reviews and approves each section before the spec is finalized.

**Phase 2 — Plan** (`/set-plan`)
The AI reads the approved design spec, analyzes the codebase for existing patterns and utilities, and breaks the feature into discrete, parallelizable tasks. Each task includes specific files to modify, test-driven development steps, acceptance criteria, and a self-review checklist. Tasks are tagged with domain specialists (e.g., database, UI, API) if the project defines them.

**Phase 3 — Build** (`/set-build`)
A team lead agent spawns multiple builder agents and a QA agent. Each builder:

Claims an unblocked task

Writes failing tests first (TDD red phase)

Implements minimal code to pass (TDD green phase)

Refactors while keeping tests green

Runs lint, type checks, and a self-review checklist

Commits only after all checks pass

Loops back for the next task

The QA agent independently verifies each completed task in two stages: first against the spec (did the builder implement exactly what was required — nothing missing, nothing extra?), then for code quality (security, edge cases, DRY, architecture). The team lead coordinates, unblocks stuck agents, and manages cost controls.

**Phase 4 — Review** (`/set-review`)
Four specialized reviewer agents examine all changes simultaneously from different angles: spec compliance, security, architecture, and correctness. Findings are synthesized into a unified report with severity ratings.

**Phase 5 — Learn** (`/set-learn`)
After each cycle, the system analyzes the full arc — design through review — and extracts learnings at two levels. At the **project level**, it persists what worked, what failed, recurring bugs, and process insights to the project's configuration file as dated, actionable entries. At the **agent level**, it evaluates each specialist's performance — QA rejections, review findings, repeated errors, scope violations — and updates the agent's definition file with domain-specific lessons. Future sessions read both project learnings and evolved agent definitions at startup. This is SET's most important phase: both the project knowledge and the agents themselves improve with use.

---

### What Makes It Unique

| Capability        | Standard AI Coding              | SET                                                                      |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------ |
| Execution model   | Single agent, sequential        | Multiple specialist agents, parallel                                     |
| Quality assurance | Write code, hope it works       | TDD loops — iterate until ALL checks pass                                |
| Spec fidelity     | Informal — easy to drift        | Design spec → plan → build → spec compliance review                      |
| Review            | Optional, single perspective    | Mandatory, four perspectives (spec, security, architecture, correctness) |
| Learning          | Every session starts fresh      | Learnings persist — each cycle improves the next                         |
| Cost control      | Agent may loop indefinitely     | Max retries, escalation rules, team lead intervention                    |
| Human oversight   | Approve/deny individual actions | Approve design, approve plan, receive structured reports                 |

**Key differentiators:**

**Two-level self-improving learning loop.** The learn phase writes dated, actionable entries into the project at two levels: project-wide patterns in the configuration file, and agent-specific lessons in each specialist's definition file. Agents that repeatedly make the same mistake get that mistake added to their instructions. Agents that handle a pattern well get that pattern reinforced. The system avoids past mistakes and reinforces proven patterns automatically — at both the team and individual level.

**Spec-first discipline.** Unlike ad hoc AI coding, every feature goes through a design spec that is reviewed and approved by a human before a single line of code is written. The spec is then verified at three points: builder self-review, QA spec compliance check, and final spec compliance review.

**Domain specialist routing.** Projects can define specialist agent profiles (e.g., a database expert that knows Drizzle ORM patterns, a UI expert that knows React conventions). The plan phase tags each task with the best-fit specialist, and the build phase routes tasks accordingly — the right AI "engineer" works on the right problem.

**Structured cost controls.** Every agent has a max retry count (5 per unique error), an escalation threshold (3 retries triggers team lead involvement), and a kill switch (team lead can shut down runaway agents). This prevents unbounded token consumption.

---

### Positioning: A Premium Engineering Workflow

SET is not a casual productivity shortcut. It is a structured engineering process designed for teams building production software where quality, consistency, and spec fidelity matter.

The target user is a professional developer or engineering team that needs to ship complex, multi-file features with confidence — and is willing to invest in a higher-cost workflow to get higher-quality output. SET trades token cost for engineering discipline: TDD, spec compliance gates, multi-perspective review, and persistent institutional knowledge.

This is a meaningful step beyond "AI writes code, human reviews." SET brings the rigor of a well-run engineering team — design review, code review, QA, and post-mortem learning — to AI-assisted development.

---

### Current Maturity and Roadmap

**SET is functional and has been used in production development, but it is early-stage.** Transparency about this is important:

**Tested on one production codebase** (a multi-event tournament management platform spanning TypeScript/React, Python, PostgreSQL, and AWS infrastructure). The patterns are sound, but the workflow has not yet been validated across diverse languages, frameworks, or team sizes.

**The workflow will evolve.** The self-improving learning loop applies to SET itself — as more teams use it, the process, prompts, and coordination patterns will be refined based on real-world feedback. Early adopters should expect the workflow to change as it matures.

**Dependent on Claude Code's Agent Teams infrastructure**, which may still be experimental. Updates to that underlying platform could require corresponding updates to SET.

**Cost profile is higher than single-agent work.** Multiple parallel agents, each running iterative TDD loops, consume more tokens. The system includes cost controls (max retries, escalation rules, team lead kill switches), but users should understand the cost-quality trade-off before adopting.

We view this maturity stage as a strength for marketplace distribution, not a weakness — early adopters get a genuinely novel workflow and direct influence on its evolution. The compound learning loop means that each project's use of SET feeds back into improving the process for that project's future sessions.

---

### Marketplace Viability

**Why this belongs on the Claude Marketplace:**

_Solves a real gap._ Most Claude Code users run a single agent and manage quality manually. SET provides a structured, repeatable workflow that produces consistently higher-quality output for complex features. Nothing comparable exists in the marketplace today.

_Plugin ecosystem fit._ Built entirely on Claude Code's existing plugin, command, skill, and agent infrastructure. Composes cleanly with other plugins and project configurations. No external infrastructure required.

_The learning loop is genuinely novel._ Most AI coding tools treat each session as independent. SET's compound learning system creates durable, project-specific knowledge that accumulates value over time. This is a meaningful and defensible differentiator.

_Low barrier to entry, high ceiling._ A user installs the plugin, runs `/set-init` to auto-detect their stack and scaffold domain specialists, then `/set-design` to start building. But the system scales up to parallel specialist teams with domain-specific agents, gate reviews, and multi-perspective QA.

---

### Summary

SET turns Claude Code from a single coding assistant into a self-improving engineering team with structured design, parallel execution, test-driven development, multi-perspective review, and persistent learning. It is a premium workflow for teams that prioritize quality and spec fidelity in production software.

The workflow is early-stage and will continue to evolve as it is used across more projects and teams. Its core innovation — the compound learning loop where agents review and update their own knowledge base after each cycle — means that SET improves itself with use, both within individual projects and as a product.
