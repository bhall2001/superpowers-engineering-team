# The Learning Loop

SET's self-improving learning loop is what separates it from a one-shot AI workflow. After each cycle, `/set-learn` analyzes what happened and updates the system so the next cycle is faster and more accurate.

## Two Levels of Learning

### Project Level → CLAUDE.md

Patterns, conventions, and recurring bugs that benefit all agents are written to `CLAUDE.md`. This file is loaded into context at the start of every session, so all agents — current and future — benefit from project-level learnings.

**What gets captured:**
- Patterns that worked well (repeat these)
- Approaches that failed (avoid these)
- Recurring bugs (watch for these)
- Updated build commands or conventions
- Architecture decisions made during the cycle

**Example `CLAUDE.md` additions after a cycle:**
```markdown
### Learned Patterns
#### What Works
[2025-06-15] Rate limiting middleware: always wrap export/download endpoints

#### What Failed
[2025-06-15] Drizzle-kit requires interactive input — use custom migration scripts

#### Recurring Bugs
[2025-06-15] Large queries without LIMIT cause timeouts — always paginate
```

### Agent Level → `.claude/agents/*.md`

Domain-specific lessons are written directly into each specialist's definition file. The next time that agent is spawned, it already knows what the previous cycle taught it.

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

If a learning applies to all agents, it goes to `CLAUDE.md`.
If it's specific to a domain (e.g., database queries, React patterns), it goes to that specialist's `.md` file.

**Cross-agent → CLAUDE.md:**
```
"Always add TODO comments with ticket numbers on workarounds"
```

**Agent-specific → db-drizzle.md:**
```
"Use .returning() on INSERT when you need the created record's ID"
```

## Cumulative Improvement

The learning loop compounds over time. After 10 cycles:

- `CLAUDE.md` has a rich `Learned Patterns` section with real decisions from real work
- Each specialist agent has a `Common Mistakes to Avoid` section that reflects actual failures
- New cycles start with all of this context already loaded

The team gets smarter without anyone having to manually write documentation.

## Plan Archiving

At the end of `/set-learn`, the completed plan is moved from `.claude/plans/` to `.claude/plans/archive/`. This keeps the active plans directory clean while preserving history for future reference.
