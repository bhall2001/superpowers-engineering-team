# Changelog

## [1.3.3] — Fix: read-only commands directory aborted the installer

### Fixed
- **A read-only `~/.claude/commands` aborted the installer with a bare permission error.** Devcontainers commonly bind-mount the host's commands directory read-only, so SET is installed once on the host and every container inherits it — but under `set -e` the installer's `mkdir -p` failed with an unexplained `Permission denied`, which reads like a broken install rather than a working design. It now probes writability up front and, when the directory is not writable, explains the container model, says to install on the host and restart the container, and reports the version currently mounted. On a non-container host the same check points at ownership and permissions instead. `/set-update` documents the same constraint, since an in-container agent running it is exactly who hits this.

## [1.3.2] — Fix: availability gate downgraded silently on a deferred-tool probe

### Fixed
- **The Agent Team availability gate checked only the env var.** With `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` set, an orchestrator would probe for the task tools, get `No matching deferred tools found` back from a malformed `ToolSearch` query, conclude the harness lacked Agent Teams, and fall back to the workflow path — reporting a missing feature where the real fault was the probe. The task tools are normally **deferred**: listed by name with no schema until `ToolSearch("select:TaskCreate,TaskList,TaskUpdate,TaskGet")` fetches them. The gate now spells out that query, notes that `No matching deferred tools found` is a query miss rather than a verdict on the harness, and treats Agent Teams as unavailable only when the `select:` form returns nothing *and* `TaskList` cannot be called.
- **"Agent Teams unavailable" no longer hides which check failed.** The env var and the tool probe have different fixes; a user told only "unavailable" edits `settings.json` for a problem that was never there. Both the interactive prompt and the `--autonomous` phase-boundary line now name the failing check.

### Notes
- `references/agent-return-channels.md` now records that its rule binds the **Agent Team path only**. The workflow path calls `agent(prompt, {schema})`, which has no `name` parameter and was never affected — so a green `--use-workflow` build or a default `/set-review` fan-out does not exercise the return-channel fix, and must not be cited as validating it.

## [1.3.1] — Fix: update digest skipped intermediate releases

### Fixed
- **The "what's new" digest covered only the newest release.** `install.sh` printed a header naming the full range (`SET updated 1.2.0 → 1.3.0`) but a body drawn from a single changelog section, so every release in between was reported as if it did not exist — a user upgrading 1.2.0 → 1.3.0 never saw 1.2.1's changes at all. The digest now walks every section newer than the installed version, grouping bullets under an indented per-release header when more than one is covered. A single-release update keeps the flat list it had before, and a fresh install still shows only the newest section. `/set-update` relays the grouped form.

### Notes
- Version comparison is numeric and component-wise, so a downgrade or a re-run on the same version correctly reports nothing rather than replaying history. A previous version that is not dotted-numeric (an unparseable or hand-edited `.set-version`) falls back to the newest-section digest instead of dumping every release.

## [1.3.0] — Durable autonomous runs + agent return-channel fix

### Added
- **Durable autonomous runs.** An autonomous run now survives a crash. Checkpoint commits on the build branch are the authoritative record of completed work: `/set-build --resume` derives its skip set from `SET-Run`/`SET-Tasks` git trailers, re-dispatches everything not durably committed, and leaves the working tree untouched as the forensic record of where the team broke. A machine-level SQLite store at `~/.claude/set-runs/runs.db` (WAL, `node:sqlite`) tracks liveness, enforces one live run per worktree, and logs checkpoints — taken *and* declined. Checkpoints are mandatory at phase boundaries, judgment-based within a phase, with a 30-minute backstop. Task identity is a stable slug derived from the task title, so re-planning does not re-dispatch finished work. See `references/run-store.md`; requires `node:sqlite` (stable on Node 24), and degrades to markdown-only if unavailable.
- **`references/agent-return-channels.md`** — the rule the fix below violated, in one place both commands cite: *name an agent only when you intend to `SendMessage` it; never when you need its result.* Documents why a named result is unrecoverable (`TaskOutput` is deprecated for agent tasks; its `.output` file is a transcript symlink that would overflow context), how to recognize the receipt, and why git is the corroborating channel when a report is missing.

### Fixed
- **`/set-build` verifiers returned nothing.** T3 spawned each verifier with `name: "verifier-{task-id}"`. A named `Agent` call returns a mailbox receipt (`Spawned successfully … will receive instructions via mailbox`) instead of the agent's final message, so every per-task verdict was discarded at the moment it was produced — the verifier did its work correctly and the result went nowhere. Verifiers are now spawned unnamed, which returns the verdict object as the tool result. The same applies to `/set-review` `--light` lenses, whose Step 2c "retry, then mark `FAILED`" was attributing a caller defect to the lens.
- **Stall detection misdiagnosed the symptom.** `/set-build` T4 treated a missing return as a stalled teammate and burned six polling rounds before failing the task. It now rules out the return-channel defect first: a result that never had a delivery path cannot be recovered by waiting.

### Notes
- Naming a builder teammate is still correct — the coordinator messages it and reads progress from the task list. `build.md` now states which spawns may carry a `name` and why, so the two cases are not conflated again.

## [1.2.1] — Autonomous mode + `--verbose`

### Added
- **`--autonomous` on all five cycle phases.** Runs that phase and every remaining phase through `/set-learn` without stopping at human gates — chained in-session by reading the next phase's command file directly, nothing written to disk. Carries only for the current conversation: not resumable after a crash, and a stale flag can never leak into a later manual invocation. Valid on `/set-design`, `/set-plan`, `/set-build`, `/set-review`, and `/set-learn`; `/set-init` and `/set-update` take neither switch.
- **`/set-learn` no longer stops to ask.** It chains nowhere from the terminal phase, but it otherwise asks you to approve a proposed taxonomy, approve each new domain, and approve every agent update — three gates an autonomous run would stall on. Under `--autonomous`, or when reached via a chain, it applies them and lists everything applied in the Final Report, so you review after instead of approving up front.
- **Bounded iterate loop in `/set-review --autonomous`.** On ITERATE, findings are compiled into a fix brief and routed to the specialist that owns each finding's domain — including specialists the original build never spawned (e.g. a security finding in a build that only touched UI and DB tasks still gets a security-owning fixer). Fix agents run in fresh contexts, followed by a fresh, independent four-lens re-review. The loop exits on whichever comes first: clean review, no new findings vs. the prior round, or 2 rounds spent. BLOCK, or any lens returning `FAILED`, halts immediately with iterations unspent — neither is something another round can fix.
- **`--verbose`** — standalone flag on all five cycle phases (`/set-design`, `/set-plan`, `/set-build`, `/set-review`, `/set-learn`), valid with or without `--autonomous`. Default output reports phase boundaries only (entering/leaving each phase with its headline result); `--verbose` adds per-agent spawn/return. There is no `--quiet` — phase boundaries are the floor a supervised run needs to follow along, not a default to suppress.
- **Installer reports what's new on a version change.** `install.sh` now reads the previously-installed version before overwriting `~/.claude/commands/`, compares it to the incoming version, and prints a short digest of that version's changelog entry — a version line plus one line per headline bullet, with a pointer to `CHANGELOG.md` for the full notes. `/set-update` leads its report with the same digest, since installer output is not where a Claude Code user reads it. Fully best-effort: a missing changelog, unparseable `plugin.json`, or unwritable version file degrades to printing nothing and never fails the install.

### Notes
- Autonomous runs never push, open a PR, merge, or claim work is verified — they always end by handing the user this project's acceptance check and the push decision.
- `--autonomous` on `/set-design` is supported but not currently best practice: the agent authors its own requirements, so a poor design costs tokens twice. Prefer starting autonomy at `/set-plan`, from a human-approved spec.
- Learning shards written during an autonomous run are tagged `(unverified cycle)` so a bad learning captured before human verification is traceable and removable.

## [1.2.0] — Autonomous mode + `--verbose`

### Added
- **`--autonomous` on all five cycle phases.** Runs that phase and every remaining phase through `/set-learn` without stopping at human gates — chained in-session by reading the next phase's command file directly, nothing written to disk. Carries only for the current conversation: not resumable after a crash, and a stale flag can never leak into a later manual invocation. Valid on `/set-design`, `/set-plan`, `/set-build`, `/set-review`, and `/set-learn`; `/set-init` and `/set-update` take neither switch.
- **`/set-learn` no longer stops to ask.** It chains nowhere from the terminal phase, but it otherwise asks you to approve a proposed taxonomy, approve each new domain, and approve every agent update — three gates an autonomous run would stall on. Under `--autonomous`, or when reached via a chain, it applies them and lists everything applied in the Final Report, so you review after instead of approving up front.
- **Bounded iterate loop in `/set-review --autonomous`.** On ITERATE, findings are compiled into a fix brief and routed to the specialist that owns each finding's domain — including specialists the original build never spawned (e.g. a security finding in a build that only touched UI and DB tasks still gets a security-owning fixer). Fix agents run in fresh contexts, followed by a fresh, independent four-lens re-review. The loop exits on whichever comes first: clean review, no new findings vs. the prior round, or 2 rounds spent. BLOCK, or any lens returning `FAILED`, halts immediately with iterations unspent — neither is something another round can fix.
- **`--verbose`** — standalone flag on all five cycle phases (`/set-design`, `/set-plan`, `/set-build`, `/set-review`, `/set-learn`), valid with or without `--autonomous`. Default output reports phase boundaries only (entering/leaving each phase with its headline result); `--verbose` adds per-agent spawn/return. There is no `--quiet` — phase boundaries are the floor a supervised run needs to follow along, not a default to suppress.
- **Installer reports what's new on a version change.** `install.sh` now reads the previously-installed version before overwriting `~/.claude/commands/`, compares it to the incoming version, and prints a short digest of that version's changelog entry — a version line plus one line per headline bullet, with a pointer to `CHANGELOG.md` for the full notes. `/set-update` leads its report with the same digest, since installer output is not where a Claude Code user reads it. Fully best-effort: a missing changelog, unparseable `plugin.json`, or unwritable version file degrades to printing nothing and never fails the install.

### Notes
- Autonomous runs never push, open a PR, merge, or claim work is verified — they always end by handing the user the browser check and the push decision.
- `--autonomous` on `/set-design` is supported but not currently best practice: the agent authors its own requirements, so a poor design costs tokens twice. Prefer starting autonomy at `/set-plan`, from a human-approved spec.
- Learning shards written during an autonomous run are tagged `(unverified cycle)` so a bad learning captured before human verification is traceable and removable.

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
