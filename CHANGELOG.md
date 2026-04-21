# Changelog

## [Unreleased]

### Added — Sharded Learnings + Optional Serena MCP
- Learnings now sharded by free-form domain into `.claude/set/learnings/{domain}.md`. `/set-plan` tags each task with relevant shards; `/set-build` injects only those shards into each task's context. Keeps per-task context small while total learnings grow without bound.
- `.claude/set/taxonomy.md` — project-specific, free-form domain list maintained by `/set-learn`.
- Cross-domain learnings duplicate into each relevant shard (both agents need full context).
- Optional Serena MCP integration: when enabled, `/set-learn` mirrors learnings to `.serena/memories/` w/ domain frontmatter. `/set-build` queries Serena top-5 per task using raw task description; deduped against loaded shards. Shards stay source of truth — Serena is an index.
- Lazy Serena detection in `/set-learn` and `/set-build`: if `config.json` has no `serena_enabled` key, Serena is detected on first run; if found, user is prompted once and answer is persisted. Handles users who install Serena after `/set-init`.
- `/set-update` re-detects Serena and prompts to toggle.

### Changed
- Legacy monolithic `.claude/set/learnings.md` is auto-split on first `/set-learn` run after upgrade: `/set-learn` proposes a taxonomy, user approves, entries are classified into shards, legacy file is deleted.
- `/set-review` loads shards whose domains intersect the diff, not a single flat file.
- `CLAUDE.md` now holds only cross-cutting, universally-applicable learnings (rare) plus structural facts. The vast majority of learnings route to shards.

### Migration Notes (for existing users)
- Run `/set-update` to pick up the new command files.
- On your next `/set-learn`, you'll be prompted to approve a taxonomy and the legacy `learnings.md` will be split automatically.
- If you use Serena MCP, you'll be prompted to enable integration on next `/set-learn` or `/set-build`. You can change your mind later via `/set-update`.

### Added
- `/set-init` — one-time project initialization, stack detection, specialist agent scaffolding
- `/set-update` — update SET + Superpowers + Compound Teams to latest versions
- Git worktree support baked into `/set-build` Step 1 — isolated branch, setup, clean baseline verify
- Two-level learning loop in `/set-learn` — project-level (CLAUDE.md) + agent-level (`.claude/agents/*.md`)
- Domain specialist routing — tasks tagged in `/set-plan`, routed to matching agents in `/set-build`
- Enhanced QA with two-stage review (spec compliance, then code quality)
- Self-review checklist embedded in every task description
- `docs/` directory with user documentation

### Changed
- Final phase renamed from `/set-self-feedback` to `/set-learn`
- `/set-build` now creates isolated worktree before spawning agents (previously manual)
- Team size scaling based on task count (1+QA, 2+QA, 3+QA)
- SET is not in an official Claude marketplace — install and update both go through `install.sh` only
- `/set-update` now re-runs the installer to pull latest SET commands (was previously `/plugin update set`, which failed)
- Docs updated to remove the plugin-marketplace install path for now

## [0.1.0] — Initial Release

### Added
- Core pipeline: `/set-design` → `/set-plan` → `/set-build` → `/set-review`
- TDD Ralph Loop for all builders
- Compound Teams integration for parallel agent execution
- Superpowers integration for spec-first design
