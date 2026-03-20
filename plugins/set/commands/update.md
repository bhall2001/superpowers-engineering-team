---
description: "Update SET and all its dependencies (Superpowers, Compound Teams) to the latest versions. Run periodically to get improvements and bug fixes."
---

# SET Update — Update the Full Stack

Update SET and both of its prerequisite plugins to the latest versions.

## Process

### 1. Update SET

```
/plugin update set
```

If this fails, try removing and reinstalling:
```
/plugin uninstall set
/plugin install set
```

### 2. Update Superpowers

```
/plugin update superpowers@claude-plugins-official
```

### 3. Update Compound Teams

```
/plugin update compound-teams@compound-teams-marketplace
```

### 4. Verify

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

### 5. Report

Tell the user:
- Which plugins were updated successfully
- Any that failed (with suggested fix)
- If any SET commands changed, briefly note what's new
