#!/usr/bin/env bash
# No non-existent harness tools may appear anywhere in the SET commands.
set -u
fail=0
for tok in "Teammate(" "spawnTeam" "requestShutdown" "TeamCreate" "TeamDelete"; do
  if grep -rn -- "$tok" plugins/set/commands/ 2>/dev/null; then
    echo "FAIL: dead API token '$tok' still present"; fail=1
  fi
done
if grep -rn 'operation: *"cleanup"' plugins/set/commands/ 2>/dev/null; then
  echo "FAIL: cleanup operation still present"; fail=1
fi
[ $fail -eq 0 ] && echo "PASS: no dead API references"
exit $fail
