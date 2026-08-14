import { execFileSync } from "node:child_process";
import { nowIso } from "./run.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function recordVerdict(db, runId, taskId, verdict, { at = nowIso(), note = null } = {}) {
  const status = verdict?.passed ? "passed" : "failed";
  db.prepare(
    `INSERT INTO task (run_id, task_id, status, verdict_json, attempts, note, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT (run_id, task_id) DO UPDATE SET
       status = excluded.status,
       verdict_json = excluded.verdict_json,
       attempts = task.attempts + 1,
       note = excluded.note,
       updated_at = excluded.updated_at`,
  ).run(runId, taskId, status, JSON.stringify(verdict ?? {}), note, at);
}

export function markRunning(db, runId, taskId, { at = nowIso() } = {}) {
  db.prepare(
    `INSERT INTO task (run_id, task_id, status, attempts, updated_at)
     VALUES (?, ?, 'running', 0, ?)
     ON CONFLICT (run_id, task_id) DO UPDATE SET status = 'running', updated_at = excluded.updated_at`,
  ).run(runId, taskId, at);
}

/**
 * Passed tasks no earlier checkpoint captured.
 *
 * Membership is explicit marking, never `updated_at > last_checkpoint`: a verdict
 * landing in the same instant as a checkpoint is lost by a strict `>` (absent from
 * that trailer, not strictly greater for the next) and double-counted by `>=`.
 */
export function pendingCapture(db, runId) {
  return db
    .prepare(
      `SELECT task_id FROM task
        WHERE run_id = ? AND status = 'passed' AND captured_seq IS NULL
        ORDER BY task_id`,
    )
    .all(runId)
    .map((row) => row.task_id);
}

function nextSequence(db, runId) {
  const row = db
    .prepare("SELECT COALESCE(MAX(sequence), 0) AS seq FROM checkpoint WHERE run_id = ?")
    .get(runId);
  return row.seq + 1;
}

// The run store lives outside the repo (~/.claude/set-runs/), but a stray copy
// inside a worktree must never be swept into a checkpoint by `git add -A`.
const NEVER_COMMIT = [":!runs.db", ":!*/runs.db", ":!runs.db-wal", ":!runs.db-shm"];

function hasStagedChanges(cwd) {
  return git(cwd, ["status", "--porcelain", "--", ".", ...NEVER_COMMIT]).length > 0;
}

/**
 * Commit the tree and mark the captured tasks, in that order.
 *
 * The commit happens first: a crash between commit and row leaves a correct skip
 * set (which is git-derived) and only loses a diagnostic row. The reverse order
 * would leave a row claiming a checkpoint that does not exist.
 */
export function takeCheckpoint(db, runId, { phase, reason, cwd, rationale = null, at = nowIso() }) {
  const sequence = nextSequence(db, runId);
  const tasks = pendingCapture(db, runId);

  if (!hasStagedChanges(cwd)) {
    return { taken: false, sequence, tasks: [], sha: null, reason: "nothing-to-commit" };
  }

  const message = [
    `checkpoint: ${phase} — ${tasks.length} task${tasks.length === 1 ? "" : "s"} complete`,
    "",
    `SET-Run: ${runId}`,
    `SET-Checkpoint: ${sequence}`,
    `SET-Tasks: ${tasks.join(",")}`,
  ].join("\n");

  git(cwd, ["add", "-A", "--", ".", ...NEVER_COMMIT]);
  git(cwd, ["commit", "-q", "-m", message]);
  const sha = git(cwd, ["rev-parse", "HEAD"]);

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO checkpoint (run_id, sequence, sha, phase, reason, rationale, taken, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(runId, sequence, sha, phase, reason, rationale, at);

    db.prepare(
      `UPDATE task SET captured_seq = ?
        WHERE run_id = ? AND status = 'passed' AND captured_seq IS NULL`,
    ).run(sequence, runId);

    db.prepare("UPDATE run SET updated_at = ? WHERE run_id = ?").run(at, runId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { taken: true, sequence, tasks, sha };
}

/** Record a checkpoint the orchestrator considered and declined. */
export function declineCheckpoint(db, runId, { phase, rationale, reason = "judgment", at = nowIso() }) {
  const sequence = nextSequence(db, runId);
  db.prepare(
    `INSERT INTO checkpoint (run_id, sequence, sha, phase, reason, rationale, taken, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, 0, ?)`,
  ).run(runId, sequence, phase, reason, rationale, at);
  return { taken: false, sequence };
}

/** Minutes since the last taken checkpoint — drives the backstop. */
export function minutesSinceCheckpoint(db, runId, now = new Date()) {
  const row = db
    .prepare(
      `SELECT created_at FROM checkpoint
        WHERE run_id = ? AND taken = 1 ORDER BY sequence DESC LIMIT 1`,
    )
    .get(runId);
  const since = row?.created_at ?? db.prepare("SELECT started_at FROM run WHERE run_id = ?").get(runId)?.started_at;
  if (!since) return 0;
  return (now.getTime() - new Date(since).getTime()) / 60000;
}
