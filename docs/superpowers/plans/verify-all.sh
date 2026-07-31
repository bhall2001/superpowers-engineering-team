#!/usr/bin/env bash
# Full contract verification for the agent-teams-default refactor.
set -u
cd "$(git rev-parse --show-toplevel)"
fail=0
run() { bash "docs/superpowers/plans/$1" || fail=1; }

echo "--- per-task contracts ---"
for t in verify-task1.sh verify-task2.sh verify-task3.sh verify-no-dead-api.sh \
         verify-task5.sh verify-task6.sh verify-task7.sh verify-task8.sh; do
  run "$t"
done

echo "--- upstream commands untouched ---"
if git diff --name-only main | grep -E 'commands/(init|design|plan)\.md'; then
  echo "FAIL: an upstream command was modified"; fail=1
else
  echo "PASS: init/design/plan untouched"
fi

echo "--- verdict schema parity ---"
n=$(grep -c 'tdd_followed' plugins/set/commands/build.md)
if [ "$n" -ge 2 ]; then echo "PASS: schema present in both paths ($n)"
else echo "FAIL: verdict schema appears $n time(s), want >=2"; fail=1; fi

echo "--- phase A/C harness-agnostic ---"
if awk '/^## Phase A/,/^## Agent Team Availability Gate/' plugins/set/commands/build.md \
   | grep -qiE 'TaskCreate|SendMessage|Workflow tool'; then
  echo "FAIL: Phase A contains harness-specific branching"; fail=1
else
  echo "PASS: Phase A is harness-agnostic"
fi

if awk '/^## Phase C/,0' plugins/set/commands/build.md \
   | grep -qiE 'TaskCreate|SendMessage|Workflow tool|the workflow returns'; then
  echo "FAIL: Phase C contains path-specific language"; fail=1
else
  echo "PASS: Phase C is harness-agnostic"
fi

echo "--- installer integrity ---"
bash -n install.sh && echo "PASS: install.sh syntax" || { echo "FAIL: install.sh syntax"; fail=1; }
c=$(grep -c 'install_file "commands/' install.sh)
[ "$c" = "7" ] && echo "PASS: all 7 commands install" || { echo "FAIL: $c command installs, want 7"; fail=1; }

echo
[ $fail -eq 0 ] && echo "=== ALL CONTRACTS PASS ===" || echo "=== FAILURES PRESENT ==="
exit $fail
