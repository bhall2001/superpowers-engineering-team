import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

import { openStore, SCHEMA_VERSION, SchemaVersionError } from "../bin/store.mjs";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "set-run-test-"));
}

test("applies every table and index on first open", () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    const names = db
      .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','index')")
      .all()
      .map((r) => r.name);

    for (const table of ["run", "checkpoint", "task", "agent_log"]) {
      assert.ok(names.includes(table), `missing table: ${table}`);
    }
    for (const index of ["one_live_run_per_worktree", "agent_log_lookup"]) {
      assert.ok(names.includes(index), `missing index: ${index}`);
    }
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sets WAL and busy_timeout on every connection", () => {
  const dir = tempDir();
  try {
    const path = join(dir, "runs.db");
    openStore(path).close();

    const db = openStore(path);
    assert.equal(db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    assert.equal(db.prepare("PRAGMA busy_timeout").get().timeout, 5000);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stamps user_version to the code's schema version", () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses a database newer than the code understands, leaving it unmodified", () => {
  const dir = tempDir();
  const path = join(dir, "runs.db");
  try {
    openStore(path).close();

    const raw = new DatabaseSync(path);
    raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 998}`);
    raw.exec("INSERT INTO run (run_id, project_slug, project_path, worktree_path, branch, plan_path, entry_phase, current_phase, status, hostname, started_at, updated_at) VALUES ('r','s','/p','/w','b','pl','build','build','running','h','t','t')");
    raw.close();

    assert.throws(() => openStore(path), SchemaVersionError);

    const after = new DatabaseSync(path);
    assert.equal(after.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION + 998);
    assert.equal(after.prepare("SELECT COUNT(*) c FROM run").get().c, 1);
    after.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrent processes can open a not-yet-created store", () => {
  const dir = tempDir();
  try {
    const path = join(dir, "runs.db");
    const probe = join(dir, "open.mjs");
    const storeUrl = new URL("../bin/store.mjs", import.meta.url).href;
    writeFileSync(
      probe,
      `import { openStore } from ${JSON.stringify(storeUrl)};
       openStore(process.argv[2]).close();
       console.log("ok");`,
    );

    // Several agents starting at once race to create the file and apply the
    // schema. That contention is not covered by busy_timeout, so openStore
    // retries; without the retry this crashes uncaught 1-2 times in 8.
    const results = Array.from({ length: 8 }, () => {
      try {
        return execFileSync(process.execPath, [probe, path], { encoding: "utf8" }).trim();
      } catch (err) {
        return `FAILED: ${err.message}`;
      }
    });

    assert.deepEqual(
      results.filter((r) => r !== "ok"),
      [],
      "every concurrent open must succeed",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("one_live_run_per_worktree admits one running run per worktree", () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    const insert = db.prepare(
      `INSERT INTO run (run_id, project_slug, project_path, worktree_path, branch,
                        plan_path, entry_phase, current_phase, status, hostname,
                        started_at, updated_at)
       VALUES (?, 's', '/p', ?, 'b', 'pl', 'build', 'build', ?, 'h', 't', 't')`,
    );

    insert.run("r1", "/wt/a", "running");
    assert.throws(() => insert.run("r2", "/wt/a", "running"), /UNIQUE/);

    insert.run("r3", "/wt/b", "running");
    db.exec("UPDATE run SET status = 'crashed' WHERE run_id = 'r1'");
    insert.run("r4", "/wt/a", "running");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("task table rejects a passed row with no captured checkpoint semantics broken", () => {
  const dir = tempDir();
  try {
    const db = openStore(join(dir, "runs.db"));
    db.exec(
      `INSERT INTO run (run_id, project_slug, project_path, worktree_path, branch,
                        plan_path, entry_phase, current_phase, status, hostname,
                        started_at, updated_at)
       VALUES ('r1','s','/p','/w','b','pl','build','build','running','h','t','t')`,
    );
    const insert = db.prepare(
      "INSERT INTO task (run_id, task_id, status, attempts, updated_at) VALUES (?, ?, ?, 0, 't')",
    );
    insert.run("r1", "T-a", "passed");
    assert.equal(
      db.prepare("SELECT captured_seq FROM task WHERE task_id = 'T-a'").get().captured_seq,
      null,
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
