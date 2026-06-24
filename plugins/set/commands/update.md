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

### 2. Update Superpowers

```
/plugin update superpowers@claude-plugins-official
```

### 3. Verify

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

### 4. Report

Tell the user:
- Which plugins were updated successfully
- Any that failed (with suggested fix)
- If any SET commands changed, briefly note what's new
- Serena MCP status
