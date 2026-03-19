---
description: "Brainstorm and design a feature using Superpowers' collaborative design process. First step of the SET workflow: /set-design → /set-plan → /set-build → /set-review → /set-learn"
---

# SET Design — Superpowers Brainstorming + Design

You are running the **design** phase of the Superpowers Engineering Team (SET) workflow.

This phase uses Superpowers' brainstorming skill to produce a validated design spec before any planning or coding begins.

## Process

1. **Invoke the Superpowers brainstorming skill** — follow it exactly:
   - Explore project context
   - Ask clarifying questions (one at a time)
   - Propose 2-3 approaches with trade-offs
   - Present design in sections, get approval after each
   - Write design doc to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
   - Run spec review loop (dispatch reviewer subagent, fix issues, repeat until approved)
   - User reviews written spec

2. **STOP before invoking writing-plans.** Unlike the standard Superpowers flow, do NOT automatically transition to writing-plans.

3. Instead, tell the user:

> "Design complete and saved to `<path>`. Ready to plan the implementation? Run `/set-plan <feature-name>` to create a parallel-execution plan for the Agent Team."

## Key Difference from Standard Superpowers

Standard Superpowers transitions directly to `writing-plans` → `subagent-driven-development` (sequential execution). SET instead transitions to `/set-plan` which creates a plan optimized for Compound Teams' parallel Agent Team execution.

## Input

User provides the feature idea via: `/set-design $ARGUMENTS`

If `$ARGUMENTS` is empty, ask: "What would you like to build?"
