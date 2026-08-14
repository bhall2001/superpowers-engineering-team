import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";

import { openStore } from "../bin/store.mjs";
import { initRun } from "../bin/run.mjs";
import { claimWorktree, probeHolders, releaseRun, WorktreeHeldError } from "../bin/claim.mjs";
import { recordVerdict, takeCheckpoint } from "../bin/checkpoint.mjs";
import { resolveSkipSet } from "../bin/skipset.mjs";
import { planResume, ResumeRefused } from "../bin/resume.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function storePath(repoDir) {
  return join(repoDir, "..", `${basename(repoDir)}-store.db`);
}

/** Stands in for the union of the plan's per-task `Files`. */
function allFiles(dir) {
  return git(dir, "status", "--porcelain=v1", "--untracked-files=all")
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3));
}

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "set-e2e-"));
  git(dir, "init", "-q", ".");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "T");
  writeFileSync(join(dir, "README.md"), "base\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "checkout", "-q", "-b", "feat/thing");
  return dir;
}

/** A run that completes 2 of 4 tasks, checkpoints, completes 1 more, then dies. */
function crashedRun(dir) {
  const db = openStore(storePath(dir));
  const runId = initRun(db, {
    projectPath: dir,
    worktreePath: dir,
    branch: "feat/thing",
    planPath: ".claude/plans/thing.md",
    entryPhase: "build",
  });

  writeFileSync(join(dir, "a.txt"), "a\n");
  recordVerdict(db, runId, "T-alpha", { passed: true });
  writeFileSync(join(dir, "b.txt"), "b\n");
  recordVerdict(db, runId, "T-beta", { passed: true });

  const cp = takeCheckpoint(db, runId, { phase: "build", reason: "phase-boundary", cwd: dir, files: allFiles(dir) });

  // Verified after the checkpoint — durable in the DB, absent from git.
  writeFileSync(join(dir, "c.txt"), "c\n");
  recordVerdict(db, runId, "T-gamma", { passed: true });
  // In flight when the process died.
  writeFileSync(join(dir, "d-partial.txt"), "half written\n");

  return { db, runId, checkpoint: cp };
}

test("resume skips checkpointed tasks and re-dispatches the rest", () => {
  const dir = tempRepo();
  try {
    const { db, runId } = crashedRun(dir);
    const all = ["T-alpha", "T-beta", "T-gamma", "T-delta"];

    const plan = planResume(db, runId, { cwd: dir, planTasks: all, force: true });

    assert.deepEqual([...plan.skip].sort(), ["T-alpha", "T-beta"]);
    assert.deepEqual(plan.redispatch.sort(), ["T-delta", "T-gamma"]);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a task passed after the last checkpoint is re-dispatched, not skipped", () => {
  const dir = tempRepo();
  try {
    const { db, runId } = crashedRun(dir);

    assert.equal(
      db.prepare("SELECT status FROM task WHERE task_id = 'T-gamma'").get().status,
      "passed",
      "the DB says passed",
    );
    const { skip } = resolveSkipSet(dir, runId);
    assert.ok(!skip.has("T-gamma"), "but git never captured it, so it is not durable");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resume refuses on a branch that does not match the run", () => {
  const dir = tempRepo();
  try {
    const { db, runId } = crashedRun(dir);
    git(dir, "checkout", "-q", "-b", "other/branch");

    assert.throws(
      () => planResume(db, runId, { cwd: dir, planTasks: ["T-alpha"], force: true }),
      (err) => {
        assert.ok(err instanceof ResumeRefused);
        assert.match(err.message, /branch/i);
        return true;
      },
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resume refuses in a repo that is not the run's worktree", () => {
  const dir = tempRepo();
  const other = tempRepo();
  try {
    const { db, runId } = crashedRun(dir);

    assert.throws(
      () => planResume(db, runId, { cwd: other, planTasks: ["T-alpha"], force: true }),
      (err) => {
        assert.ok(err instanceof ResumeRefused);
        assert.match(err.message, /worktree|repository/i);
        return true;
      },
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test("resume refuses while a live run holds the worktree, naming the holder", () => {
  const dir = tempRepo();
  try {
    const { db, runId } = crashedRun(dir);
    // The crashed run's row is still 'running' with THIS process's pid — i.e. alive.
    const holders = probeHolders(db, dir);
    assert.equal(holders.length, 1);
    assert.equal(holders[0].dead, false, "a live pid must not be treated as dead");

    assert.throws(
      () => claimWorktree(db, { worktreePath: dir, runId: "someone-else", deadRunIds: [] }),
      (err) => {
        assert.ok(err instanceof WorktreeHeldError);
        assert.match(err.message, new RegExp(runId));
        return true;
      },
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resume leaves the dirty tree untouched — it is the forensic record", () => {
  const dir = tempRepo();
  try {
    const { db, runId } = crashedRun(dir);
    const partial = join(dir, "d-partial.txt");
    const before = readFileSync(partial, "utf8");
    const dirtyBefore = git(dir, "status", "--porcelain");

    planResume(db, runId, { cwd: dir, planTasks: ["T-alpha", "T-delta"], force: true });

    assert.ok(existsSync(partial), "resume must not delete in-flight work");
    assert.equal(readFileSync(partial, "utf8"), before);
    assert.equal(git(dir, "status", "--porcelain"), dirtyBefore, "no reset, no stash, no discard");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resume reports the advisory diff since the last checkpoint, including untracked files", () => {
  const dir = tempRepo();
  try {
    const { db, runId } = crashedRun(dir);

    const plan = planResume(db, runId, { cwd: dir, planTasks: ["T-gamma"], force: true });

    assert.ok(plan.advisory.files.includes("c.txt"), "tracked-after-checkpoint work");
    assert.ok(
      plan.advisory.files.includes("d-partial.txt"),
      "untracked files must appear — git diff alone misses them",
    );
    assert.ok(plan.advisory.checkpointSha, "the briefing needs the checkpoint to diff against");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("slugs committed but absent from the plan are reported, not scheduled", () => {
  const dir = tempRepo();
  try {
    const { db, runId } = crashedRun(dir);

    // Re-planned: T-beta was dropped from the plan after it was committed.
    const plan = planResume(db, runId, {
      cwd: dir,
      planTasks: ["T-alpha", "T-gamma", "T-delta"],
      force: true,
    });

    assert.deepEqual(plan.unknown, ["T-beta"]);
    assert.ok(!plan.redispatch.includes("T-beta"), "a dropped task is not scheduled");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("nothing in the store encodes autonomy", () => {
  const dir = tempRepo();
  try {
    const { db, runId } = crashedRun(dir);

    const columns = db.prepare("SELECT * FROM run WHERE run_id = ?").get(runId);
    const serialized = JSON.stringify(columns).toLowerCase();
    assert.ok(!serialized.includes("autonomous"), "autonomy must never be persisted");

    const schema = db
      .prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL")
      .all()
      .map((r) => r.sql)
      .join(" ")
      .toLowerCase();
    assert.ok(!schema.includes("autonomous"), "no column may encode autonomy");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a completed run frees the worktree for the next one", () => {
  const dir = tempRepo();
  try {
    const { db, runId } = crashedRun(dir);
    releaseRun(db, runId);

    claimWorktree(db, {
      worktreePath: dir,
      runId: "next-run",
      deadRunIds: [],
      seed: { projectPath: dir, branch: "feat/thing", planPath: "p.md", entryPhase: "build" },
    });

    assert.equal(db.prepare("SELECT COUNT(*) c FROM run WHERE status = 'running'").get().c, 1);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
