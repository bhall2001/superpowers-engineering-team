#!/usr/bin/env bash
# SET enforcement hook — PreToolUse, matcher `Bash`.
#
# Denies agent-initiated `git push`, `gh pr create`, `gh pr merge` (and `gh api` writes to a
# pulls endpoint) — including forms reached through `&&` / `||` / `;` / `|` / `&` / newline
# chaining, `if … then` / `do` bodies, a leading `env` / `sudo` / `timeout` / `nice` /
# VAR=val, subshells and `$( )`, and `sh -c "..."` strings. Everything else — `git commit`
# above all — is allowed: builders commit; that is how checkpoints work.
#
# Splitting is quote-aware (awk), so a commit message or heredoc body that merely *mentions*
# `git push` is not a push. Only a segment's leading tokens are matched.
#
# Identity carve-out (selected by the probe findings, see
# docs/superpowers/specs/2026-08-16-hook-payload-probe-findings.md): the human's own
# session is the only caller allowed to push. Main-context payloads carry NO agent_id /
# agent_type; every spawn carries both. Identity is only trusted when the payload has the
# probed session shape; anything else is unknown identity and DENIES.
#
# PROBED: in-process spawns via the `Agent` tool (named and unnamed), from a main context.
# NOT PROBED: `Workflow`-tool agents (`--use-workflow`, `/set-review`), and teammates run
# as separate processes (tmux / split-pane teammateMode). A separate process may present a
# main-shaped payload and be allowed. Re-probe before relying on the carve-out there.
#
# KNOWN BYPASSES (deliberately out of scope — this is a heuristic over a shell string, not
# a sandbox): `eval "…"`, `$cmd`/`${X:-push}` expansion, git/gh aliases, scripts written to
# disk and executed, other languages (`python -c`, `ssh host git push`), remote-write tools
# other than git/gh.
#
# Fail-closed on its own errors: no jq, unparseable payload → deny with a reason.
# Never keys on $CLAUDE_CODE_AGENT_NAME — the probe showed it is never set.
set -uo pipefail
set -f   # never glob-expand the inspected command against the cwd (timeout → fail-open)

ESCAPE='SET blocks agent-initiated pushes. Human review gate. To push yourself, type:  !git push origin <branch>  (! runs in your shell — no tool call, no hook.)'

deny() {
  # Emitted without jq so the fail-closed paths work when jq is the thing that is missing.
  # $1 is a fixed, controlled string — no untrusted bytes reach this JSON.
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

command -v jq >/dev/null 2>&1 || deny "SET: jq is not installed, so this hook cannot inspect the command; failing closed. Install jq. $ESCAPE"
command -v awk >/dev/null 2>&1 || deny "SET: awk is not installed, so this hook cannot inspect the command; failing closed. $ESCAPE"

payload=$(cat 2>/dev/null || true)
[ -n "$payload" ] || deny "SET: empty hook payload; failing closed. $ESCAPE"

# Classification first (no untrusted text crosses here besides tool_name), command second,
# raw — so newlines and tabs in the command are seen as-is with no escaping round trip.
parsed=$(printf '%s' "$payload" | jq -r '
  [ (.tool_name // ""),
    (if (.session_id? and .hook_event_name? == "PreToolUse")
       then (if (has("agent_id") or has("agent_type")) then "agent" else "main" end)
       else "unknown" end)
  ] | @tsv' 2>/dev/null) || deny "SET: unparseable hook payload; failing closed. $ESCAPE"
IFS=$'\t' read -r tool_name caller <<<"$parsed"

[ "$tool_name" = "Bash" ] || exit 0

command=$(printf '%s' "$payload" | jq -r '
  .tool_input.command // "" | if type == "string" then . else error("command is not a string") end' 2>/dev/null) \
  || deny "SET: unparseable hook payload (tool_input.command); failing closed. $ESCAPE"

# split_segments — stdin: a shell command string; stdout: one segment per line.
# Quote-aware: `;` `&` `|` newline `(` `)` `{` `}` and backtick split only OUTSIDE quotes.
# Quotes are removed from the output; a backslash outside quotes escapes the next char and
# backslash-newline is a continuation. A newline inside quotes becomes `;` so a
# `bash -c "cd x<nl>git push"` string re-splits correctly when the sh -c branch recurses.
# Heredoc bodies (`<<EOF` … `EOF`) are skipped entirely — they are data, not commands.
# Streams output as it goes (no per-char string building), so cost is linear in the
# command length: a huge command must not push the hook past its timeout (→ fail-open).
split_segments() {
  LC_ALL=C awk '
    # Skip a heredoc body starting after the newline at c[i]; returns the index of the
    # terminator line trailing newline (or n). Leading tabs ignored for <<-.
    function skip_heredoc(i,   line, j) {
      while (i < n) {
        line = ""; j = i + 1
        while (j <= n && c[j] != "\n") { line = line c[j]; j++ }
        i = j
        if (hd_strip) sub(/^\t+/, "", line)
        if (line == hd_delim) return i
      }
      return n
    }
    # Emit c[from..to] in one piece.
    function emit(from, to) { if (to >= from) printf "%s", substr($0, from, to - from + 1) }
    BEGIN { RS = "\001" }        # slurp everything; SOH never appears in a command
    {
      n = split($0, c, "")
      q = ""; hd_pending = 0
      i = 1
      while (i <= n) {
        ch = c[i]
        if (q == "") {
          if (ch == "\\") {
            if (i + 1 <= n && c[i+1] != "\n") emit(i + 1, i + 1)   # \<nl> = continuation
            i += 2
          } else if (ch == "$" && i < n && c[i+1] == "\047") {
            q = "\047"; i += 2                    # ANSI-C $-quoting
          } else if (ch == "\047" || ch == "\"") {
            q = ch; i++
          } else if (ch == "<" && i + 1 <= n && c[i+1] == "<" && !(i + 2 <= n && c[i+2] == "<")) {
            # heredoc: <<[-][ ]["]DELIM["] — remember the delimiter, skip the body after the newline
            i += 2; hd_strip = 0
            if (i <= n && c[i] == "-") { hd_strip = 1; i++ }
            while (i <= n && (c[i] == " " || c[i] == "\t")) i++
            hd_delim = ""; dq = ""
            while (i <= n) {
              if (dq == "") {
                if (c[i] == "\047" || c[i] == "\"") { dq = c[i]; i++; continue }
                if (c[i] == "\\") { i++; if (i <= n) hd_delim = hd_delim c[i]; i++; continue }
                if (index(" \t\n;&|()<>", c[i]) > 0) break
                hd_delim = hd_delim c[i]; i++
              } else {
                if (c[i] == dq) { dq = ""; i++; continue }
                hd_delim = hd_delim c[i]; i++
              }
            }
            hd_pending = 1; printf " "
          } else if (ch == "\n" && hd_pending) {
            printf "\n"; hd_pending = 0
            i = skip_heredoc(i) + 1
          } else if (index(";&|\n(){}`", ch) > 0) {
            printf "\n"; i++
          } else {
            j = i                                 # plain run: emit in one piece
            while (j + 1 <= n && index("\\$\047\"<;&|\n(){}`", c[j+1]) == 0) j++
            emit(i, j); i = j + 1
          }
        } else if (q == "\047") {
          if (ch == "\047") { q = ""; i++ }
          else if (ch == "\n") { printf ";"; i++ }
          else {
            j = i
            while (j + 1 <= n && c[j+1] != "\047" && c[j+1] != "\n") j++
            emit(i, j); i = j + 1
          }
        } else {                                  # inside double quotes
          if (ch == "\\" && i < n && index("\"\\$`\n", c[i+1]) > 0) {
            if (c[i+1] != "\n") emit(i + 1, i + 1)
            i += 2
          } else if (ch == "\"") { q = ""; i++ }
          else if (ch == "\n") { printf ";"; i++ }
          else {
            j = i
            while (j + 1 <= n && c[j+1] != "\"" && c[j+1] != "\\" && c[j+1] != "\n") j++
            emit(i, j); i = j + 1
          }
        }
      }
      printf "\n"
    }'
}

# Does one shell segment start an outward-facing operation? Strips leading env/sudo/
# timeout/VAR=val/keyword noise, then git global options, then checks the subcommand.
is_gated_segment() {
  local seg="$1" tok
  local IFS=$' \t\n'
  # shellcheck disable=SC2206
  local -a toks=($seg)
  local i=0 n=${#toks[@]}
  while [ $i -lt $n ]; do
    tok=${toks[$i]}
    case "$tok" in
      # wrappers and shell keywords a gated command may follow
      env|sudo|command|exec|nohup|time|builtin|ionice|caffeinate|stdbuf|\
      then|do|else|elif|if|while|until|!) i=$((i+1)); continue ;;
      nice|xargs)                                                 # nice -n N cmd / xargs -n N -I {} cmd
        i=$((i+1))
        while [ $i -lt $n ]; do
          case "${toks[$i]}" in
            -n|-I|-L|-P|-s|-d|-E|-a|--max-args|--max-procs|--delimiter|--arg-file) i=$((i+2)) ;;
            -*) i=$((i+1)) ;;
            *) break ;;
          esac
        done
        continue ;;
      timeout)                                                    # timeout [flags] DURATION cmd
        i=$((i+1))
        while [ $i -lt $n ]; do
          case "${toks[$i]}" in
            -s|-k|--signal|--kill-after) i=$((i+2)) ;;
            -*) i=$((i+1)) ;;
            *) break ;;
          esac
        done
        i=$((i+1)); continue ;;                                   # the duration
      -u|-g|-U|-C|-D|-R|-T|-h|-p) i=$((i+2)); continue ;;         # sudo/env flags taking an argument
      -*) i=$((i+1)); continue ;;                                 # other flags to a wrapper
      *=*) i=$((i+1)); continue ;;                                # VAR=val
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
      i=$((i+1))
      [ $i -lt $n ] || return 1
      case "${toks[$i]}" in
        pr)
          i=$((i+1))
          while [ $i -lt $n ]; do                                 # gh pr -R o/r create
            case "${toks[$i]}" in
              -R|--repo) i=$((i+2)) ;;
              -*) i=$((i+1)) ;;
              *) break ;;
            esac
          done
          [ $i -lt $n ] && case "${toks[$i]}" in create|merge) true ;; *) false ;; esac
          ;;
        api)                                                      # gh api -X POST repos/o/r/pulls …
          local pulls=0 write=0
          for tok in "${toks[@]:$i}"; do
            case "$tok" in
              */pulls|*/pulls/*|*/pulls\?*) pulls=1 ;;
              -X|--method|-f|-F|--field|--raw-field|--input|-X=*|--method=*) write=1 ;;
              POST|PUT|PATCH) write=1 ;;
            esac
          done
          [ $pulls -eq 1 ] && [ $write -eq 1 ]
          ;;
        *) return 1 ;;
      esac
      ;;
    bash|sh|zsh|dash)
      # sh -c "<string>" (quotes already stripped): scan the string as its own command line.
      i=$((i+1)); local hasc=0
      while [ $i -lt $n ]; do
        case "${toks[$i]}" in
          --rcfile|--init-file|-o|+o|-O|+O) i=$((i+2)) ;;
          --*) i=$((i+1)) ;;
          -*c*) hasc=1; i=$((i+1)) ;;
          -*|+*) i=$((i+1)) ;;
          *) break ;;
        esac
      done
      [ $hasc -eq 1 ] && [ $i -lt $n ] && is_gated_command "${toks[*]:$i}"
      ;;
    *) return 1 ;;
  esac
}

is_gated_command() {
  local seg
  # grep -w pre-filter: only segments that mention a gated program reach the bash parser,
  # so a command with thousands of irrelevant segments costs thousands of grep lines,
  # not thousands of function calls.
  while IFS= read -r seg; do
    is_gated_segment "$seg" && return 0
  done < <(printf '%s' "$1" | split_segments | grep -Ew 'git|gh|sh|bash|zsh|dash')
  return 1
}

# Size cap. The parser is linear, but a multi-hundred-KB command still costs seconds, and a
# hook that exceeds its timeout is treated as a non-blocking error — i.e. fail-OPEN. Above
# the cap, degrade to a coarse whole-string scan: cheap, still fail-closed, and its only
# cost is a false positive on a huge command that merely mentions a push.
MAX_PARSE=65536
if [ ${#command} -gt $MAX_PARSE ]; then
  if printf '%s' "$command" | LC_ALL=C grep -Eq '(^|[^[:alnum:]_])(git[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+(create|merge)|gh[[:space:]]+api[^;|&]*pulls)'; then
    gated=0
  else
    gated=1
  fi
else
  is_gated_command "$command"; gated=$?
fi
[ $gated -eq 0 ] || exit 0

case "$caller" in
  main) exit 0 ;;                        # the human's supervised session
  agent) deny "$ESCAPE" ;;
  *) deny "SET: caller identity undetectable from this payload; failing closed. $ESCAPE" ;;
esac
