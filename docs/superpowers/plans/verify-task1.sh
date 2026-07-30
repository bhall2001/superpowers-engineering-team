#!/usr/bin/env bash
# Task 1 contract: team path is default, --use-workflow opts out,
# --use-agent-team is a silent no-op alias.
set -u
F=plugins/set/commands/build.md
fail=0
grep -q -- "--use-workflow" "$F" || { echo "FAIL: --use-workflow not documented"; fail=1; }
grep -qi "silent no-op\|no-op alias" "$F" || { echo "FAIL: --use-agent-team not marked no-op"; fail=1; }
grep -qi "Agent Team path.*default\|default.*Agent Team path" "$F" || { echo "FAIL: team path not stated as default"; fail=1; }
grep -q "Add --use-workflow" "$F" || { echo "FAIL: frontmatter description not updated"; fail=1; }
[ $fail -eq 0 ] && echo "PASS: Task 1"
exit $fail
