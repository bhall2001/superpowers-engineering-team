import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { openStore } from "../bin/store.mjs";
import { initRun } from "../bin/run.mjs";
import { claimWorktree, releaseRun, probeDead, WorktreeHeldError } from "../bin/claim.mjs";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "set-claim-test-"));
}

function seedRun(db, dir, name, overrides = {}) {
  const worktree = join(dir, name);
  mkdirSync(worktree, { recursive: true });
  return {
    runId: initRun(db, {
      projectPath: worktree,
      worktreePath: worktree,
      branch: "feat/x",
      planPath: ".claude/plans/x.md",
      entryPhase: "build",
      ...overrides,
    }),
    worktree,
  };
}

test("probeDead reports a live pid as alive and a dead one as dead", () => {
  assert.equal(probeDead(process.pid), false);
  // 2^22 is above the default pid_max on macOS and Linux.
  assert.equal(probeDead(4194304), true);
});

test("a live process owned by another user is not reported dead", () => {
  // process.kill throws EPERM, not ESRCH, for a process we may not signal.
  // Treating any throw as "dead" would let a resume steal a live worktree.
  assert.equal(probeDead(1), false);
});

test("a pid on another host is never assumed dead", () => {
  // We cannot probe another machine's process table; assuming dead would let
  // two machines claim one worktree.
  assert.equal(probeDead(process.pid, "some-other-host"), false);
  assert.equal(probeDead(4194304, "some-other-host"), false);
});

test("claiming a worktree held by a live run refuses and names the holder", () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    const { runId, worktree } = seedRun(db, dir, "wt");

    assert.throws(
      () => claimWorktree(db, { worktreePath: worktree, runId: "new-run", deadRunIds: [] }),
      (err) => {
        assert.ok(err instanceof WorktreeHeldError, `wrong error type: ${err.name}`);
        assert.match(err.message, new RegExp(runId), "must name the holding run");
        assert.match(err.message, /set-run\.mjs release/, "must offer the recovery command");
        return true;
      },
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claiming a worktree held by a dead run reclaims it exactly once", () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    const { runId: dead, worktree } = seedRun(db, dir, "wt");

    const observed = db.prepare("SELECT updated_at FROM run WHERE run_id = ?").get(dead).updated_at;
    claimWorktree(db, {
      worktreePath: worktree,
      runId: "fresh-run",
      deadRunIds: [{ runId: dead, updatedAt: observed }],
      seed: { projectPath: worktree, branch: "feat/x", planPath: "p.md", entryPhase: "build" },
    });

    assert.equal(db.prepare("SELECT status FROM run WHERE run_id = ?").get(dead).status, "crashed");
    assert.equal(
      db.prepare("SELECT COUNT(*) c FROM run WHERE status = 'running'").get().c,
      1,
      "exactly one running row must survive",
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("compare-and-swap aborts when the holder revived between probe and commit", () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    const { runId: holder, worktree } = seedRun(db, dir, "wt");

    // Probe observed an older timestamp; the holder has since heartbeat.
    const stale = "2000-01-01T00:00:00.000Z";
    db.prepare("UPDATE run SET updated_at = ? WHERE run_id = ?").run(new Date().toISOString(), holder);

    assert.throws(
      () =>
        claimWorktree(db, {
          worktreePath: worktree,
          runId: "fresh-run",
          deadRunIds: [{ runId: holder, updatedAt: stale }],
        }),
      WorktreeHeldError,
      "a revived holder must not be clobbered",
    );
    assert.equal(db.prepare("SELECT status FROM run WHERE run_id = ?").get(holder).status, "running");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("two racing processes leave exactly one running row", () => {
  const dir = tempDir();
  try {
    const dbPath = join(dir, "runs.db");
    const worktree = join(dir, "wt");
    mkdirSync(worktree, { recursive: true });
    openStore(dbPath).close();

    const script = join(dir, "race.mjs");
    const binDir = new URL("../bin/", import.meta.url).pathname;
    writeFileSync(
      script,
      `import { openStore } from ${JSON.stringify(join(binDir, "store.mjs"))};
       import { claimWorktree } from ${JSON.stringify(join(binDir, "claim.mjs"))};
       const db = openStore(process.argv[2]);
       try {
         claimWorktree(db, {
           worktreePath: process.argv[3],
           runId: process.argv[4],
           deadRunIds: [],
           seed: { projectPath: process.argv[3], branch: "b", planPath: "p.md", entryPhase: "build" },
         });
         console.log("claimed");
       } catch { console.log("refused"); }`,
    );

    const results = ["r1", "r2"].map((id) => {
      try {
        return execFileSync(process.execPath, [script, dbPath, worktree, id], {
          encoding: "utf8",
        }).trim();
      } catch {
        return "refused";
      }
    });

    assert.equal(results.filter((r) => r === "claimed").length, 1, `results: ${results}`);

    const db = openStore(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) c FROM run WHERE status = 'running'").get().c, 1);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A claim contending with another writer must fail and leave nothing behind.
//
// Note on `BEGIN IMMEDIATE` vs `BEGIN`: swapping them is an EQUIVALENT mutation
// here, not an untested gap. Both raise "database is locked" — IMMEDIATE at
// transaction start, deferred at the first write — and claimWorktree writes
// immediately inside its transaction, so nothing observable differs. IMMEDIATE
// is kept because it fails at the cheapest point and states the intent; a test
// asserting the difference would be asserting SQLite's internals, not ours.
test("a claim contending with another writer fails without leaving a row", () => {
  const dir = tempDir();
  try {
    const dbPath = join(dir, "runs.db");
    const worktree = join(dir, "wt");
    mkdirSync(worktree, { recursive: true });
    openStore(dbPath).close();

    const holder = openStore(dbPath);
    const claimer = openStore(dbPath);
    claimer.exec("PRAGMA busy_timeout = 150"); // fail fast; the wait is not the assertion

    holder.exec("BEGIN IMMEDIATE");
    holder
      .prepare(
        `INSERT INTO run (run_id, project_slug, project_path, worktree_path, branch,
                          plan_path, entry_phase, current_phase, status, hostname,
                          started_at, updated_at)
         VALUES ('lock-holder','s','/p','/elsewhere','b','pl','build','build','complete','h','t','t')`,
      )
      .run();

    try {
      assert.throws(
        () =>
          claimWorktree(claimer, {
            worktreePath: worktree,
            runId: "contender",
            deadRunIds: [],
            seed: { projectPath: worktree, branch: "b", planPath: "p.md", entryPhase: "build" },
          }),
        /locked|busy/i,
      );
    } finally {
      holder.exec("ROLLBACK");
      holder.close();
      claimer.close();
    }

    const db = openStore(dbPath);
    assert.equal(
      db.prepare("SELECT COUNT(*) c FROM run WHERE status = 'running'").get().c,
      0,
      "a contended claim must leave no row behind",
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("release frees the slot for a later run", () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    const { runId, worktree } = seedRun(db, dir, "wt");

    releaseRun(db, runId);
    assert.equal(db.prepare("SELECT status FROM run WHERE run_id = ?").get(runId).status, "complete");

    claimWorktree(db, {
      worktreePath: worktree,
      runId: "next-run",
      deadRunIds: [],
      seed: { projectPath: worktree, branch: "b", planPath: "p.md", entryPhase: "build" },
    });
    assert.equal(db.prepare("SELECT COUNT(*) c FROM run WHERE status = 'running'").get().c, 1);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
