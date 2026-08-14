import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { resolveSkipSet, checkpointCommits } from "../bin/skipset.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "set-skip-test-"));
  git(dir, "init", "-q", ".");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "T");
  writeFileSync(join(dir, "base.txt"), "base\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  return dir;
}

function checkpoint(dir, { run, seq, tasks, file }) {
  writeFileSync(join(dir, file), `${file}\n`);
  git(dir, "add", "-A");
  const message = [
    `checkpoint: build — ${tasks.length} tasks complete`,
    "",
    `SET-Run: ${run}`,
    `SET-Checkpoint: ${seq}`,
    `SET-Tasks: ${tasks.join(",")}`,
  ].join("\n");
  git(dir, "commit", "-q", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

test("collects slugs from this run's checkpoints only", () => {
  const dir = tempRepo();
  try {
    checkpoint(dir, { run: "runA", seq: 1, tasks: ["T-a", "T-b"], file: "a.txt" });
    checkpoint(dir, { run: "runB", seq: 1, tasks: ["T-other"], file: "b.txt" });
    checkpoint(dir, { run: "runA", seq: 2, tasks: ["T-c"], file: "c.txt" });

    const { skip } = resolveSkipSet(dir, "runA");
    assert.deepEqual([...skip].sort(), ["T-a", "T-b", "T-c"]);
    assert.ok(!skip.has("T-other"), "another run's slugs must not leak in");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prose quoting a trailer key does not resolve; only the trailer block counts", () => {
  const dir = tempRepo();
  try {
    checkpoint(dir, { run: "runA", seq: 1, tasks: ["T-real"], file: "a.txt" });

    writeFileSync(join(dir, "doc.txt"), "doc\n");
    git(dir, "add", "-A");
    git(
      dir,
      "commit",
      "-q",
      "-m",
      ["docs: explain the format", "", "The example previously showed", "SET-Tasks: T-fake", "which was wrong.", "", `SET-Run: runA`, "SET-Checkpoint: 2", "SET-Tasks: T-genuine"].join("\n"),
    );

    const { skip } = resolveSkipSet(dir, "runA");
    assert.ok(skip.has("T-real"));
    assert.ok(skip.has("T-genuine"));
    assert.ok(!skip.has("T-fake"), "body prose must never resolve as a trailer");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an amended checkpoint still resolves — amend must not brick the resume", () => {
  const dir = tempRepo();
  try {
    checkpoint(dir, { run: "runA", seq: 1, tasks: ["T-alpha"], file: "a.txt" });
    const before = checkpoint(dir, { run: "runA", seq: 2, tasks: ["T-beta"], file: "b.txt" });

    writeFileSync(join(dir, "b.txt"), "amended\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "--amend", "--no-edit");
    const after = git(dir, "rev-parse", "HEAD");
    assert.notEqual(before, after, "amend must change the sha for this test to mean anything");

    const { skip, rewritten } = resolveSkipSet(dir, "runA", { knownShas: [before] });
    assert.deepEqual([...skip].sort(), ["T-alpha", "T-beta"]);
    assert.ok(rewritten.includes(before), "the stale sha is reported as advisory");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a reverted checkpoint drops its slugs — commit existence is not work presence", () => {
  const dir = tempRepo();
  try {
    const cp1 = checkpoint(dir, { run: "runA", seq: 1, tasks: ["T-schema", "T-cli"], file: "a.txt" });
    checkpoint(dir, { run: "runA", seq: 2, tasks: ["T-resume"], file: "b.txt" });

    git(dir, "revert", "--no-edit", cp1);

    const { skip, reverted } = resolveSkipSet(dir, "runA");
    assert.ok(!skip.has("T-schema"), "reverted work must not be skipped");
    assert.ok(!skip.has("T-cli"), "reverted work must not be skipped");
    assert.ok(skip.has("T-resume"), "unaffected checkpoints still count");
    assert.ok(reverted.includes(cp1));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a checkpoint on an abandoned branch is not counted", () => {
  const dir = tempRepo();
  try {
    const main = git(dir, "branch", "--show-current");
    git(dir, "checkout", "-q", "-b", "abandoned");
    const orphan = checkpoint(dir, { run: "runA", seq: 1, tasks: ["T-orphan"], file: "o.txt" });
    git(dir, "checkout", "-q", main);
    checkpoint(dir, { run: "runA", seq: 2, tasks: ["T-kept"], file: "k.txt" });

    // cat-file -e accepts the orphan; ancestry must reject it.
    execFileSync("git", ["cat-file", "-e", `${orphan}^{commit}`], { cwd: dir });

    const { skip } = resolveSkipSet(dir, "runA");
    assert.ok(skip.has("T-kept"));
    assert.ok(!skip.has("T-orphan"), "a sha off the current branch must not count");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The `separator=` argument is an EQUIVALENT mutation, not an untested gap:
// it only applies when a key repeats within one commit, and SET-Tasks appears
// once. Verified — corrupting it leaves the output byte-identical.
test("trailer values are trimmed", () => {
  const dir = tempRepo();
  try {
    checkpoint(dir, { run: "runA", seq: 1, tasks: ["T-a", "T-b"], file: "a.txt" });
    const commits = checkpointCommits(dir, "runA");
    assert.equal(commits.length, 1);
    // Compare against literals. Asserting `slug === slug.trim()` is a tautology
    // that holds whether or not the code trims.
    assert.deepEqual(commits[0].tasks, ["T-a", "T-b"]);
    assert.equal(commits[0].run, "runA");
    assert.equal(commits[0].sequence, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("slugs survive whitespace around the trailer's commas", () => {
  const dir = tempRepo();
  try {
    // A hand-edited or line-wrapped trailer puts spaces after the commas.
    // Untrimmed, the slugs carry them, never match the plan's, and completed
    // work is silently re-dispatched.
    writeFileSync(join(dir, "a.txt"), "a\n");
    git(dir, "add", "-A");
    git(
      dir,
      "commit",
      "-q",
      "-m",
      ["cp", "", "SET-Run: runA", "SET-Checkpoint: 1", "SET-Tasks: T-a, T-b , T-c"].join("\n"),
    );

    const { skip } = resolveSkipSet(dir, "runA");
    assert.deepEqual([...skip].sort(), ["T-a", "T-b", "T-c"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a revert identified by an abbreviated sha still drops its slugs", () => {
  const dir = tempRepo();
  try {
    const cp = checkpoint(dir, { run: "runA", seq: 1, tasks: ["T-x"], file: "x.txt" });
    const short = cp.slice(0, 8);

    // `git revert` writes a full sha, but a hand-written or squashed revert
    // message may abbreviate it. The scan must still match.
    writeFileSync(join(dir, "undo.txt"), "undo\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", `Revert the schema work\n\nThis reverts commit ${short}.`);

    const { skip, reverted } = resolveSkipSet(dir, "runA");
    assert.ok(!skip.has("T-x"), "an abbreviated revert must still drop the slug");
    assert.ok(reverted.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty repo with no checkpoints yields an empty skip set", () => {
  const dir = tempRepo();
  try {
    const { skip } = resolveSkipSet(dir, "runA");
    assert.equal(skip.size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
