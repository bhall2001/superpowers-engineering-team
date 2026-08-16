import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, statSync, copyFileSync, symlinkSync } from "node:fs";
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

test("install.sh verifies the hook copy before claiming success", () => {
  const sh = read("install.sh");
  // A read-only ~/.claude copies nothing; an unconditional success line would send the
  // user on to /set-init, which registers entries pointing at absent scripts. A hook
  // command that is "not found" is a NON-BLOCKING error, so the gate would be silently
  // absent — worse than visibly missing.
  const block = sh.slice(sh.indexOf('if [ -d "$PLUGIN_ROOT/hooks" ]'));
  const end = block.indexOf("Durable run store");
  const hookBlock = block.slice(0, end > 0 ? end : 2000);

  assert.match(hookBlock, /\[ -f "\$HOOKS_DIR\/\$hook" \]/, "must test each file exists");
  assert.match(hookBlock, /warn "Enforcement hooks NOT installed/, "must warn on failure");
  assert.match(hookBlock, /fails open/, "must say why a missing hook is dangerous");

  // The success line must be guarded, never unconditional.
  const successIdx = hookBlock.indexOf('info "Installed enforcement hooks');
  const guardIdx = hookBlock.indexOf("HOOKS_MISSING");
  assert.ok(guardIdx > -1 && guardIdx < successIdx, "success line must sit behind the existence check");
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
    // Single-quoted `$HOME` so the model's shell does NOT expand it: the literal reaches the
    // committed project settings and resolves per machine (host, devcontainer, collaborator).
    assert.match(line, /--hooks-dir '\$HOME\/\.claude\/set\/hooks'/, "hooks-dir must be the literal, single-quoted $HOME form");
    assert.doesNotMatch(line, /--hooks-dir ~\//, "a ~ path would be expanded by the shell into a host-only absolute path");
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
    const hooksDir = "$HOME/.claude/set/hooks"; // exactly what init.md / update.md pass
    const run = () =>
      JSON.parse(execFileSync(process.execPath, [CLI, "install", "--settings", ".claude/settings.json", "--hooks-dir", hooksDir], { cwd: dir, encoding: "utf8" }));

    run();
    const once = readSettings(join(dir, ".claude/settings.json"));
    const before = readSettings(FIXTURE);
    assert.deepEqual(once.hooks.SessionStart, before.hooks.SessionStart);
    assert.deepEqual(once.hooks.PreToolUse.slice(0, before.hooks.PreToolUse.length), before.hooks.PreToolUse);
    const cmds = once.hooks.PreToolUse.slice(before.hooks.PreToolUse.length).map((e) => e.hooks[0].command);
    assert.deepEqual(cmds.sort(), [`${hooksDir}/set-deny-push.sh`, `${hooksDir}/set-guard-agent-name.sh`].sort());

    // Portable: the literal `$HOME` prefix, never this machine's expanded home. Claude Code
    // runs hook commands through a shell, so it resolves wherever the repo is opened.
    for (const c of cmds) {
      assert.ok(c.startsWith("$HOME/.claude/set/hooks/"), c);
      assert.ok(!c.includes(process.env.HOME), `expanded home leaked into project settings: ${c}`);
    }

    const r = run();
    assert.deepEqual(r.installed, []);
    assert.deepEqual(readSettings(join(dir, ".claude/settings.json")), once);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI runs when invoked through a symlink or from a path with spaces (main guard)", () => {
  const dir = mkdtempSync(join(tmpdir(), "set proj "));
  try {
    mkdirSync(join(dir, ".claude"));
    const link = join(dir, "set-hooks-link.mjs");
    symlinkSync(CLI, link);
    const out = execFileSync(process.execPath, [link, "install", "--settings", join(dir, ".claude/settings.json"), "--hooks-dir", "$HOME/.claude/set/hooks"], { encoding: "utf8" });
    assert.equal(JSON.parse(out).installed.length, 2, `symlinked invocation was a silent no-op: ${JSON.stringify(out)}`);
    const copy = join(dir, "set hooks.mjs");
    copyFileSync(CLI, copy);
    const out2 = execFileSync(process.execPath, [copy, "uninstall", "--settings", join(dir, ".claude/settings.json"), "--hooks-dir", "$HOME/.claude/set/hooks"], { encoding: "utf8" });
    assert.equal(JSON.parse(out2).removed, 2, `spaced-path invocation was a silent no-op: ${JSON.stringify(out2)}`);
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
