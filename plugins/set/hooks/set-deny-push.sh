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
# Run-scoped gate (see docs/superpowers/specs/2026-08-16-run-scoped-push-gate-design.md).
# Two conditions must BOTH hold to deny: the caller is a spawned agent, AND a SET build is
# running in this worktree. Identity alone cannot separate "a builder inside /set-build"
# from "the assistant helping a human at a keyboard" — outside a run those are the same
# payload shape — so run state is the discriminator and identity only narrows it.
#
# Identity (probe findings, docs/superpowers/specs/2026-08-16-hook-payload-probe-findings.md):
# main-context payloads carry NO agent_id / agent_type; every spawn carries both. Identity is
# only trusted when the payload has the probed session shape; anything else DENIES.
#
# Run state: <worktree>/.claude/set/RUN-IN-PROGRESS.md, written by /set-build before it
# spawns anything and deleted when it finishes. Marker absent -> allow. A crashed build
# leaves the marker behind, so a stale marker must not deny forever: it carries pid/host/
# started and the liveness rules below mirror probeDead/staleMinutes in bin/claim.mjs.
# Polarity is deliberate — every ambiguity keeps the gate ON. Unknown pid is NOT dead.
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

ESCAPE='To push yourself, type:  !git push origin <branch>  (! runs in your shell — no tool call, no hook.)'
MARKER_REL='.claude/set/RUN-IN-PROGRESS.md'
STALE_AFTER_MINUTES=15   # mirrors STALE_AFTER_MINUTES in bin/claim.mjs

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
  agent) ;;                              # narrow further on run state, below
  *) deny "SET: caller identity undetectable from this payload; failing closed. $ESCAPE" ;;
esac

# ---------------------------------------------------------------------------
# Run state. Reached only for a gated command from a spawned agent.
# ---------------------------------------------------------------------------

# Worktree root: walk up from the payload's cwd looking for .git (a file in a linked
# worktree, a directory in a normal clone). Scoping is by LOCATION — a build in repo A
# cannot gate a push in repo B — so there is no path comparison to get wrong. cwd is used
# as given; no realpath, because both sides of the comparison are this same string.
cwd=$(printf '%s' "$payload" | jq -r '.cwd // ""' 2>/dev/null) \
  || deny "SET: unparseable hook payload (cwd); failing closed. $ESCAPE"

marker=""
if [ -n "$cwd" ] && [ "${cwd#/}" != "$cwd" ]; then    # absolute paths only
  dir=$cwd
  while :; do
    if [ -e "$dir/.git" ] && [ -f "$dir/$MARKER_REL" ]; then
      marker="$dir/$MARKER_REL"; break
    fi
    [ -e "$dir/.git" ] && break            # repo root reached, no marker
    parent=${dir%/*}
    [ -n "$parent" ] || parent=/
    [ "$parent" = "$dir" ] && break        # hit /
    dir=$parent
  done
fi

# No marker: no build is running here. This is the ordinary case — an agent pushing
# outside a run, which is exactly what this change is meant to allow.
[ -n "$marker" ] || exit 0

# Marker present. Parse pid/host/started. Values are read with a whitelist pattern rather
# than trusted, because the file is human-editable and its bytes end up in JSON below.
field() {
  LC_ALL=C sed -n "s/^[[:space:]]*$1:[[:space:]]*\([A-Za-z0-9._:+-]\{1,64\}\)[[:space:]]*$/\1/p" \
    "$marker" 2>/dev/null | head -n1
}
m_pid=$(field pid); m_host=$(field host); m_started=$(field started); m_run=$(field run)

RUN_LABEL=""
[ -n "$m_run" ] && RUN_LABEL=" (run $m_run)"
DENY_LIVE="SET blocks pushes from agents during an active build${RUN_LABEL}. The human reviews before anything leaves the machine. If no build is running, delete $MARKER_REL . $ESCAPE"

# A marker with neither a usable pid nor a usable timestamp is undeterminable state, not an
# absent run: fail closed.
if [ -z "$m_pid" ] && [ -z "$m_started" ]; then
  deny "SET found a run marker it cannot parse, so it is failing closed. Inspect or delete $MARKER_REL . Your own session is unaffected. $ESCAPE"
fi

# Liveness, mirroring probeDead/staleMinutes (bin/claim.mjs:21-60):
#   pid alive -> ON | pid gone (ESRCH) -> OFF | pid unknown -> ON | other host -> ON
#   no pid, started older than STALE_AFTER_MINUTES -> OFF, else ON
# Only a POSITIVE finding that the run is gone turns the gate off. A stale marker denying
# is annoying and one `rm` away; a gate dropping mid-build is the failure this prevents.
if [ -n "$m_host" ] && [ "$m_host" != "$(hostname -s 2>/dev/null || hostname 2>/dev/null)" ]; then
  deny "$DENY_LIVE"                      # another machine — never assume dead
fi

if [ -n "$m_pid" ]; then
  case "$m_pid" in
    ''|*[!0-9]*) deny "$DENY_LIVE" ;;     # unparseable pid is unknown, not dead
  esac
  if kill -0 "$m_pid" 2>/dev/null; then
    deny "$DENY_LIVE"                     # alive and ours
  fi
  # kill -0 fails for BOTH ESRCH ("no such process") and EPERM ("operation not
  # permitted" — the process EXISTS but is owned by another user, or this hook is
  # sandboxed). probeDead (bin/claim.mjs) treats only ESRCH as dead, and the distinction
  # is not in the exit status: both are 1. It is only in the message.
  #
  # `ps -p` is NOT a usable tiebreaker here: under the hook sandbox `ps -p 1` reports
  # absent for a process that is plainly alive, which would read a live build as crashed
  # and drop the gate mid-run — the one direction this design must never fail.
  #
  # So: dead ONLY on an explicit no-such-process. Anything else (EPERM, an unexpected
  # message, a locale that renders it differently, no stderr at all) keeps the gate ON.
  kill_err=$(kill -0 "$m_pid" 2>&1) || true
  case "$kill_err" in
    *"no such process"*|*"No such process"*) exit 0 ;;   # provably gone; gate releases
    *) deny "$DENY_LIVE" ;;                              # unknown, EPERM → still ON
  esac
fi

# No pid recorded, so the heartbeat decides.
now_s=$(date -u +%s 2>/dev/null) || deny "$DENY_LIVE"
started_s=$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$m_started" +%s 2>/dev/null \
         || date -u -d "$m_started" +%s 2>/dev/null) || started_s=""
[ -n "$started_s" ] || deny "$DENY_LIVE"  # unparseable timestamp is unknown, not stale
age_min=$(( (now_s - started_s) / 60 ))
[ "$age_min" -ge "$STALE_AFTER_MINUTES" ] && exit 0
deny "$DENY_LIVE"
