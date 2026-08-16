# The Learning Loop

SET's self-improving learning loop is what separates it from a one-shot AI workflow. After each cycle, `/set-learn` analyzes what happened and updates the system so the next cycle is faster and more accurate.

## Two Levels of Learning

### Project Level → Sharded `.claude/set/learnings/{domain}.md`

Dated patterns, failures, and recurring bugs are sharded by domain into `.claude/set/learnings/{domain}.md` files. The domain taxonomy is free-form per project and lives in `.claude/set/taxonomy.md`.

`/set-plan` tags each task with the shards relevant to that task. `/set-build` loads ONLY those shards into the task context — a builder working on a DB task doesn't see UI learnings, and vice versa. This keeps per-task context small while letting total learnings grow without bound.

`/set-review` loads shards whose domains intersect the diff under review.

**What gets captured:**
- Patterns that worked well (repeat these)
- Approaches that failed (avoid these)
- Recurring bugs (watch for these)

Build commands and architecture changes go to `CLAUDE.md` — those are structural, not accumulating history. A small number of **cross-cutting, universally-applicable** learnings (e.g., "NEVER log user PII") also go in `CLAUDE.md` so every task sees them.

**Example shard content (`.claude/set/learnings/api.md`):**
```markdown
---
domain: api
description: Endpoint shape, validation, rate limiting, error responses
---

# api Learnings

## What Works
[2026-04-15] Rate limiting middleware: always wrap export/download endpoints

## What Failed

## Recurring Bugs
[2026-04-15] Large queries without LIMIT cause timeouts — always paginate
```

### Agent Level → `.claude/agents/*.md`

Domain-specific lessons are written directly into each specialist's definition file. The next time that agent is spawned, it already knows what the previous cycle taught it — the team lead passes the agent file as base context at spawn.

**What gets captured per agent:**
- Domain knowledge gaps revealed by the cycle
- Common mistakes this agent made
- Patterns this agent handled well
- New conventions relevant to this agent's domain

## Commit your shards — the loop depends on it

Shards are the durable artifact. They carry learnings between cycles only if they are
committed to the repository, so a future team — on a fresh clone, a new worktree, or a
rebuilt container — starts with everything prior cycles learned.

`/set-learn` **never commits.** It writes the shards and reports what changed; staging and
committing them is your call, like any other file it touches.

The one thing to check is that git can actually see them. Many repos ignore `.claude/`
wholesale, which silently discards every learning SET produces — no error, no warning, and
the pipeline still reports success:

```bash
git check-ignore -q .claude/set/ && echo "IGNORED — learnings will not persist" || echo "OK"
```

If it reports `IGNORED`, exclude `.claude/`'s *contents* rather than the directory itself:

```gitignore
.claude/*
!.claude/set/
```

The trailing `*` is required. Git will not re-include a path whose parent directory is
excluded, so a bare `.claude/` line makes `!.claude/set/` a silent no-op. `/set-init`
checks this on new projects and `/set-update` checks it on existing ones, both offering
the fix.

## Retrieval: keyword search over the shards

Retrieval is plain keyword search (`grep`) over the markdown shards, and nothing else.
`/set-build` Phase A loads the shards each task is tagged with, then keyword-scans the
untagged shards for a few more relevant entries (capped at five), and injects all of it
as text into each task bundle. There is no MCP server, no index to build, and nothing to
install.

**Autonomous teams:** this is deliberate. When the whole team runs walled inside a
devcontainer or isolated worktree, no agent can reach an MCP server — the lead included.
Plain files on disk are the only retrieval that works in that topology, so nothing in the
pipeline depends on anything else. Committing the shards is what carries learnings between
cycles.

## What `/set-learn` Analyzes

To generate learnings, `/set-learn` looks at:

1. **QA rejections** — tasks that failed spec compliance or code quality review, and why
2. **Review findings** — security, architecture, or correctness issues flagged by `/set-review`
3. **TDD-loop struggles** — builders who hit the same error repeatedly (signals a knowledge gap)
4. **Scope violations** — builders who added features not in acceptance criteria
5. **Patterns done well** — things that went smoothly and should be repeated
6. **Git history** — what was actually built vs. what was planned

## Classification and Duplication

Each new learning is classified against the taxonomy. Learnings that span multiple domains are **duplicated into each relevant shard** — a note about "validating API input before writing to the DB" goes into both `api.md` and `db.md`, since either specialist may need it.

If no existing domain fits, `/set-learn` proposes a new domain + description for user approval before adding it to `taxonomy.md`. There is no cap on domain count.

## Cross-Agent vs. Agent-Specific

If a learning applies to every agent universally (e.g., "never modify code outside task scope"), it belongs in `CLAUDE.md` or in a `conventions` shard if one exists.

If it's specific to a domain, it goes to that specialist's agent `.md` file.

## How Sub-Agents See Learnings

Teammates spawned by the Agent Team (or subagents spawned by the dynamic workflow under `--use-workflow`) — builders, verifiers, reviewers — don't auto-inherit the main session's loaded context. In SET's design:

- **Builders** receive shard content inline in their task brief — the brief compiler loads and injects the per-task shards into each builder's context. Builders do not fetch shards themselves.
- **Verifiers** read the shards referenced in each task's `Shards` field when checking the work.
- **Reviewers** (`/set-review`) load shards whose domain intersects the diff.

## First-Run Migration

If a legacy monolithic `.claude/set/learnings.md` is present when `/set-learn` runs, it is auto-split:

1. Claude proposes a taxonomy from existing entries
2. User approves or edits the taxonomy
3. Each entry is classified and written into the appropriate shard(s)
4. The legacy file is deleted

## Cumulative Improvement

The learning loop compounds over time. After 10 cycles:

- `.claude/set/learnings/` has rich, domain-scoped shards with dated, actionable entries
- Each specialist agent has accumulated `Common Mistakes to Avoid` sections
- New cycles start with exactly the right context for each task, not a giant blob

The team gets smarter without anyone having to manually write documentation — and without inflating every task's context window.

## Future: Compaction

As shards grow, a future `/set-compact-learnings` command will dedupe, merge, and archive stale entries into `.claude/set/learnings-archive/` — per-shard — without losing history.

## Plan Archiving

At the end of `/set-learn`, the completed plan is moved from `.claude/plans/` to `.claude/plans/archive/`. This keeps the active plans directory clean while preserving history for future reference.
