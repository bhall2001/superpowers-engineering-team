# The Learning Loop

SET's self-improving learning loop is what separates it from a one-shot AI workflow. After each cycle, `/set-learn` analyzes what happened and updates the system so the next cycle is faster and more accurate.

## Two Levels of Learning

### Project Level → `.claude/set/learnings.md`

Dated patterns, failures, and recurring bugs that benefit all agents are written to `.claude/set/learnings.md`. This file is read explicitly by `/set-plan`, `/set-build` (team lead, builders, QA), and `/set-review` (all four reviewer lenses) so every cycle benefits from accumulated learnings.

Learnings live in their own file — not `CLAUDE.md` — so `CLAUDE.md` stays small and fast to load while learnings can grow freely across cycles.

**What gets captured:**
- Patterns that worked well (repeat these)
- Approaches that failed (avoid these)
- Recurring bugs (watch for these)

Build commands and architecture changes go to `CLAUDE.md` — those are structural, not accumulating history.

**Example `.claude/set/learnings.md` additions after a cycle:**
```markdown
## What Works
[2025-06-15] Rate limiting middleware: always wrap export/download endpoints

## What Failed
[2025-06-15] Drizzle-kit requires interactive input — use custom migration scripts

## Recurring Bugs
[2025-06-15] Large queries without LIMIT cause timeouts — always paginate
```

### Agent Level → `.claude/agents/*.md`

Domain-specific lessons are written directly into each specialist's definition file. The next time that agent is spawned, it already knows what the previous cycle taught it — the team lead passes the agent file as base context at spawn.

**What gets captured per agent:**
- Domain knowledge gaps revealed by the cycle
- Common mistakes this agent made
- Patterns this agent handled well
- New conventions relevant to this agent's domain

**Example agent update:**
```markdown
## Common Mistakes to Avoid
[2025-06-15] Never skip rate limiting on endpoints that serve large data exports
[2025-06-22] Use `prepare: false` on all postgres() connections — breaks on serverless otherwise
```

## What `/set-learn` Analyzes

To generate learnings, `/set-learn` looks at:

1. **QA rejections** — tasks that failed spec compliance or code quality review, and why
2. **Review findings** — security, architecture, or correctness issues flagged by `/set-review`
3. **Ralph Loop struggles** — builders who hit the same error 3+ times (signals a knowledge gap)
4. **Scope violations** — builders who added features not in acceptance criteria
5. **Patterns done well** — things that went smoothly and should be repeated
6. **Git history** — what was actually built vs. what was planned

## Cross-Agent vs. Agent-Specific

If a learning applies to all agents, it goes to `.claude/set/learnings.md`.
If it's specific to a domain (e.g., database queries, React patterns), it goes to that specialist's `.md` file.

**Cross-agent → `.claude/set/learnings.md`:**
```
"Always add TODO comments with ticket numbers on workarounds"
```

**Agent-specific → `db-drizzle.md`:**
```
"Use .returning() on INSERT when you need the created record's ID"
```

## How Sub-Agents See Learnings

Sub-agents spawned by Compound Teams (builders, QA, reviewers) don't auto-inherit the main session's loaded context. Every SET command's prompt explicitly instructs the sub-agent to read `.claude/set/learnings.md` before working. This is the same explicit-read pattern that already makes `CLAUDE.md` conventions flow into sub-agents.

Moving learnings to `.claude/set/learnings.md` does **not** reduce what agents see — they still read it every cycle. It only shrinks what every `CLAUDE.md` auto-load has to carry.

## Cumulative Improvement

The learning loop compounds over time. After 10 cycles:

- `.claude/set/learnings.md` has a rich set of dated, actionable entries from real work
- Each specialist agent has a `Common Mistakes to Avoid` section that reflects actual failures
- New cycles start with all of this context explicitly loaded by the commands that need it

The team gets smarter without anyone having to manually write documentation.

## Future: Compaction

As `.claude/set/learnings.md` grows, a future `/set-compact-learnings` command will dedupe, merge, and archive stale entries into `.claude/set/learnings-archive/` — keeping the active file focused without losing history.

## Plan Archiving

At the end of `/set-learn`, the completed plan is moved from `.claude/plans/` to `.claude/plans/archive/`. This keeps the active plans directory clean while preserving history for future reference.
