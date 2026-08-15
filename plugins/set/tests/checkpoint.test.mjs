import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";

import { openStore } from "../bin/store.mjs";
import { initRun } from "../bin/run.mjs";
import {
  recordVerdict,
  takeCheckpoint,
  declineCheckpoint,
  pendingCapture,
  foreignStagedPaths,
} from "../bin/checkpoint.mjs";

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

/**
 * Everything the worktree currently shows as changed. Stands in for the union
 * of the plan's per-task `Files` — real callers pass that, not this.
 */
function allFiles(dir) {
  return git(dir, "status", "--porcelain=v1", "--untracked-files=all")
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3));
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
      files: allFiles(dir),
      at: ts,
    });
    assert.deepEqual(first.tasks, ["T-x"], "must be captured by the first checkpoint");

    recordVerdict(db, runId, "T-y", { passed: true }, { at: ts });
    execFileSync("sh", ["-c", `echo more > ${JSON.stringify(join(dir, "src/b.txt"))}`]);
    const second = takeCheckpoint(db, runId, {
      phase: "build",
      reason: "judgment",
      cwd: dir,
      files: allFiles(dir),
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

    const cp = takeCheckpoint(db, runId, { phase: "build", reason: "phase-boundary", cwd: dir, files: allFiles(dir) });

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

    const cp = takeCheckpoint(db, runId, { phase: "build", reason: "judgment", cwd: dir, files: allFiles(dir) });
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

    const cp = takeCheckpoint(db, runId, { phase: "build", reason: "judgment", cwd: dir, files: allFiles(dir) });
    assert.equal(cp.taken, true);

    const files = git(dir, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean);
    assert.ok(files.includes("real.txt"));
    assert.ok(!files.some((f) => f.includes("runs.db")), `store was committed: ${files}`);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a checkpoint never sweeps unrelated files out of the user's worktree", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);
    recordVerdict(db, runId, "T-a", { passed: true });

    // Files a human left lying around, none of them ignored.
    execFileSync("sh", [
      "-c",
      `cd ${JSON.stringify(dir)} && echo 'SECRET=x' > .env.local && echo notes > scratch.txt &&
       mkdir -p .worktrees/other && echo wt > .worktrees/other/stuff.txt &&
       mkdir -p nested && cp ${JSON.stringify(storePath(dir))} nested/runs.db &&
       echo wal > nested/runs.db-wal && echo work > real.txt`,
    ]);

    // The plan says this task owns real.txt. Everything else in the worktree is
    // the human's, and a checkpoint must leave it alone.
    const cp = takeCheckpoint(db, runId, {
      phase: "build",
      reason: "judgment",
      cwd: dir,
      files: ["real.txt"],
    });
    assert.equal(cp.taken, true);

    const files = git(dir, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean);
    assert.deepEqual(files, ["real.txt"], "only the run's own files may be committed");

    // scratch.txt is reported as left-behind; .env.local is excluded outright by
    // NEVER_COMMIT, so it never even reaches the scan.
    assert.ok(cp.foreign.includes("scratch.txt"), "must report what it left behind");
    assert.ok(!cp.foreign.includes(".env.local"), "credentials are excluded, not merely unowned");
    // The store and other worktrees are excluded outright, never even reported.
    assert.ok(!cp.foreign.some((f) => f.includes("runs.db")));
    assert.ok(!cp.foreign.some((f) => f.startsWith(".worktrees/")));

    const stillDirty = git(dir, "status", "--porcelain");
    assert.match(stillDirty, /\.env\.local/, "the human's file stays uncommitted");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a checkpoint refuses rather than destroying a human's partial staging", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);
    recordVerdict(db, runId, "T-a", { passed: true });

    // A human mid `git add -p`: hunk A staged, hunk B deliberately not.
    execFileSync("sh", [
      "-c",
      `cd ${JSON.stringify(dir)} && printf 'l1\\n' > wip.txt && git add wip.txt &&
       git commit -q -m wip-base && printf 'l1\\nHUNK-A\\n' > wip.txt && git add wip.txt &&
       printf 'l1\\nHUNK-A\\nHUNK-B\\n' > wip.txt`,
    ]);

    const cp = takeCheckpoint(db, runId, { phase: "build", reason: "judgment", cwd: dir, files: allFiles(dir) });
    assert.equal(cp.taken, false);
    assert.equal(cp.reason, "partial-staging");
    assert.ok(cp.paths.includes("wip.txt"));

    // Their index is intact: HUNK-B is still unstaged.
    const staged = git(dir, "diff", "--cached", "--name-only");
    assert.equal(staged, "wip.txt");
    assert.ok(!git(dir, "diff", "--cached").includes("HUNK-B"), "unstaged hunk must not be staged");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("gitignored files stay out of a checkpoint", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);
    recordVerdict(db, runId, "T-a", { passed: true });

    execFileSync("sh", [
      "-c",
      `cd ${JSON.stringify(dir)} && echo 'node_modules/' > .gitignore &&
       mkdir -p node_modules && echo junk > node_modules/x.js && echo work > real.txt`,
    ]);

    takeCheckpoint(db, runId, { phase: "build", reason: "judgment", cwd: dir, files: allFiles(dir) });
    const files = git(dir, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean);
    assert.ok(files.includes("real.txt"));
    assert.ok(!files.some((f) => f.startsWith("node_modules/")), `ignored file committed: ${files}`);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a renamed file does not corrupt the path scan or block checkpointing", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);

    execFileSync("sh", [
      "-c",
      `cd ${JSON.stringify(dir)} && mkdir -p src && echo old > src/old.ts &&
       git add -A && git commit -q -m seed && git mv src/old.ts src/new.ts`,
    ]);
    recordVerdict(db, runId, "T-a", { passed: true });

    // `-z` emits a rename as `R  <new>` followed by a BARE <old>. Slicing 3 off
    // that second record mangled it into "/old.ts", which then read as partial
    // staging and refused every checkpoint for the rest of the run.
    assert.deepEqual(foreignStagedPaths(dir), [], "a clean rename is not partial staging");

    const cp = takeCheckpoint(db, runId, {
      phase: "build",
      reason: "judgment",
      cwd: dir,
      files: ["src/"],
    });
    assert.equal(cp.taken, true, "a rename must not block the checkpoint");

    const files = git(dir, "show", "--name-status", "--format=", "HEAD");
    assert.match(files, /src\/new\.ts/);
    assert.ok(!cp.foreign.some((f) => f.startsWith("/")), `mangled path in foreign: ${cp.foreign}`);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a directory scope never sweeps in untracked credentials", () => {
  const dir = tempRepo();
  try {
    const db = openStore(storePath(dir));
    const runId = seed(db, dir);
    recordVerdict(db, runId, "T-a", { passed: true });

    execFileSync("sh", [
      "-c",
      `cd ${JSON.stringify(dir)} && mkdir -p src/config && echo 'AWS_SECRET=x' > src/.env &&
       echo key > src/config/id_rsa && echo pem > src/config/server.pem && echo work > src/real.ts`,
    ]);

    // "src/" is a natural way for a model to write a plan's Files field.
    const cp = takeCheckpoint(db, runId, {
      phase: "build",
      reason: "judgment",
      cwd: dir,
      files: ["src/"],
    });

    const files = git(dir, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean);
    assert.ok(files.includes("src/real.ts"));
    for (const secret of ["src/.env", "src/config/id_rsa", "src/config/server.pem"]) {
      assert.ok(!files.includes(secret), `credential committed: ${secret}`);
    }
    assert.equal(cp.taken, true);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a checkpoint captures only its own run's tasks", () => {
  const dirA = tempRepo();
  const dirB = tempRepo();
  try {
    // One machine-level store shared by every project — a checkpoint in run A
    // must not stamp captured_seq on run B's pending tasks, or B's trailer
    // silently omits them and its work is redone on resume.
    const store = storePath(dirA);
    const db = openStore(store);
    const runA = seed(db, dirA);
    const runB = seed(db, dirB);

    recordVerdict(db, runA, "T-a", { passed: true });
    recordVerdict(db, runB, "T-b", { passed: true });

    execFileSync("sh", ["-c", `echo work > ${JSON.stringify(join(dirA, "a.txt"))}`]);
    takeCheckpoint(db, runA, {
      phase: "build",
      reason: "judgment",
      cwd: dirA,
      files: ["a.txt"],
    });

    assert.deepEqual(pendingCapture(db, runB), ["T-b"], "run B's task must stay uncaptured");
    assert.equal(
      db.prepare("SELECT captured_seq FROM task WHERE run_id = ? AND task_id = 'T-b'").get(runB)
        .captured_seq,
      null,
    );
    db.close();
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
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
    const cp = takeCheckpoint(db, runId, { phase: "build", reason: "judgment", cwd: dir, files: allFiles(dir) });

    assert.equal(cp.sequence, 2, "a declined checkpoint still consumes a sequence number");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
