#!/usr/bin/env bash
# SET enforcement hook — PreToolUse, matcher `Agent`.
#
# Enforces references/agent-return-channels.md structurally: name an agent only when you
# intend to SendMessage it; never when you need its result. A named spawn's tool result
# is a mailbox receipt, so a named VERIFIER's verdict never arrives — a silent stall.
#
# Denies an `Agent` call carrying both a `name` and a verifier-shaped prompt. Verifier
# shape is SET's own T3 template: the prompt states "you write NO code" or requests the
# verdict schema (`passed` + `tdd_followed` + `spec_compliant`). Everything else is
# allowed — named builders above all; a hook blocking them halts every build.
#
# Payload field paths are the probe's Q4 finding: tool_input = {description, prompt,
# subagent_type, name}, `name` top-level in tool_input, absent when unnamed.
#
# Heuristic, and honestly so: an oddly-phrased verifier slips through, a builder prompt
# quoting the schema false-positives. Both recoverable — the message names the fix.
# Fail-closed on its own errors: no jq, unparseable payload → deny with a reason.
set -uo pipefail

RULE='SET: a NAMED Agent spawn with a verifier-shaped prompt. Named spawns return a mailbox receipt, not the agent output, so this verdict would never arrive. Fix: re-spawn without `name` (name an agent only to SendMessage it; never when you need its result). See references/agent-return-channels.md.'

deny() {
  # Emitted without jq so the fail-closed paths work when jq is the thing that is missing.
  # $1 is a fixed, controlled string — no untrusted bytes reach this JSON.
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

command -v jq >/dev/null 2>&1 || deny "SET: jq is not installed, so this hook cannot inspect the Agent call; failing closed. Install jq."

payload=$(cat 2>/dev/null || true)
[ -n "$payload" ] || deny "SET: empty hook payload; failing closed."

# jq does the whole classification so the prompt text never round-trips through shell
# word-splitting. Output is one of: allow | deny.
verdict=$(printf '%s' "$payload" | jq -r '
  if .tool_name != "Agent" then "allow"
  elif ((.tool_input.name // "") | length) == 0 then "allow"
  else
    (.tool_input.prompt // "") as $p
    | if ($p | test("write\\s+no\\s+code"; "i"))
         or (($p | test("\\bpassed\\b")) and ($p | test("\\btdd_followed\\b")) and ($p | test("\\bspec_compliant\\b")))
      then "deny" else "allow" end
  end' 2>/dev/null) || deny "SET: unparseable hook payload; failing closed."

case "$verdict" in
  allow) exit 0 ;;
  deny) deny "$RULE" ;;
  *) deny "SET: unparseable hook payload; failing closed." ;;
esac
