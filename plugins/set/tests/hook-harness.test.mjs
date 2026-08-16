import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHook, decisionOf, reasonOf, readSettings } from "./helpers/hook-harness.mjs";

const FIXTURE = new URL("./fixtures/settings-with-user-hooks.json", import.meta.url).pathname;

function withScript(body, fn) {
  const dir = mkdtempSync(join(tmpdir(), "hook-harness-"));
  const path = join(dir, "hook.sh");
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const DENY = `#!/usr/bin/env bash
cat >/dev/null
jq -nc '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"nope"}}'
`;

test("harness parses a hook's decision and reason", () => {
  withScript(DENY, (script) => {
    const r = runHook(script, { tool_name: "Bash", tool_input: { command: "git push" } });
    assert.equal(r.status, 0);
    assert.equal(decisionOf(r), "deny");
    assert.equal(reasonOf(r), "nope");
  });
});

test("harness captures a non-zero exit instead of throwing", () => {
  withScript("#!/usr/bin/env bash\ncat >/dev/null\necho boom >&2\nexit 3\n", (script) => {
    let r;
    assert.doesNotThrow(() => {
      r = runHook(script, { tool_name: "Bash" });
    });
    assert.equal(r.status, 3);
    assert.match(r.stderr, /boom/);
    assert.equal(decisionOf(r), null);
  });
});

test("harness reports null decision when a hook stays silent", () => {
  withScript("#!/usr/bin/env bash\ncat >/dev/null\nexit 0\n", (script) => {
    const r = runHook(script, { tool_name: "Bash" });
    assert.equal(decisionOf(r), null);
  });
});

test("harness passes stdin through verbatim", () => {
  withScript("#!/usr/bin/env bash\njq -c '{got: .tool_input.command}'\n", (script) => {
    const r = runHook(script, { tool_name: "Bash", tool_input: { command: "pnpm test && git push" } });
    assert.equal(r.json.got, "pnpm test && git push");
  });
});

test("harness can unset an inherited env var", () => {
  withScript('#!/usr/bin/env bash\ncat >/dev/null\necho "[${CLAUDE_CODE_AGENT_NAME:-UNSET}]"\n', (script) => {
    const set = runHook(script, {}, { env: { CLAUDE_CODE_AGENT_NAME: "builder-set" } });
    assert.match(set.stdout, /\[builder-set\]/);

    const unset = runHook(script, {}, { env: { CLAUDE_CODE_AGENT_NAME: undefined } });
    assert.match(unset.stdout, /\[UNSET\]/);
  });
});

test("fixture mirrors the real settings shape", () => {
  const s = readSettings(FIXTURE);

  // Shape that the merge/uninstall filter depends on: an array of entries, each
  // holding its own `hooks` array. A simplified fixture would hide filter bugs.
  assert.ok(Array.isArray(s.hooks.PreToolUse));
  assert.ok(Array.isArray(s.hooks.PreToolUse[0].hooks));
  assert.equal(s.hooks.PreToolUse[0].hooks[0].type, "command");
  assert.match(s.hooks.PreToolUse[0].matcher, /Read\|Grep\|Bash/);

  // A SessionStart entry with no matcher — proves SET touches only PreToolUse.
  assert.ok(Array.isArray(s.hooks.SessionStart));
  assert.equal(s.hooks.SessionStart[0].matcher, undefined);
});
