# Hook Payload Probe — Findings

**Status:** ✅ COMPLETE — matrix run 2026-08-16, probe removed
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

- [x] (a) main context runs a trivial `Bash` — the human's own call
- [x] (b) main context spawns a **named** agent that runs `Bash` — a teammate
- [x] (c) main context spawns an **unnamed** agent that runs `Bash` — a verifier
- [x] (d) the `Agent` spawns in (b)/(c) themselves — payload shape for Q4
- [x] (e) a spawn with a `-set`-suffixed name **and** an explicit `subagent_type` — Q5/Q6

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
| Q1 | Does a PreToolUse hook subprocess inherit `$CLAUDE_CODE_AGENT_NAME`? | **No.** `AGENT_NAME=[UNSET]` in all 15 entries, main and subagent alike. |
| Q2 | Does the payload carry agent identity under any key? | **Yes.** Subagent payloads carry top-level `agent_id` and `agent_type`. Named spawn → `agent_type` = the `name` (`"probe-teammate"`, `"builder-t1-set"`); unnamed spawn → `agent_type` = the `subagent_type` (`"general-purpose"`). `agent_id` = `a` + name + `-` + hex (named) or bare hex (unnamed). |
| Q3 | Is main-session distinguishable from named-spawn and unnamed-spawn? | **Yes.** Main-context payloads have **no** `agent_id`/`agent_type` keys at all (10 keys); every subagent payload has both (12 keys). Named vs unnamed distinguishable by whether `agent_type` matches a known `subagent_type` / by `agent_id` prefix. |
| Q4 | Exact `tool_input` shape of an `Agent` call — where `name` appears | `tool_input` = `{description, prompt, subagent_type, name}` — `name` is a **top-level** key of `tool_input`, absent when unnamed. |
| Q5 | Does a `-set`-suffixed `name` satisfy the name pattern? | **Yes.** `builder-t1-set` spawned; `agent_type:"builder-t1-set"`. |
| Q6 | Does the suffix disturb `subagent_type` routing? | **No.** Suffixed agent ran as `general-purpose` normally (Bash available, returned output). Note the payload does **not** expose `subagent_type` for a named agent — the name overwrites it in `agent_type`. |

## Raw evidence

Verbatim log entries, one per case. Only `session_id`/`transcript_path` values are elided
(`…`) — every other byte is as logged. Full log had 15 entries at completion.

**(a) main context, trivial Bash**
```
--- ENTRY 2026-08-16T12:50:42Z ---
AGENT_NAME=[UNSET]
KEYS=["cwd","effort","hook_event_name","permission_mode","prompt_id","session_id","tool_input","tool_name","tool_use_id","transcript_path"]
PAYLOAD={"session_id":"…","transcript_path":"…","cwd":"/Users/bobhall/develop/superpowers-engineering-team","prompt_id":"c1a349b3-3fab-49c8-863e-fc6864bf72f8","permission_mode":"auto","effort":{"level":"high"},"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"cat ~/.claude/set/probe-log.txt","description":"Show probe log"},"tool_use_id":"toolu_016sJeYdxbDDKWy6ftX8RPuT"}
```

**(d) main context spawns named agent — `Agent` payload**
```
--- ENTRY 2026-08-16T12:50:46Z ---
AGENT_NAME=[UNSET]
KEYS=["cwd","effort","hook_event_name","permission_mode","prompt_id","session_id","tool_input","tool_name","tool_use_id","transcript_path"]
PAYLOAD={"session_id":"…","transcript_path":"…","cwd":"/Users/bobhall/develop/superpowers-engineering-team","prompt_id":"c1a349b3-3fab-49c8-863e-fc6864bf72f8","permission_mode":"auto","effort":{"level":"high"},"hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"description":"Probe case b: named agent","prompt":"Run exactly one Bash command: `echo probe-case-b-named` . Then reply with just the output. Do nothing else.","subagent_type":"general-purpose","name":"probe-teammate"},"tool_use_id":"toolu_01UR1cA6iUMKi7aYuA51aLqp"}
```

**(b) named agent (`probe-teammate`) runs Bash**
```
--- ENTRY 2026-08-16T12:50:50Z ---
AGENT_NAME=[UNSET]
KEYS=["agent_id","agent_type","cwd","effort","hook_event_name","permission_mode","prompt_id","session_id","tool_input","tool_name","tool_use_id","transcript_path"]
PAYLOAD={"session_id":"…","transcript_path":"…","cwd":"/Users/bobhall/develop/superpowers-engineering-team","prompt_id":"c1a349b3-3fab-49c8-863e-fc6864bf72f8","permission_mode":"auto","agent_id":"aprobe-teammate-697acffc5dd58965","agent_type":"probe-teammate","effort":{"level":"high"},"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo probe-case-b-named","description":"Echo probe string"},"tool_use_id":"toolu_01Q83DQ7HgPcxCKVxGU2eQv8"}
```

**(c) unnamed agent (`subagent_type: general-purpose`) runs Bash**
```
--- ENTRY 2026-08-16T12:51:08Z ---
AGENT_NAME=[UNSET]
KEYS=["agent_id","agent_type","cwd","effort","hook_event_name","permission_mode","prompt_id","session_id","tool_input","tool_name","tool_use_id","transcript_path"]
PAYLOAD={"session_id":"…","transcript_path":"…","cwd":"/Users/bobhall/develop/superpowers-engineering-team","prompt_id":"c1a349b3-3fab-49c8-863e-fc6864bf72f8","permission_mode":"auto","agent_id":"a3ab692a2e497df0a","agent_type":"general-purpose","effort":{"level":"high"},"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo probe-case-c-unnamed","description":"Echo probe string"},"tool_use_id":"toolu_01RLw5Uaqj…"}
```

**(e) `-set`-suffixed name + explicit `subagent_type` — spawn payload and its Bash**
```
"tool_name":"Agent","tool_input":{"description":"Probe case e: -set suffix","prompt":"Run exactly one Bash command: `echo probe-case-e-suffix` . Then reply with just the output. Do nothing else.","subagent_type":"general-purpose","name":"builder-t1-set"}

--- ENTRY 2026-08-16T12:51:26Z ---
AGENT_NAME=[UNSET]
KEYS=["agent_id","agent_type","cwd","effort","hook_event_name","permission_mode","prompt_id","session_id","tool_input","tool_name","tool_use_id","transcript_path"]
PAYLOAD={"session_id":"…","transcript_path":"…","cwd":"/Users/bobhall/develop/superpowers-engineering-team","prompt_id":"c1a349b3-3fab-49c8-863e-fc6864bf72f8","permission_mode":"auto","agent_id":"abuilder-t1-set-f74239eb064f3a3d","agent_type":"builder-t1-set","effort":{"level":"high"},"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo probe-case-e-suffix","description":"Echo probe string"},"tool_use_id":"…"}
```

Environment: Claude Code with `permission_mode: auto`, agents spawned via the `Agent` tool
from the main context (not a `Workflow` run and not an `--use-workflow` Agent Team lead —
those paths were **not** probed; re-probe before relying on identity there).

## Decision

Pre-committed in the design spec; record which branch the evidence selects:

- **If (a) is reliably distinguishable from (b)/(c):** the push-deny gains an identity
  carve-out — the human may ask Claude to push in a supervised session, teammates may not.
  Unknown identity → **deny**.
- **If not:** unconditional deny. The human pushes with `!git push`, which fires no hook.

**Fallback is DENY under both outcomes.** A push gate that fails open is worse than no gate.

Selected branch: **identity carve-out.** (a) is reliably distinguishable: main-context
payloads lack `agent_id`/`agent_type`; every spawn carries both. Guard rule for the push
gate: `if (.agent_id // .agent_type) != null → deny`; otherwise (main context) allow the
human-supervised push. Absent/unparseable payload → deny. Do **not** key on
`$CLAUDE_CODE_AGENT_NAME` (never set) and do not key on `agent_type` matching a `-set`
suffix alone — unnamed spawns carry `subagent_type` there and must still be denied.

Bonus: `agent_type` ending in `-set` positively identifies a SET-named teammate, so the
`-set` suffix is usable as a secondary signal for SET-specific hooks (not for the push gate).

## Q5/Q6 consequence

Suffix validated and routing undisturbed (Q5/Q6). `T-add-set-name-suffix-to-spawns` is
**kept**. Caveat for the hook author: for a named agent the payload's `agent_type` is the
name, not the `subagent_type` — a hook cannot recover the specialist type from a named
spawn's payload; it must be encoded in the name if needed.
