import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readSettings } from "./helpers/hook-harness.mjs";

const CLI = new URL("../bin/set-hooks.mjs", import.meta.url).pathname;
const FIXTURE = new URL("./fixtures/settings-with-user-hooks.json", import.meta.url).pathname;
const HOOKS_DIR = "/Users/example/.claude/set/hooks";
const SET_COMMANDS = [`${HOOKS_DIR}/set-deny-push.sh`, `${HOOKS_DIR}/set-guard-agent-name.sh`];

function cli(args, { expectFail = false } = {}) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
    assert.ok(!expectFail, `expected failure but succeeded: ${out}`);
    return JSON.parse(out);
  } catch (err) {
    if (!expectFail) throw new Error(`${args[0]} failed: ${err.stderr || err.message}`);
    return { failed: true, stderr: err.stderr ?? "" };
  }
}

function withSettings(initial, fn) {
  const dir = mkdtempSync(join(tmpdir(), "set-hooks-"));
  const path = join(dir, "settings.json");
  if (initial === FIXTURE) copyFileSync(FIXTURE, path);
  else if (initial !== null) writeFileSync(path, initial);
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const install = (path) => cli(["install", "--settings", path, "--hooks-dir", HOOKS_DIR]);
const uninstall = (path) => cli(["uninstall", "--settings", path, "--hooks-dir", HOOKS_DIR]);

const setEntries = (s) =>
  (s.hooks?.PreToolUse ?? []).filter((e) => (e.hooks ?? []).some((h) => h.command.startsWith(HOOKS_DIR)));
const userEntries = (s) =>
  (s.hooks?.PreToolUse ?? []).filter((e) => !(e.hooks ?? []).some((h) => h.command.startsWith(HOOKS_DIR)));

test("merge into settings holding the user's hooks: both survive, SET entries appended", () => {
  withSettings(FIXTURE, (path) => {
    const before = readSettings(FIXTURE);
    const r = install(path);
    const after = readSettings(path);

    assert.deepEqual(userEntries(after), before.hooks.PreToolUse, "user's PreToolUse entries changed");
    assert.deepEqual(after.hooks.SessionStart, before.hooks.SessionStart, "SessionStart was touched");
    assert.deepEqual(after.env, before.env, "env was touched");

    const cmds = setEntries(after).flatMap((e) => e.hooks.map((h) => h.command));
    assert.deepEqual(cmds.sort(), [...SET_COMMANDS].sort());
    assert.deepEqual(r.installed.sort(), [...SET_COMMANDS].sort());

    // Appended after the user's, and each SET entry has the real shape.
    assert.equal(after.hooks.PreToolUse.length, before.hooks.PreToolUse.length + 2);
    for (const e of setEntries(after)) {
      assert.match(e.matcher, /^(Bash|Agent)$/);
      assert.equal(e.hooks[0].type, "command");
      assert.equal(typeof e.hooks[0].timeout, "number");
    }
  });
});

test("SET entries use matcher Bash for deny-push and Agent for guard-agent-name", () => {
  withSettings(FIXTURE, (path) => {
    install(path);
    const byCmd = Object.fromEntries(setEntries(readSettings(path)).map((e) => [e.hooks[0].command, e.matcher]));
    assert.equal(byCmd[`${HOOKS_DIR}/set-deny-push.sh`], "Bash");
    assert.equal(byCmd[`${HOOKS_DIR}/set-guard-agent-name.sh`], "Agent");
  });
});

test("merge into settings with no hooks key succeeds", () => {
  withSettings('{"env":{"X":"1"}}\n', (path) => {
    install(path);
    const s = readSettings(path);
    assert.equal(s.env.X, "1");
    assert.equal(setEntries(s).length, 2);
  });
});

test("merge into {} succeeds", () => {
  withSettings("{}\n", (path) => {
    install(path);
    assert.equal(setEntries(readSettings(path)).length, 2);
  });
});

test("merge into a missing settings file creates it", () => {
  withSettings(null, (path) => {
    assert.ok(!existsSync(path));
    install(path);
    assert.equal(setEntries(readSettings(path)).length, 2);
  });
});

test("merge run twice is idempotent — no duplicate SET entries", () => {
  withSettings(FIXTURE, (path) => {
    install(path);
    const once = readSettings(path);
    const r = install(path);
    const twice = readSettings(path);
    assert.deepEqual(twice, once);
    assert.deepEqual(r.installed, []);
    assert.deepEqual(r.skipped.sort(), [...SET_COMMANDS].sort());
  });
});

test("uninstall removes SET entries; user's hooks byte-identical", () => {
  withSettings(FIXTURE, (path) => {
    install(path);
    const r = uninstall(path);
    const after = readSettings(path);
    assert.equal(r.removed, 2);
    assert.equal(setEntries(after).length, 0);
    assert.deepEqual(after, readSettings(FIXTURE), "install→uninstall round trip altered the user's settings");
  });
});

test("uninstall when no SET entries exist is a no-op, no error", () => {
  withSettings(FIXTURE, (path) => {
    const r = uninstall(path);
    assert.equal(r.removed, 0);
    assert.deepEqual(readSettings(path), readSettings(FIXTURE));
  });
});

test("uninstall on settings with no hooks key does not error", () => {
  withSettings("{}\n", (path) => {
    const r = uninstall(path);
    assert.equal(r.removed, 0);
    assert.deepEqual(readSettings(path), {});
  });
});

test("uninstall on a missing settings file does not error", () => {
  withSettings(null, (path) => {
    const r = uninstall(path);
    assert.equal(r.removed, 0);
  });
});

test("SessionStart entries are never touched by install or uninstall", () => {
  withSettings(FIXTURE, (path) => {
    const orig = readSettings(FIXTURE).hooks.SessionStart;
    install(path);
    assert.deepEqual(readSettings(path).hooks.SessionStart, orig);
    uninstall(path);
    assert.deepEqual(readSettings(path).hooks.SessionStart, orig);
  });
});

test("uninstall filters by the hooks-dir prefix, so a differently-located SET-looking hook survives", () => {
  const other = { matcher: "Bash", hooks: [{ type: "command", command: "/elsewhere/set-deny-push.sh", timeout: 10 }] };
  withSettings(JSON.stringify({ hooks: { PreToolUse: [other] } }), (path) => {
    install(path);
    uninstall(path);
    assert.deepEqual(readSettings(path).hooks.PreToolUse, [other]);
  });
});

test("hooks-dir must be absolute", () => {
  withSettings("{}\n", (path) => {
    const r = cli(["install", "--settings", path, "--hooks-dir", "relative/dir"], { expectFail: true });
    assert.ok(r.failed);
    assert.match(r.stderr, /absolute/);
  });
});

test("a missing required flag fails with a usable message, not a stack trace", () => {
  const r = cli(["install"], { expectFail: true });
  assert.ok(r.failed);
  assert.match(r.stderr, /--settings/);
  assert.doesNotMatch(r.stderr, /at .*\.mjs:\d+/);
});
