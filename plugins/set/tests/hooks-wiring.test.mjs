import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, statSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readSettings } from "./helpers/hook-harness.mjs";

const REPO = new URL("../../..", import.meta.url).pathname;
const CLI = join(REPO, "plugins/set/bin/set-hooks.mjs");
const FIXTURE = join(REPO, "plugins/set/tests/fixtures/settings-with-user-hooks.json");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

// The install/init/update path cannot be driven end-to-end without a Claude session and
// network (install.sh calls `claude plugin install`). What IS mechanical: the shipped
// scripts, the exact invocation each command spec makes, and the project-settings merge
// that invocation performs on a fixture project.

test("hook scripts ship executable", () => {
  for (const s of ["set-deny-push.sh", "set-guard-agent-name.sh"]) {
    const mode = statSync(join(REPO, "plugins/set/hooks", s)).mode & 0o111;
    assert.ok(mode, `${s} is not executable`);
  }
});

test("install.sh places hook scripts + set-hooks.mjs centrally under ~/.claude/set/hooks and marks them executable", () => {
  const sh = read("install.sh");
  assert.match(sh, /HOOKS_DIR="\$CLAUDE_DIR\/set\/hooks"/);
  assert.match(sh, /cp .*\/hooks\/\*\.sh.*"\$HOOKS_DIR\/"/);
  assert.match(sh, /cp .*set-hooks\.mjs.*"\$HOOKS_DIR\/"/);
  assert.match(sh, /chmod \+x "\$HOOKS_DIR"\//);
  // Verified, like every other installed artifact.
  assert.match(sh, /set-deny-push\.sh/);
  assert.match(sh, /set-guard-agent-name\.sh/);
});

test("install.sh never registers hooks in the user's ~/.claude/settings.json", () => {
  const sh = read("install.sh");
  assert.doesNotMatch(sh, /set-hooks\.mjs install/);
  assert.doesNotMatch(sh, /\.hooks\.PreToolUse/);
});

for (const cmd of ["init", "update"]) {
  test(`${cmd}.md installs the hooks into PROJECT settings via set-hooks.mjs`, () => {
    const md = read(`plugins/set/commands/${cmd}.md`);
    const line = md.split("\n").find((l) => /set-hooks\.mjs install/.test(l));
    assert.ok(line, `${cmd}.md has no set-hooks.mjs install invocation`);
    assert.match(line, /--settings \.claude\/settings\.json/, "must target the project file");
    assert.doesNotMatch(line, /~\/\.claude\/settings\.json/, "must never target user settings");
    assert.match(line, /--hooks-dir ~\/\.claude\/set\/hooks|--hooks-dir "\$HOME\/\.claude\/set\/hooks"/);
  });
}

test("update.md's pending-work list names hook installation", () => {
  const md = read("plugins/set/commands/update.md");
  assert.match(md, /set-deny-push\.sh/);
  assert.match(md, /hooks? (not|are not|aren't) (yet )?installed|MISSING SET hooks|hooks: MISSING/i);
});

test("the init/update invocation on a fixture project: SET entries present, user's hooks intact, idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "set-proj-"));
  try {
    mkdirSync(join(dir, ".claude"));
    copyFileSync(FIXTURE, join(dir, ".claude/settings.json"));
    const hooksDir = join(dir, "home/.claude/set/hooks"); // stands in for ~/.claude/set/hooks
    const run = () =>
      JSON.parse(execFileSync(process.execPath, [CLI, "install", "--settings", ".claude/settings.json", "--hooks-dir", hooksDir], { cwd: dir, encoding: "utf8" }));

    run();
    const once = readSettings(join(dir, ".claude/settings.json"));
    const before = readSettings(FIXTURE);
    assert.deepEqual(once.hooks.SessionStart, before.hooks.SessionStart);
    assert.deepEqual(once.hooks.PreToolUse.slice(0, before.hooks.PreToolUse.length), before.hooks.PreToolUse);
    const cmds = once.hooks.PreToolUse.slice(before.hooks.PreToolUse.length).map((e) => e.hooks[0].command);
    assert.deepEqual(cmds.sort(), [join(hooksDir, "set-deny-push.sh"), join(hooksDir, "set-guard-agent-name.sh")].sort());

    // Absolute paths, so N projects share one copy.
    for (const c of cmds) assert.ok(c.startsWith("/"), c);

    const r = run();
    assert.deepEqual(r.installed, []);
    assert.deepEqual(readSettings(join(dir, ".claude/settings.json")), once);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("update path against a project with no hooks key adds them", () => {
  const dir = mkdtempSync(join(tmpdir(), "set-proj-"));
  try {
    mkdirSync(join(dir, ".claude"));
    execFileSync(process.execPath, [CLI, "install", "--settings", ".claude/settings.json", "--hooks-dir", "/abs/hooks"], { cwd: dir, encoding: "utf8" });
    const s = readSettings(join(dir, ".claude/settings.json"));
    assert.equal(s.hooks.PreToolUse.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
