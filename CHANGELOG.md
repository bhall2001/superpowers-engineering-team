# Changelog

## [Unreleased]

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
- Plugin name: `superpowers-engineering-team` (update command: `/plugin update superpowers-engineering-team`)

## [0.1.0] — Initial Release

### Added
- Core pipeline: `/set-design` → `/set-plan` → `/set-build` → `/set-review`
- TDD Ralph Loop for all builders
- Compound Teams integration for parallel agent execution
- Superpowers integration for spec-first design
