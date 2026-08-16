#!/usr/bin/env bash
# SET enforcement hook — PreToolUse, matcher `Bash`.
#
# Denies agent-initiated `git push`, `gh pr create`, `gh pr merge` — including forms
# reached through `&&` / `||` / `;` / `|` / newline chaining, a leading `env` / `sudo` /
# VAR=val, subshells, and `sh -c "..."` strings. Everything else — `git commit` above all —
# is allowed: builders commit; that is how checkpoints work.
#
# Identity carve-out (selected by the probe findings, see
# docs/superpowers/specs/2026-08-16-hook-payload-probe-findings.md): the human's own
# session is the only caller allowed to push. Main-context payloads carry NO agent_id /
# agent_type; every spawn carries both. Identity is only trusted when the payload has the
# probed session shape; anything else is unknown identity and DENIES.
#
# Fail-closed on its own errors: no jq, unparseable payload → deny with a reason.
# Never keys on $CLAUDE_CODE_AGENT_NAME — the probe showed it is never set.
set -uo pipefail

ESCAPE='SET blocks agent-initiated pushes. Human review gate. To push yourself, type:  !git push origin <branch>  (! runs in your shell — no tool call, no hook.)'

deny() {
  # Emitted without jq so the fail-closed paths work when jq is the thing that is missing.
  # $1 is a fixed, controlled string — no untrusted bytes reach this JSON.
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

command -v jq >/dev/null 2>&1 || deny "SET: jq is not installed, so this hook cannot inspect the command; failing closed. Install jq. $ESCAPE"

payload=$(cat 2>/dev/null || true)
[ -n "$payload" ] || deny "SET: empty hook payload; failing closed. $ESCAPE"

parsed=$(printf '%s' "$payload" | jq -r '
  [ (.tool_name // ""),
    (.tool_input.command // ""),
    (if (.session_id? and .hook_event_name? == "PreToolUse")
       then (if (has("agent_id") or has("agent_type")) then "agent" else "main" end)
       else "unknown" end)
  ] | @tsv' 2>/dev/null) || deny "SET: unparseable hook payload; failing closed. $ESCAPE"

IFS=$'\t' read -r tool_name command caller <<<"$parsed"

# @tsv escapes \n \t \\ inside fields; undo so chained-by-newline commands are seen.
command=$(printf '%s' "$command" | sed -e 's/\\n/\n/g' -e 's/\\t/	/g' -e 's/\\\\/\\/g')

[ "$tool_name" = "Bash" ] || exit 0

# Does one shell segment start an outward-facing operation? Strips leading env/sudo/
# VAR=val/subshell noise, then git global options, then checks the subcommand.
is_gated_segment() {
  local seg="$1" tok
  local IFS=$' \t\n'                    # caller splits on ';' — restore word splitting here
  # shellcheck disable=SC2206
  local -a toks=($seg)
  local i=0 n=${#toks[@]}
  while [ $i -lt $n ]; do
    tok=${toks[$i]}
    case "$tok" in
      env|sudo|command|exec|nohup|time|builtin) i=$((i+1)); continue ;;
      -u|-g|-U|-C|-D|-R|-T|-h|-p) i=$((i+2)); continue ;;   # sudo/env flags taking an argument
      -*) i=$((i+1)); continue ;;           # other flags to env/sudo
      *=*) i=$((i+1)); continue ;;          # VAR=val
    esac
    break
  done
  [ $i -lt $n ] || return 1
  case "$tok" in
    git)
      i=$((i+1))
      while [ $i -lt $n ]; do
        tok=${toks[$i]}
        case "$tok" in
          -C|-c|--git-dir|--work-tree|--namespace|--exec-path) i=$((i+2)); continue ;;
          -*) i=$((i+1)); continue ;;
        esac
        break
      done
      [ $i -lt $n ] && [ "${toks[$i]}" = "push" ]
      ;;
    gh)
      [ $((i+2)) -lt $n ] && [ "${toks[$((i+1))]}" = "pr" ] && case "${toks[$((i+2))]}" in create|merge) true ;; *) false ;; esac
      ;;
    bash|sh|zsh|dash)
      # sh -c "<string>" (quotes already stripped): scan the string as its own command line.
      i=$((i+1)); local hasc=0
      while [ $i -lt $n ]; do
        case "${toks[$i]}" in -*c*) hasc=1; i=$((i+1)) ;; -*) i=$((i+1)) ;; *) break ;; esac
      done
      [ $hasc -eq 1 ] && [ $i -lt $n ] && is_gated_command "${toks[*]:$i}"
      ;;
    *) return 1 ;;
  esac
}

is_gated_command() {
  local cmd="$1" seg
  # Split on chaining operators and newlines; quotes are stripped so `bash -c "git push"`
  # is inspected. False positives inside quoted text are avoided by only matching a
  # segment's leading tokens (`echo git push` and `git commit -m "git push"` stay allowed).
  cmd=$(printf '%s' "$cmd" | tr '\n' ';' | sed -e 's/&&/;/g' -e 's/||/;/g' -e 's/|/;/g' -e "s/[\"']//g" -e 's/[`(){}]/;/g')
  local IFS=';'
  for seg in $cmd; do
    is_gated_segment "$seg" && return 0
  done
  return 1
}

is_gated_command "$command" || exit 0

case "$caller" in
  main) exit 0 ;;                        # the human's supervised session
  agent) deny "$ESCAPE" ;;
  *) deny "SET: caller identity undetectable from this payload; failing closed. $ESCAPE" ;;
esac
