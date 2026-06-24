# Changelog

## [1.0.0] — Workflow-native build & review (drop Compound Teams)

### Changed — orchestration
- **Dropped the Compound Teams dependency.** `/set-build` and `/set-review` now run on Claude Code's native **dynamic workflows** (the `Workflow` tool). No marketplace to register, no `compound-teams` plugin to install.
- **`/set-build` is now a brief compiler + gatekeeper.** It compiles the approved plan into one build brief (per-task context bundle: spec section, learning shards, specialist referenced by name, acceptance bar) + a global verification rubric + escalation policy, then hands execution to a dynamic workflow that fans out parallel builders (routed by each task's `Specialist` as the subagent `agentType`), runs the per-task TDD loop, and **schema-verifies each task with a fresh verifier** before folding it back.
- **SET no longer implements the Ralph Loop retry/escalation mechanics.** The workflow's native verify-and-revise loop owns that; SET specifies only the bar and the escalation policy.
- **`/set-review` defaults to a dynamic-workflow fan-out** across four independent lenses (spec compliance, security, architecture, correctness) × affected modules, then synthesizes a ship/iterate/block verdict. Each lens is a fresh-context agent that did not write the code and treats the build's verification report as claims to audit. `--light` runs four plain parallel subagents for small diffs.

### Added
- **`/set-build --use-agent-team`** — optional autonomous Agent Team build mode (native Agent Teams). First-class, not a fallback: when run with permissions skipped the team is autonomous, and its good/bad decisions feed `/set-learn`. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (written by the installer by default).
- Verification verdicts are returned as structured schema objects so SET can gate ship/iterate programmatically.

### Changed — install & docs
- **`install.sh` no longer embeds command bodies as heredocs.** It installs command files by copying from `plugins/set/commands/` when run from a checkout, or fetching them from GitHub raw under `curl | bash`. The plugin files are now the single source of truth (eliminates the prior plugin-vs-installer divergence).
- `/set-update` updates SET + Superpowers + Serena (Compound Teams removed).
- `/set-init` no longer checks for Compound Teams; it notes that dynamic workflows are built into Claude Code (Pro users enable via `/config`). It still writes the Agent Teams env flag by default for the optional `--use-agent-team` mode.
- Plugin/marketplace metadata bumped to **1.0.0**; docs reworded throughout.

### Migration Notes (for existing users)
- Run `/set-update` to pick up the new command files. You can uninstall the `compound-teams` plugin — SET no longer uses it.
- The default build/review path needs no setup beyond having dynamic workflows enabled (Pro users: `/config` → Dynamic workflows). The `--use-agent-team` mode needs the Agent Teams env flag, which the installer writes for you.
- Your plans, specs, shards, taxonomy, agents, and `/set-learn` data are unchanged and fully compatible.

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
