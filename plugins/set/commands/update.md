---
description: "Update SET and all its dependencies (Superpowers, Compound Teams) to the latest versions. Run periodically to get improvements and bug fixes."
---

# SET Update — Update the Full Stack

Update SET and both of its prerequisite plugins to the latest versions.

SET is NOT in an official Claude marketplace. It is installed via `install.sh`. Update by re-running the installer — it overwrites the command files in `~/.claude/commands/` with the latest from the repo.

## Process

### 1. Update SET

Re-run the installer to pull latest commands:

```bash
curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash
```

### 2. Update Superpowers

```
/plugin update superpowers@claude-plugins-official
```

### 3. Update Compound Teams

```
/plugin update compound-teams@compound-teams-marketplace
```

### 4. Re-check Serena MCP

SET optionally mirrors learnings to Serena for semantic retrieval during `/set-build`. If Serena was installed (or removed) since the last init, update `.claude/set/config.json`.

```bash
# Detect Serena
ls .serena/ 2>/dev/null
grep -l '"serena"' ~/.claude/*.json ~/.config/claude/*.json .claude/*.json 2>/dev/null | head -1
```

Read `.claude/set/config.json` (create it if missing). Current state:
- Serena detected + `serena_enabled: true` → nothing to do
- Serena detected + `serena_enabled: false/missing` → prompt: "Serena MCP detected. Enable semantic learning retrieval? [y/N]". If yes, set `serena_enabled: true` and `mkdir -p .serena/memories`.
- Serena NOT detected + `serena_enabled: true` → warn user Serena is enabled in config but not installed. Ask whether to disable or keep waiting for reinstall.

### 5. Verify

After all updates complete, verify the installation:

```bash
echo "=== SET commands ==="
ls ~/.claude/commands/set-*.md 2>/dev/null

echo "=== Superpowers ==="
ls ~/.claude/plugins/cache/*/superpowers/ 2>/dev/null && echo "OK" || echo "NOT FOUND"

echo "=== Compound Teams ==="
ls ~/.claude/plugins/cache/*/compound-teams/ 2>/dev/null && echo "OK" || echo "NOT FOUND"

echo "=== Agent Teams enabled ==="
cat ~/.claude/settings.json 2>/dev/null | grep -q AGENT_TEAMS && echo "OK" || echo "NOT FOUND"
```

### 6. Report

Tell the user:
- Which plugins were updated successfully
- Any that failed (with suggested fix)
- If any SET commands changed, briefly note what's new
- Serena MCP status (enabled / disabled / not detected)
