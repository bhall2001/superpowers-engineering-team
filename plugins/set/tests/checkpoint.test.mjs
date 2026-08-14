import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";

import { openStore } from "../bin/store.mjs";
import { initRun } from "../bin/run.mjs";
import { recordVerdict, takeCheckpoint, declineCheckpoint, pendingCapture } from "../bin/checkpoint.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

// The store lives OUTSIDE the worktree, as it does in production
// (~/.claude/set-runs/). A store inside the repo would dirty the tree.
function storePath(repoDir) {
  return join(repoDir, "..", `${basename(repoDir)}-store.db`);
}

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "set-cp-test-"));
  git(dir, "init", "-q", ".");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "T");
  git(dir, "commit", "-q", "--allow-empty", "-m", "base");
  return dir;
}

function seed(db, dir) {
  return initRun(db, {
    projectPath: dir,
    worktreePath: dir,
    branch: git(dir, "branch", "--show-current"),
    planPath: ".claude/plans/x.md",
    entryPhase: "build",
  });
}

test("pendingCapture returns passed tasks not yet captured, ignoring failed ones", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);

    recordVerdict(db, runId, "T-a", { passed: true });
    recordVerdict(db, runId, "T-b", { passed: true });
    recordVerdict(db, runId, "T-c", { passed: false, failing_criteria: ["lint"] });

    assert.deepEqual(pendingCapture(db, runId), ["T-a", "T-b"]);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a verdict landing in the same instant as a checkpoint appears in exactly one trailer", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);

    // Force identical timestamps — the case a `updated_at >` comparison loses.
    const ts = "2026-08-14T08:25:00.000Z";
    recordVerdict(db, runId, "T-x", { passed: true }, { at: ts });
    mkdirSync(join(dir, "src"), { recursive: true });
    execFileSync("sh", ["-c", `echo work > ${JSON.stringify(join(dir, "src/a.txt"))}`]);

    const first = takeCheckpoint(db, runId, {
      phase: "build",
      reason: "judgment",
      cwd: dir,
      at: ts,
    });
    assert.deepEqual(first.tasks, ["T-x"], "must be captured by the first checkpoint");

    recordVerdict(db, runId, "T-y", { passed: true }, { at: ts });
    execFileSync("sh", ["-c", `echo more > ${JSON.stringify(join(dir, "src/b.txt"))}`]);
    const second = takeCheckpoint(db, runId, {
      phase: "build",
      reason: "judgment",
      cwd: dir,
      at: ts,
    });
    assert.deepEqual(second.tasks, ["T-y"], "must not re-capture T-x nor drop T-y");

    // Each task is pinned to the checkpoint that first captured it. Without
    // this, a later checkpoint silently re-stamps earlier tasks with its own
    // sequence and the checkpoint log stops matching the commits.
    const captured = Object.fromEntries(
      db
        .prepare("SELECT task_id, captured_seq FROM task WHERE run_id = ?")
        .all(runId)
        .map((row) => [row.task_id, row.captured_seq]),
    );
    assert.deepEqual(captured, { "T-x": 1, "T-y": 2 });
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkpoint writes the commit before the row, and the trailer carries run and tasks", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);
    recordVerdict(db, runId, "T-a", { passed: true });
    execFileSync("sh", ["-c", `echo x > ${JSON.stringify(join(dir, "f.txt"))}`]);

    const cp = takeCheckpoint(db, runId, { phase: "build", reason: "phase-boundary", cwd: dir });

    const body = git(dir, "log", "-1", "--format=%B");
    assert.match(body, new RegExp(`SET-Run: ${runId}`));
    assert.match(body, /SET-Checkpoint: 1/);
    assert.match(body, /SET-Tasks: T-a/);

    const row = db.prepare("SELECT * FROM checkpoint WHERE run_id = ? AND sequence = 1").get(runId);
    assert.equal(row.taken, 1);
    assert.equal(row.sha, cp.sha);
    assert.equal(
      db.prepare("SELECT captured_seq FROM task WHERE task_id = 'T-a'").get().captured_seq,
      1,
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a checkpoint with nothing to commit is not taken", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);
    recordVerdict(db, runId, "T-a", { passed: true });

    const cp = takeCheckpoint(db, runId, { phase: "build", reason: "judgment", cwd: dir });
    assert.equal(cp.taken, false, "an empty tree must not produce a commit");
    assert.equal(
      db.prepare("SELECT captured_seq FROM task WHERE task_id = 'T-a'").get().captured_seq,
      null,
      "nothing was committed, so nothing may be marked captured",
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a run store sitting inside the worktree is never committed", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);
    recordVerdict(db, runId, "T-a", { passed: true });

    // A stray store inside the repo must not become the checkpoint's content.
    openStore(join(dir, "runs.db")).close();
    execFileSync("sh", ["-c", `echo real > ${JSON.stringify(join(dir, "real.txt"))}`]);

    const cp = takeCheckpoint(db, runId, { phase: "build", reason: "judgment", cwd: dir });
    assert.equal(cp.taken, true);

    const files = git(dir, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean);
    assert.ok(files.includes("real.txt"));
    assert.ok(!files.some((f) => f.includes("runs.db")), `store was committed: ${files}`);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("declined checkpoints record a rationale and no sha", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);

    declineCheckpoint(db, runId, { phase: "build", rationale: "small phase, 2 trivial tasks" });

    const row = db.prepare("SELECT * FROM checkpoint WHERE run_id = ?").get(runId);
    assert.equal(row.taken, 0);
    assert.equal(row.sha, null);
    assert.match(row.rationale, /small phase/);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sequence numbers advance across taken and declined checkpoints", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);

    declineCheckpoint(db, runId, { phase: "build", rationale: "too early" });
    recordVerdict(db, runId, "T-a", { passed: true });
    execFileSync("sh", ["-c", `echo x > ${JSON.stringify(join(dir, "f.txt"))}`]);
    const cp = takeCheckpoint(db, runId, { phase: "build", reason: "judgment", cwd: dir });

    assert.equal(cp.sequence, 2, "a declined checkpoint still consumes a sequence number");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
