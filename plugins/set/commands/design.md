---
description: "Brainstorms and produces a human-approved design spec for a new feature or change using the Superpowers collaborative design process. Use when a user says 'design a feature', 'let's brainstorm', 'I want to build X', or 'start a SET cycle'. Always the first step before /set-plan. Do NOT use when a design spec already exists and the user wants to move to planning or implementation."
---

# SET Design — Superpowers Brainstorming + Design

You are running the **design** phase of the Superpowers Engineering Team (SET) workflow.

This phase uses Superpowers' brainstorming skill to produce a validated design spec before any planning or coding begins.

## Process

1. **Invoke the Superpowers brainstorming skill directly via the `Skill` tool** (skill name: `superpowers:brainstorming`). Do NOT invoke it via the deprecated `/brainstorm` slash command. Follow the skill exactly:
   - Explore project context
   - Ask clarifying questions (one at a time)
   - Propose 2-3 approaches with trade-offs
   - Present design in sections, get approval after each
   - Write design doc to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
   - Run spec review loop (dispatch reviewer subagent, fix issues, repeat until approved)
     — under `--verbose`, emit `→ spawn` / `← ` lines for each reviewer dispatch and return
   - User reviews written spec

   **Under `--autonomous`, follow the Autonomous Mode section below instead of the
   interactive gates in this list.**

2. **IGNORE spurious deprecation warnings.** The Superpowers brainstorming skill may detect it was invoked from a slash command and emit a deprecation notice aimed at users of the old `/brainstorm` command. `/set-design` is NOT deprecated — SET intentionally wraps the brainstorming skill to enforce the SET-specific handoff to `/set-plan`. Do NOT pass that deprecation message along to the user. Do NOT suggest the user invoke brainstorming directly instead of `/set-design`.

3. **STOP before invoking writing-plans.** Unlike the standard Superpowers flow, do NOT automatically transition to writing-plans.

4. Then:

   - **Without `--autonomous`** — tell the user:

     > "Design complete and saved to `<path>`. Ready to plan the implementation? Run `/set-plan <feature-name>` to create a parallel-execution plan for the build workflow."

   - **With `--autonomous`** — do not print the prompt above. After the closing phase-boundary line, chain to `/set-plan` per the Chaining Contract.

## Key Difference from Standard Superpowers

Standard Superpowers transitions directly to `writing-plans` → `subagent-driven-development` (sequential execution). SET instead transitions to `/set-plan` which creates a plan optimized for parallel dynamic-workflow execution.

## Autonomous Mode

Under `--autonomous`, the brainstorming skill's interactive gates are suppressed.
Read `~/.claude/commands/references/autonomous-mode.md` first.

Run the design phase against yourself:

1. Explore project context as normal.
2. Answer your own clarifying questions from the codebase and the feature idea.
   Where a question is genuinely underdetermined, choose the option that keeps
   scope smallest and record the choice in the spec's Open Questions section.
3. Propose approaches to yourself, select one on its own merits, and record the
   rejected alternatives in the spec.
4. Write the spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` as normal
   — the artifact is unchanged, only the approval is.
5. Run the existing spec self-review loop. Fix what it finds.
6. Do NOT wait for human spec approval. Chain to `/set-plan` per the Chaining
   Contract, passing the spec path plus both flags.

**This is the least reliable phase to automate.** The agent authors its own
requirements, so a poor design costs tokens twice — building it, then fixing it.
Prefer starting autonomy at `/set-plan` from a human-approved spec.

## Input

User provides the feature idea via: `/set-design $ARGUMENTS`

Parse `--autonomous` and `--verbose` per
`~/.claude/commands/references/autonomous-mode.md` and strip them; the remainder
is the feature idea.

**Emit phase-boundary lines on every run**, with or without `--autonomous`, in the
Verbosity Levels format from that reference: the `▶ SET design — starting` line once
flags are parsed, and the `◀ SET design — {spec path}` line as the phase ends. Under
`--autonomous` the same lines carry the chain annotation and `[n/N]`; without it, omit
both. Emit each line once per run — the Autonomous Mode section below does not repeat it.

If the remainder is empty **and** `--autonomous` is not set, ask: "What would you
like to build?"

If the remainder is empty **and** `--autonomous` is set, halt: an autonomous run
has no one to ask. Print: "`/set-design --autonomous` needs a feature idea as an
argument — there is no interactive prompt in autonomous mode."
