# Hook Payload Probe — Findings

**Status:** ⏳ INSTALLED, AWAITING SESSION RESTART
**Design spec:** `2026-08-16-set-hooks-and-serena-excision-design.md` (Section 3)
**Plan task:** `T-run-probe-matrix-and-write-findings`

---

## RESUME HEADER — read this first after the restart

### What is installed

| | |
|---|---|
| Hook script | `plugins/set/hooks/set-probe.sh` (in this repo, executable) |
| Registered in | `.claude/settings.local.json` → `hooks.PreToolUse` |
| Matcher | `Bash\|Agent` |
| Log | `~/.claude/set/probe-log.txt` (override with `$SET_PROBE_LOG`) |

The probe **never emits a decision and always exits 0**. It cannot block a tool call.
If something is being denied, it is not this.

### State is derived from disk, not from memory

| Question | Command |
|---|---|
| Which cases have fired? | `grep -c '^--- ENTRY' ~/.claude/set/probe-log.txt` |
| Is the probe still installed? | `jq '.hooks.PreToolUse' .claude/settings.local.json` |
| Is cleanup done? | probe absent from settings **and** this file's status is not `AWAITING` |

### Trigger matrix — tick as each fires

- [ ] (a) main context runs a trivial `Bash` — the human's own call
- [ ] (b) main context spawns a **named** agent that runs `Bash` — a teammate
- [ ] (c) main context spawns an **unnamed** agent that runs `Bash` — a verifier
- [ ] (d) the `Agent` spawns in (b)/(c) themselves — payload shape for Q4
- [ ] (e) a spawn with a `-set`-suffixed name **and** an explicit `subagent_type` — Q5/Q6

Read the log before triggering anything and record the starting entry count. Trigger cases
one at a time, confirming a new entry after each — do not batch and hope.

### Removal (run when the matrix is complete)

```bash
jq 'if (.hooks.PreToolUse | type) == "array"
    then (.hooks.PreToolUse) |= map(select(any(.hooks[]?; .command | test("set-probe")) | not))
    else . end' \
   .claude/settings.local.json > .claude/settings.local.json.tmp \
   && mv .claude/settings.local.json.tmp .claude/settings.local.json
rm -f ~/.claude/set/probe-log.txt
```

Verified against this repo's real `settings.local.json`: the probe entry is removed and all
four `permissions.allow` entries survive. **This file is retained** — it is the evidence
artifact, not a throwaway.

### Manual abort

If the restart goes wrong or this session loses the thread, the command above is the entire
recovery. Nothing else needs undoing.

---

## Questions

| Q | Question | Answer |
|---|---|---|
| Q1 | Does a PreToolUse hook subprocess inherit `$CLAUDE_CODE_AGENT_NAME`? | *pending* |
| Q2 | Does the payload carry agent identity under any key? | *pending* |
| Q3 | Is main-session distinguishable from named-spawn and unnamed-spawn? | *pending* |
| Q4 | Exact `tool_input` shape of an `Agent` call — where `name` appears | *pending* |
| Q5 | Does a `-set`-suffixed `name` satisfy the name pattern? | *pending* |
| Q6 | Does the suffix disturb `subagent_type` routing? | *pending* |

## Raw evidence

*Paste verbatim log entries here, one block per case. Paraphrase is not evidence.*

## Decision

Pre-committed in the design spec; record which branch the evidence selects:

- **If (a) is reliably distinguishable from (b)/(c):** the push-deny gains an identity
  carve-out — the human may ask Claude to push in a supervised session, teammates may not.
  Unknown identity → **deny**.
- **If not:** unconditional deny. The human pushes with `!git push`, which fires no hook.

**Fallback is DENY under both outcomes.** A push gate that fails open is worse than no gate.

Selected branch: *pending*

## Q5/Q6 consequence

If the `-set` suffix fails validation or disturbs `subagent_type` routing, plan task
`T-add-set-name-suffix-to-spawns` is **dropped**, and the reason is recorded here. The
guard hook then falls back to prompt-shape detection alone.
