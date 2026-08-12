---
description: "Updates SET commands and Superpowers to their latest versions by re-running install.sh and plugin update commands, and migrates project files from earlier SET versions. Use when a user says 'update SET', 'upgrade SET', 'get the latest SET', or 'SET is out of date'. Do NOT use to initialize a new project (use /set-init) or as part of a normal design/build cycle."
---

# SET Update — Update the Full Stack

Update SET and both prerequisite plugins to the latest versions.

## Process

> **Order matters.** Migration (Step 1) runs **before** the installer re-run (Step 2). This command's migration logic operates on project files using the version of this command currently on disk; re-running the installer first would overwrite this command mid-run (and, when testing an unreleased branch, silently revert it to `main`). Migrate first, then reinstall.

### 1. Migrate this project from pre-1.0 SET (if needed)

SET 1.0 dropped Compound Teams and moved build/review onto dynamic workflows. Projects initialized under an earlier SET have **generated content on disk** with stale wording (the command reinstall in Step 2 does not touch project files). Reconcile it here, first, while this command is still the one running.

This step is **idempotent** (safe to re-run) and **never silently overwrites** — show each proposed change and get confirmation before writing. If none of the stale markers below are found, report "Project already current" and continue to Step 2.

#### 1a: Migrate `CLAUDE.md`

Look for the old SET-generated block. The marker is a heading line `### Ralph Loop (All Teammates Follow This)`.

If present, propose replacing **that heading and its numbered list** (steps 1–8, ending with the "message team lead with blocker" line) with the current block — leave everything else in `CLAUDE.md` untouched:

```markdown
### Per-Task TDD Loop (enforced by /set-build for every builder)
1. Write failing tests first (TDD red phase)
2. Implement minimal code to pass (TDD green phase)
3. Refactor while keeping tests green
4. Run tests — if fail: read error, fix, retry
5. Run linter/type checker — if fail: fix and retry
6. Self-review against acceptance criteria
7. Only mark a task complete when ALL checks pass — a fresh verifier confirms the bar before the work is folded back
```

Show the user a diff of the old block vs. the new block. Apply only on confirmation.

#### 1b: Migrate agent scaffolds in `.claude/agents/*.md`

For each file, check the opening line for the stale phrase `specialist on a SET Agent Team`. If found, propose replacing **only** that phrase:

- `You are a {domain} specialist on a SET Agent Team.` → `You are a {domain} specialist agent in the SET workflow.`

Also replace any literal `message team lead` / `team lead` coordination phrasing that originated from the old scaffold with workflow-neutral wording (e.g. "report the blocker"). Do **not** reformat or rewrite anything the user customized — touch only the known stale lines. Show each proposed per-file change and apply on confirmation.

**Then normalize frontmatter (makes the agent spawnable as an `agentType`).** For each `.claude/agents/*.md` file, apply the first matching case:

1. **No `---` frontmatter block** → synthesize one and prepend it:
   - `name:` = filename stem (always — this is the critical key; `db-specialist.md` → `name: db-specialist`).
   - `description:` = derived from the `# {Name} — {Domain} Specialist` heading if parseable; else `SET specialist (review & refine)`.
   - `model:` = the value under the old `## Model` section if present; else `sonnet`.
   - `tools:` = `[Read, Edit, Write, Bash, Grep, Glob]`.
   - Remove the now-redundant `## Model` section from the body (its value moved to frontmatter).
   - Leave the rest of the body untouched — do NOT rewrite user customizations.
2. **Has frontmatter but `name:` is missing or ≠ filename stem** → set/fix `name:` to the stem; leave other keys as-is.
3. **Already correct** (frontmatter present, `name:` matches stem) → no change.

**Undecipherable/heavily-customized file** (no derivable domain or model): still inject `name:` (stem), `description: SET specialist (review & refine)`, `model: sonnet`, `tools: [Read, Edit, Write, Bash, Grep, Glob]`; leave the body untouched; and **flag the file in the 1d report** for the user to review and refine.

This normalization is **idempotent** and follows the same rule as the rest of Step 1: show each proposed per-file diff and apply only on confirmation.

#### 1c: Offer to move Serena onto the official plugin

Only relevant to users who already run Serena. **Serena is optional in SET** — skip this
sub-step entirely for anyone who doesn't have it, and never suggest installing it here.

When SET does install Serena it uses the official Claude Code plugin rather than a
hand-written `mcpServers` entry. The installer (Step 2) deliberately **leaves an existing
standalone entry alone** so nobody's Serena is swapped mid-cycle — which means this
migration only ever happens here, if the user opts in.

Check for a standalone entry:

```bash
jq -e '.mcpServers.serena' ~/.claude/settings.json &>/dev/null && echo "standalone" || echo "none"
```

If it prints `none`, skip this sub-step entirely — either the plugin is already in use or Serena isn't installed.

If it prints `standalone`, offer the switch. Explain it plainly, including what does **not** change:

> Your Serena is configured as a standalone `mcpServers` entry pointing at a locally-installed binary. The official plugin runs the same server via `uvx --from git+https://github.com/oraios/serena`, so it tracks upstream instead of staying pinned to whatever version you installed, and Claude Code manages its lifecycle across sessions.
>
> This is a packaging change only — same stdio server, same one-instance-per-session behavior. It does **not** give spawned agents their own Serena: SET queries it in the lead and injects results as text, and that is unaffected either way.
>
> Switch now? (Your local `serena` binary stays installed; you can remove it with `uv tool uninstall serena-agent` once you're happy.)

On confirmation:

```bash
jq 'del(.mcpServers.serena)' ~/.claude/settings.json > ~/.claude/settings.json.tmp \
  && mv ~/.claude/settings.json.tmp ~/.claude/settings.json
claude plugin install serena@claude-plugins-official
```

Run the `claude plugin install` line with the sandbox disabled (same reason as Step 2 — it writes under `~/.claude/`). Then tell the user to **restart Claude Code**, since MCP servers are wired up at session start.

If the user declines, leave everything as-is and note it in the 1d report — the standalone entry keeps working and SET supports both.

#### 1c-bis: Verify learning shards are committable

Projects initialized before this check existed may be silently discarding every learning
they produce. Shards only carry forward to future cycles if git can see them, and many
repos ignore `.claude/` wholesale:

```bash
git check-ignore -q .claude/set/ && echo IGNORED || echo TRACKABLE
```

If `TRACKABLE`, note it and move on. If `IGNORED`, this is worth flagging clearly — every
`/set-learn` run to date wrote learnings that will vanish with the worktree or container:

> ⚠️  `.claude/set/` is gitignored, so SET's learning shards are not tracked. Learnings
> written by past `/set-learn` runs have not been carried forward, and future ones won't
> be either.
>
> Fix by excluding `.claude/`'s *contents* rather than the directory, then negating:
>
> ```
> .claude/*
> !.claude/set/
> ```
>
> The trailing `*` is required — git will not re-include a path whose parent directory is
> excluded, so a bare `.claude/` line makes `!.claude/set/` a silent no-op.

Show the proposed `.gitignore` change and apply only on confirmation. Keep `.serena/`
ignored — it is a rebuildable index, not source of truth. Committing the now-visible
shards is the user's call; don't stage or commit them here.

#### 1c-ter: Reconcile `serena_enabled` with how this project actually runs

Serena is now **optional**, and `serena_enabled` in `.claude/set/config.json` decides
whether `/set-build`, `/set-review`, and `/set-learn` call it at all. Projects predating
that change may carry a stale `true`.

Read the flag. If it is absent, leave it absent — `/set-build` resolves it lazily. If it
is `true`, confirm the assumption still holds:

> `serena_enabled: true` — SET will query Serena for semantic recall over your learnings.
> That works when the session running `/set-build` can reach an MCP server.
>
> If this project's agents run **walled** — inside a devcontainer or an isolated worktree
> — no agent reaches Serena, the lead included. In that case the flag should be `false`:
> SET falls back to keyword search over the same shards, which is what actually runs there.
>
> Keep `true`, or switch to `false`?

Only ask when the flag is `true`; a `false` value needs no reconciliation. Apply the
user's answer to `.claude/set/config.json` and note it in the 1d report.

#### 1d: Report migration result

List exactly what was migrated (CLAUDE.md block: yes/no; which agent files had stale-phrase edits; which agent files had frontmatter added, `name:` fixed, or were flagged for review; Serena: switched to plugin / declined / already plugin / not installed; shard trackability: already trackable / `.gitignore` fixed / still ignored by choice; `serena_enabled`: unchanged / switched to false / absent) or confirm the project was already current. Note that plans, specs, shards, and taxonomy need no migration — they are format-compatible with 1.0.

If shards were just made trackable, say so plainly: the learnings are now visible to `git status` and committing them is the user's call.

### 2. Update SET commands

Re-run the installer to pull the latest commands. It will offer Serena as an optional
opt-in prompt (default no); declining changes nothing about the update:

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

**Run this command with the sandbox DISABLED** (set `dangerouslyDisableSandbox: true` on the Bash call). The installer must reach `raw.githubusercontent.com` to fetch the command files **and** write them into `~/.claude/commands/` — both are blocked by the default command sandbox, which makes every fetch fail with `"no local checkout and fetch failed"`. This is the one place SET legitimately needs network + a write outside the project, so disabling the sandbox for this single call is expected. The user will see one permission prompt to allow it.

If the user prefers not to grant that, tell them to run the line themselves outside the agent — e.g. by typing it with a leading `!` in the Claude Code prompt, or pasting it into their terminal — which runs outside the sandbox.

> Re-running the installer overwrites this `/set-update` command with the latest version. That's expected and safe now that migration (Step 1) has already run.

### 3. Update Superpowers

```
/plugin update superpowers@claude-plugins-official
```

### 4. Verify

```bash
echo "=== SET commands ==="
ls ~/.claude/commands/set-*.md 2>/dev/null

echo "=== Superpowers ==="
ls ~/.claude/plugins/cache/*/superpowers/ 2>/dev/null && echo "OK" || echo "NOT FOUND"

echo "=== Agent Teams enabled (required for the default /set-build path) ==="
cat ~/.claude/settings.json 2>/dev/null | grep -q AGENT_TEAMS && echo "OK" || echo "not set — the default /set-build path needs it (restart after setting); /set-build --use-workflow needs no flag"

echo "=== Serena MCP (optional) ==="
if jq -e '.enabledPlugins | keys[] | select(startswith("serena@"))' ~/.claude/settings.json &>/dev/null; then
  echo "present (plugin)"
elif jq -e '.mcpServers.serena' ~/.claude/settings.json &>/dev/null; then
  echo "present (standalone mcpServers entry)"
else
  echo "not installed — fine; SET uses keyword search over the same shards"
fi

echo "=== Learning shards trackable by git ==="
git check-ignore -q .claude/set/ 2>/dev/null \
  && echo "IGNORED — learnings will not persist (see migration step 1c-bis)" \
  || echo "OK"
```

### 5. Report

Tell the user:
- Which plugins were updated successfully
- Any that failed (with suggested fix)
- If any SET commands changed, briefly note what's new
- Whether this project needed migration (Step 1) and what changed
- Serena MCP status — as a neutral fact, not a warning; absent is a supported state
- Whether learning shards are trackable by git, and if not, that learnings are being lost
