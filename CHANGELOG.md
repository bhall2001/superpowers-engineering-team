# Changelog

## [1.4.0] — Agent Teams now start correctly

### Fixed
- **Configuration issue that kept Agent Teams from initializing.** `/set-build` silently ran on the dynamic-workflow path instead. `install.sh` and `/set-init` now write the right settings; `/set-update` adds them to existing projects.

### Changed
- **`/set-build` halts when Agent Teams are unavailable** instead of quietly switching to the workflow path — the two produce different results, and the substitution was invisible. Use `--use-workflow` to run that path deliberately.

### Notes
- **Restart Claude Code after updating.** These settings are read at session start.

## [1.3.3] — Clearer installer errors in containers

### Fixed
- **The installer failed with an unexplained permission error** when `~/.claude/commands` was read-only. It now explains that SET is installed on the host and inherited by containers, and reports the version currently mounted.

## [1.3.2] — More accurate Agent Team availability check

### Fixed
- **`/set-build` could report Agent Teams as unavailable when they were fine**, and switch to the workflow path. The check is now more reliable and names what actually failed.

## [1.3.1] — Update notes cover every release

### Fixed
- **`/set-update` showed only the newest release's notes**, skipping anything in between. Upgrades spanning several versions now list each one.

## [1.3.0] — Durable autonomous runs

### Added
- **Autonomous runs survive a crash.** `/set-build --resume` picks up where the run stopped, re-dispatching only work that wasn't committed and leaving the working tree intact. Checkpoints are taken at phase boundaries and at meaningful points within a phase. Requires Node 24; degrades gracefully without it.

### Fixed
- **Build verifiers and review lenses reported no results.** Their verdicts were being discarded, so tasks looked unverified even when the work was done.
- **Stalled-task detection** no longer burns polling rounds on a task that already finished.

## [1.2.1] — Acceptance check wording

### Fixed
- Autonomous runs now hand back **this project's** acceptance check rather than assuming a browser check.

## [1.2.0] — Autonomous mode + `--verbose`

### Added
- **`--autonomous` on all five cycle phases.** Runs the rest of the cycle through `/set-learn` without stopping at human gates. Applies to the current conversation only — it is never persisted, so a stale flag cannot leak into a later run.
- **Bounded iterate loop in `/set-review --autonomous`.** Findings are routed to the specialist that owns each one, fixed in fresh contexts, then independently re-reviewed. Exits on a clean review, no new findings, or 2 rounds.
- **`--verbose`** on all five phases. Default output reports phase boundaries; `--verbose` adds per-agent spawn/return.
- **The installer reports what's new** when the version changes, and `/set-update` leads with the same summary.

### Notes
- Autonomous runs never push, open a PR, merge, or claim work is verified — they always end by handing you the acceptance check and the push decision.
- Prefer starting autonomy at `/set-plan` from an approved spec. `--autonomous` on `/set-design` works but has the agent author its own requirements.
- Learnings captured during an autonomous run are tagged `(unverified cycle)`.

## [1.1.0] — Agent Teams by default

### Changed
- **`/set-build` now runs as a native Agent Team by default.** `--use-workflow` runs the same build brief on the dynamic-workflow path instead. `--use-agent-team` still exists as a silent no-op alias for the default.
- **The previous `--use-agent-team` implementation was dead code.** It called a `Teammate` tool with spawn/shutdown/cleanup operations that do not exist in the current Claude Code harness. It has been rewritten against the real API: the `Agent` tool spawns teammates, `SendMessage` coordinates them and requests shutdown, and the shared Task tools track task state. There is no native "coordinator" agent in Claude Code — the lead session is the coordinator.
- **A dedicated verifier teammate per task, capped at a concurrency ceiling of 4, writes no code** — preserving the fresh-verifier bar from the workflow path.
- **A stall timeout (3 unchanged polls, then 3 more)** prevents a lagging task's status from deadlocking its `blockedBy` dependents.
- **An availability gate guards the default path.** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is now REQUIRED (a session restart is needed after first write). If Agent Teams are unavailable, `/set-build` prompts to run on the workflow path now or stop and enable Agent Teams.
- **`install.sh` now treats a missing env var as an error, not a warning**, with a diagnostic naming both possible failure causes.
- **`/set-review` is unchanged** — still runs on dynamic workflows.

## [1.0.1] — Fix `/set-update` install reliability

> **Upgrading from pre-1.0?** Run the installer once in your terminal (not via `/set-update`): `curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash`. See the README "Upgrading from a pre-1.0 install" section for why.

### Fixed
- **`/set-update` could silently fail to update the SET commands.** When Claude ran the installer for `/set-update`, it executed inside Claude Code's sandbox, which blocks network access and writes to `~/.claude/` — so every command fetch failed with a misleading `"no local checkout and fetch failed"` while appearing to "run". (This was a latent issue: the pre-1.0 installer also could not write to `~/.claude/commands/` under the sandbox.) `/set-update` now instructs Claude to run the installer **with the sandbox disabled** (one permission prompt), or the user can run the line themselves in a terminal.
- **Installer now downloads the repo once instead of fetching each command file individually.** The no-checkout path resolves a single source (tarball, falling back to `git clone`) and copies all files locally — one network call instead of eleven, far fewer failure points.
- **Installer fails loudly.** It now exits non-zero with a clear ❌ and sandbox/network guidance when commands could not be installed, and asserts the installed commands are current (no stale pre-1.0 leftovers) — so a no-op update can no longer look successful.

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
- **To reach v1, run the installer once in your own terminal (NOT via `/set-update`):**
  ```bash
  curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
  ```
  Your installed `/set-update` is the pre-1.0 version; when Claude runs it the installer executes inside Claude Code's sandbox, which blocks the network/writes it needs, so it can't pull the new commands. Running the one-liner in a terminal sidesteps the sandbox. See the README "Upgrading from a pre-1.0 install" section. After this one-time step, `/set-update` works normally from inside Claude Code. You can uninstall the `compound-teams` plugin — SET no longer uses it.
- **`/set-update` now migrates an already-initialized project** (Step 1, before the installer re-run): it reconciles stale SET-generated content on disk — the old `### Ralph Loop (All Teammates Follow This)` block in `CLAUDE.md` and `"specialist on a SET Agent Team"` openers in `.claude/agents/*.md` — showing a diff and applying only on confirmation. Migration runs *before* the reinstall so it executes with known logic and isn't clobbered mid-run. Idempotent; touches only the known stale lines, never user customization.
- The default build/review path needs no setup beyond having dynamic workflows enabled (Pro users: `/config` → Dynamic workflows). The `--use-agent-team` mode needs the Agent Teams env flag, which the installer writes for you.
- Your plans, specs, shards, taxonomy, and `/set-learn` data are unchanged and fully compatible.

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
