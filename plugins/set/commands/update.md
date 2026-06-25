---
description: "Updates SET commands, Superpowers, and Serena to their latest versions by re-running install.sh and plugin update commands. Use when a user says 'update SET', 'upgrade SET', 'get the latest SET', or 'SET is out of date'. Do NOT use to initialize a new project (use /set-init) or as part of a normal design/build cycle."
---

# SET Update — Update the Full Stack

Update SET and both prerequisite plugins to the latest versions.

## Process

### 1. Update SET

Re-run the installer to pull latest commands (also installs/updates Serena):

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

### 2. Migrate this project from pre-1.0 SET (if needed)

SET 1.0 dropped Compound Teams and moved build/review onto dynamic workflows. Projects initialized under an earlier SET have **generated content on disk** with stale wording (the command reinstall in Step 1 does not touch project files). Reconcile it here.

This step is **idempotent** (safe to re-run) and **never silently overwrites** — show each proposed change and get confirmation before writing. If none of the stale markers below are found, report "Project already current" and skip to Step 3.

#### 2a: Migrate `CLAUDE.md`

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

#### 2b: Migrate agent scaffolds in `.claude/agents/*.md`

For each file, check the opening line for the stale phrase `specialist on a SET Agent Team`. If found, propose replacing **only** that phrase:

- `You are a {domain} specialist on a SET Agent Team.` → `You are a {domain} specialist agent in the SET workflow.`

Also replace any literal `message team lead` / `team lead` coordination phrasing that originated from the old scaffold with workflow-neutral wording (e.g. "report the blocker"). Do **not** reformat or rewrite anything the user customized — touch only the known stale lines. Show each proposed per-file change and apply on confirmation.

#### 2c: Report

List exactly what was migrated (CLAUDE.md block: yes/no; which agent files changed) or confirm the project was already current. Note that plans, specs, shards, taxonomy, and `config.json` need no migration — they are format-compatible with 1.0.

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

echo "=== Agent Teams enabled (optional — for /set-build --use-agent-team) ==="
cat ~/.claude/settings.json 2>/dev/null | grep -q AGENT_TEAMS && echo "OK" || echo "not set (only needed for --use-agent-team)"

echo "=== Serena MCP ==="
cat ~/.claude/settings.json 2>/dev/null | grep -q '"serena"' && echo "OK" || echo "NOT FOUND"
```

### 5. Report

Tell the user:
- Which plugins were updated successfully
- Any that failed (with suggested fix)
- If any SET commands changed, briefly note what's new
- Whether this project needed migration (Step 2) and what changed
- Serena MCP status
