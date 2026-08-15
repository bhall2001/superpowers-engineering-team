import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openStore } from "../bin/store.mjs";
import { initRun, heartbeat, listRuns, newRunId, canonicalPath } from "../bin/run.mjs";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "set-run-test-"));
}

function fixture(dir, overrides = {}) {
  const worktree = join(dir, "wt");
  mkdirSync(worktree, { recursive: true });
  return {
    projectPath: worktree,
    worktreePath: worktree,
    branch: "feat/x",
    planPath: ".claude/plans/x.md",
    entryPhase: "build",
    ...overrides,
  };
}

test("init writes a running row and returns the run id", () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    const runId = initRun(db, fixture(dir));

    const row = db.prepare("SELECT * FROM run WHERE run_id = ?").get(runId);
    assert.equal(row.status, "running");
    assert.equal(row.branch, "feat/x");
    assert.equal(row.current_phase, "build");
    assert.ok(row.session_pid > 0);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run ids are unique within the same second", () => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) ids.add(newRunId("durable-runs"));
  assert.equal(ids.size, 50, "run ids collided within one second");
});

test("run id carries hostname and a random suffix", () => {
  const id = newRunId("durable-runs");
  // <date>-<time>-<slug>-<host>-<rand4>
  assert.match(id, /^\d{8}-\d{6}-durable-runs-[a-z0-9-]+-[a-f0-9]{4}$/);
});

test("worktree path is canonicalized before storage", () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    const worktree = join(dir, "wt");
    mkdirSync(worktree, { recursive: true });

    const spellings = [worktree, `${worktree}/`, join(worktree, ".")];
    const stored = spellings.map((p) => canonicalPath(p));

    assert.equal(new Set(stored).size, 1, `spellings did not collapse: ${stored}`);

    initRun(db, fixture(dir, { worktreePath: spellings[0] }));
    // A second run using a different spelling must collide on the partial index.
    assert.throws(
      () => initRun(db, fixture(dir, { worktreePath: spellings[1] })),
      /UNIQUE|already/i,
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("heartbeat advances updated_at", async () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    const runId = initRun(db, fixture(dir));
    const before = db.prepare("SELECT updated_at FROM run WHERE run_id = ?").get(runId).updated_at;

    await new Promise((r) => setTimeout(r, 1100));
    heartbeat(db, runId);

    const after = db.prepare("SELECT updated_at FROM run WHERE run_id = ?").get(runId).updated_at;
    assert.ok(after > before, `expected ${after} > ${before}`);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("list returns runs newest first with status and worktree", () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    const a = join(dir, "wt-a");
    const b = join(dir, "wt-b");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });

    initRun(db, fixture(dir, { worktreePath: a }));
    const second = initRun(db, fixture(dir, { worktreePath: b }));

    const rows = listRuns(db);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].run_id, second);
    assert.ok("status" in rows[0] && "worktree_path" in rows[0]);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
