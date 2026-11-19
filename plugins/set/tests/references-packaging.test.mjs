import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO = new URL("../../..", import.meta.url).pathname;
const REF_DIR = join(REPO, "plugins/set/references");
const installer = readFileSync(join(REPO, "install.sh"), "utf8");

// install.sh ships reference docs by name, from a single hand-maintained list. A file
// added to references/ but not to that list is silently absent on every installed
// machine — and a command that cites it then points at nothing. That is how
// tdd-loop.md was first added.
function installedReferences() {
  const m = installer.match(/^SET_REFERENCES="([^"]*)"/m);
  assert.ok(m, "SET_REFERENCES not found in install.sh");
  return m[1].trim().split(/\s+/).filter(Boolean);
}

function repoReferences() {
  return readdirSync(REF_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

test("every reference doc in the repo is shipped by install.sh", () => {
  const missing = repoReferences().filter((r) => !installedReferences().includes(r));
  assert.deepEqual(
    missing,
    [],
    `references/ files absent from SET_REFERENCES (they would never install): ${missing.join(", ")}`,
  );
});

test("every reference install.sh ships exists in the repo", () => {
  const absent = installedReferences().filter((r) => !existsSync(join(REF_DIR, `${r}.md`)));
  assert.deepEqual(
    absent,
    [],
    `SET_REFERENCES names files that do not exist: ${absent.join(", ")}`,
  );
});

// The TDD loop is written into a project's CLAUDE.md by /set-init and migrated onto by
// /set-update. references/tdd-loop.md is the single source of truth; init.md inlines a
// copy because it appends that text verbatim during a run. Two copies, so pin them equal.
test("the TDD loop in init.md is byte-identical to references/tdd-loop.md", () => {
  // The loop is the heading plus its numbered steps. In tdd-loop.md it is a standalone
  // fenced block; in init.md it sits inside the larger CLAUDE.md block, so stop at the
  // first line that is neither a step nor blank rather than at the next fence.
  const fence = (src, file) => {
    const lines = src.slice(src.indexOf("### Per-Task TDD Loop")).split("\n");
    assert.ok(lines[0].startsWith("### Per-Task TDD Loop"), `TDD loop heading not found in ${file}`);
    const out = [lines[0]];
    for (const line of lines.slice(1)) {
      if (!/^\d+\. /.test(line)) break;
      out.push(line);
    }
    assert.ok(out.length > 1, `TDD loop in ${file} has no numbered steps`);
    return out.join("\n");
  };

  const canonical = fence(readFileSync(join(REF_DIR, "tdd-loop.md"), "utf8"), "tdd-loop.md");
  const inInit = fence(
    readFileSync(join(REPO, "plugins/set/commands/init.md"), "utf8"),
    "init.md",
  );

  assert.equal(
    inInit,
    canonical,
    "init.md's TDD loop has drifted from references/tdd-loop.md — update init.md to match",
  );
});

test("update.md defers to the canonical loop instead of carrying its own copy", () => {
  const update = readFileSync(join(REPO, "plugins/set/commands/update.md"), "utf8");
  assert.match(update, /references\/tdd-loop\.md/, "update.md must cite the canonical loop");
  assert.doesNotMatch(
    update,
    /Write failing tests first \(TDD red phase\)/,
    "update.md re-inlined the loop; it should read references/tdd-loop.md instead",
  );
});

// The loop defers to the project's testing standard first, and the acceptance-test
// contract is cited from every file that depends on it. A command that drops the citation
// silently reverts to builder-authored tests.
test("the TDD loop reads project testing standards first and keeps the pinned step-1 phrase", () => {
  const loop = readFileSync(join(REF_DIR, "tdd-loop.md"), "utf8");
  assert.match(loop, /^0\. Read the testing standards this file names/m, "step 0 (project standards first) missing");
  assert.match(loop, /^1\. Write failing tests first \(TDD red phase\)/m);
});

test("plan, build and the builder prompt all cite the acceptance-test contract", () => {
  for (const f of ["commands/plan.md", "commands/build.md", "references/tdd-loop.md"]) {
    const src = readFileSync(join(REPO, "plugins/set", f), "utf8");
    assert.match(src, /acceptance-tests\.md/, `${f} must cite references/acceptance-tests.md`);
  }
  const builder = readFileSync(join(REF_DIR, "enhanced-builder-prompt.md"), "utf8");
  assert.match(builder, /NEVER (touch|edit)[^\n]*acceptance test/i, "builder prompt must forbid editing acceptance tests");
});

test("the per-task verdict schema is unchanged", () => {
  const build = readFileSync(join(REPO, "plugins/set/commands/build.md"), "utf8");
  const schema = "{ task: string, passed: boolean, tdd_followed: boolean, spec_compliant: boolean,\n  lint_pass: boolean, typecheck_pass: boolean, failing_criteria: string[], notes: string }";
  assert.ok(build.includes(schema), "verdict schema in build.md changed — the guard hook and Phase C key off it");
});
