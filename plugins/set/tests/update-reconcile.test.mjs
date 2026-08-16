import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = new URL("../../..", import.meta.url).pathname;
const UPDATE = readFileSync(join(REPO, "plugins/set/commands/update.md"), "utf8");

// The reconcile step is prose plus one bash block. The block is what actually runs, so
// test the block itself: extract it verbatim from update.md and execute it in a fixture.
function reconcileScript() {
  const section = UPDATE.slice(UPDATE.indexOf("#### 1c-bis"), UPDATE.indexOf("#### 1d"));
  const m = section.match(/```bash\n([\s\S]*?)```/);
  assert.ok(m, "1c-bis has no bash block");
  return m[1];
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "set-reconcile-"));
  mkdirSync(join(dir, ".claude/set"), { recursive: true });
  mkdirSync(join(dir, ".serena/memories"), { recursive: true });
  writeFileSync(join(dir, ".claude/set/config.json"), JSON.stringify({ serena_enabled: true, other: "keep", nested: { a: 1 } }, null, 2) + "\n");
  writeFileSync(join(dir, ".claude/set/.serena-migrated"), "2026-01-01\n");
  writeFileSync(join(dir, ".serena/memories/user-note.md"), "user authored; SET never wrote this\n");
  writeFileSync(join(dir, ".serena/project.yml"), "project_name: x\n");
  return dir;
}

const run = (dir) => execFileSync("bash", ["-euo", "pipefail", "-c", reconcileScript()], { cwd: dir, encoding: "utf8" });

test("reconcile removes serena_enabled and the sentinel, keeps every other key, never touches .serena/", () => {
  const dir = fixture();
  try {
    run(dir);
    const cfg = JSON.parse(readFileSync(join(dir, ".claude/set/config.json"), "utf8"));
    assert.deepEqual(cfg, { other: "keep", nested: { a: 1 } });
    assert.ok(!existsSync(join(dir, ".claude/set/.serena-migrated")));
    assert.equal(readFileSync(join(dir, ".serena/memories/user-note.md"), "utf8"), "user authored; SET never wrote this\n");
    assert.ok(existsSync(join(dir, ".serena/project.yml")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("first run reports what it removed; a second reconcile is a silent no-op that changes nothing", () => {
  const dir = fixture();
  try {
    const out1 = run(dir);
    assert.match(out1, /removed: serena_enabled/);
    assert.match(out1, /removed: \.serena-migrated/);
    const before = readFileSync(join(dir, ".claude/set/config.json"), "utf8");
    const out2 = run(dir);
    assert.equal(out2, "", "second run must print nothing");
    assert.equal(readFileSync(join(dir, ".claude/set/config.json"), "utf8"), before);
    assert.ok(!existsSync(join(dir, ".claude/set/config.json.tmp")), "no tmp file left behind");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a project with no config.json and no sentinel: exits 0 silently (no version detection needed)", () => {
  const dir = mkdtempSync(join(tmpdir(), "set-reconcile-"));
  try {
    assert.equal(run(dir), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("update.md's Step 2 prints the starting version and 4c substitutes it literally (no cross-call shell variable)", () => {
  assert.match(UPDATE, /echo "SET_VERSION_BEFORE=\$\(head -n1 ~\/\.claude\/commands\/\.set-version/);
  const step4c = UPDATE.slice(UPDATE.indexOf("### 4c."), UPDATE.indexOf("### 5."));
  assert.match(step4c, /\[ "\{before\}" = "\$SET_VERSION_AFTER" \]/);
  assert.doesNotMatch(step4c, /"\$SET_VERSION_BEFORE"/, "4c must not read a variable set in an earlier Bash call");
});
