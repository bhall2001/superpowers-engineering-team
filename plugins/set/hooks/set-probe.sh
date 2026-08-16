#!/usr/bin/env bash
# THROWAWAY. Logs PreToolUse payloads to answer the hook-identity questions in
# docs/superpowers/specs/2026-08-16-set-hooks-and-serena-excision-design.md (Q1-Q6).
# Remove it once the findings are written — see "Manual abort" in that spec.
#
# Never emits a decision and always exits 0: a measurement instrument must not
# change what it measures.
set -uo pipefail

LOG="${SET_PROBE_LOG:-$HOME/.claude/set/probe-log.txt}"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

payload=$(cat 2>/dev/null || true)

keys=$(printf '%s' "$payload" | jq -c 'keys' 2>/dev/null || printf '<unparseable>')
compact=$(printf '%s' "$payload" | jq -c '.' 2>/dev/null || printf '%s' "$payload")

{
  printf -- '--- ENTRY %s ---\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)"
  printf 'AGENT_NAME=[%s]\n' "${CLAUDE_CODE_AGENT_NAME:-UNSET}"
  printf 'KEYS=%s\n' "$keys"
  printf 'PAYLOAD=%s\n' "$compact"
  printf '\n'
} >> "$LOG" 2>/dev/null || true

exit 0
