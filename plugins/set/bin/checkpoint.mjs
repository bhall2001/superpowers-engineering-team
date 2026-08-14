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

// A stray run store inside a worktree must never land in a checkpoint. The `**/`
// forms matter: a nested copy escapes a bare `runs.db-wal` pathspec.
const NEVER_COMMIT = [
  ":(glob,exclude)**/runs.db",
  ":(glob,exclude)**/runs.db-wal",
  ":(glob,exclude)**/runs.db-shm",
  ":(glob,exclude)runs.db",
  ":(glob,exclude)runs.db-wal",
  ":(glob,exclude)runs.db-shm",
  ":(glob,exclude)**/.worktrees/**",
  ":(glob,exclude).worktrees/**",
];

/** Repo root, so pathspecs never depend on the caller's cwd. */
function repoRoot(cwd) {
  return git(cwd, ["rev-parse", "--show-toplevel"]);
}

/**
 * Paths this checkpoint may commit.
 *
 * NEVER `git add -A`. A checkpoint runs in the human's own worktree, and `-A`
 * sweeps whatever else is lying there — an unignored `.env.local`, personal
 * scratch notes, another worktree — into an agent's commit on their branch.
 *
 * `allow` is the union of the plan's per-task `Files`. Anything changed outside
 * it is not this run's work: it is excluded and returned in `foreign` so the
 * orchestrator can report it. With no `allow` list the checkpoint can only
 * guess, so it commits nothing and says why — the design abandoned per-task
 * attribution, which means the run must be told what it owns.
 */
export function checkpointPaths(cwd, allow = null) {
  const root = repoRoot(cwd);
  const out = git(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--",
    ".",
    ...NEVER_COMMIT,
  ]);

  const changed = [];
  for (const entry of out.split("\0")) {
    if (entry.length < 4) continue;
    if (entry.slice(0, 2) === "!!") continue; // ignored
    changed.push(entry.slice(3));
  }

  if (!allow) return { root, paths: [], foreign: changed, unscoped: true };

  const owned = new Set(allow);
  const isOwned = (path) =>
    owned.has(path) || [...owned].some((entry) => entry.endsWith("/") && path.startsWith(entry));

  return {
    root,
    paths: changed.filter(isOwned),
    foreign: changed.filter((path) => !isOwned(path)),
    unscoped: false,
  };
}

/**
 * Staged content the run did not create — a human mid-`git add -p`.
 * Committing over it folds their unstaged hunks into an agent's commit and
 * destroys the index they curated, so a checkpoint refuses instead.
 */
export function foreignStagedPaths(cwd) {
  const root = repoRoot(cwd);
  const out = git(root, ["status", "--porcelain=v1", "-z", "--", "."]);
  const staged = [];
  for (const entry of out.split("\0")) {
    if (entry.length < 4) continue;
    const index = entry[0];
    const worktree = entry[1];
    // Index differs from HEAD *and* worktree differs from index: partial staging.
    if (index !== " " && index !== "?" && worktree !== " " && worktree !== "?") {
      staged.push(entry.slice(3));
    }
  }
  return staged;
}

/**
 * Commit the tree and mark the captured tasks, in that order.
 *
 * The commit happens first: a crash between commit and row leaves a correct skip
 * set (which is git-derived) and only loses a diagnostic row. The reverse order
 * would leave a row claiming a checkpoint that does not exist.
 */
export function takeCheckpoint(
  db,
  runId,
  { phase, reason, cwd, files = null, rationale = null, at = nowIso() },
) {
  const sequence = nextSequence(db, runId);
  const tasks = pendingCapture(db, runId);

  const partial = foreignStagedPaths(cwd);
  if (partial.length > 0) {
    return {
      taken: false,
      sequence,
      tasks: [],
      sha: null,
      reason: "partial-staging",
      paths: partial,
    };
  }

  const { root, paths, foreign, unscoped } = checkpointPaths(cwd, files);
  if (unscoped) {
    return {
      taken: false,
      sequence,
      tasks: [],
      sha: null,
      reason: "no-file-scope",
      foreign,
    };
  }
  if (paths.length === 0) {
    return { taken: false, sequence, tasks: [], sha: null, reason: "nothing-to-commit", foreign };
  }

  const message = [
    `checkpoint: ${phase} — ${tasks.length} task${tasks.length === 1 ? "" : "s"} complete`,
    "",
    `SET-Run: ${runId}`,
    `SET-Checkpoint: ${sequence}`,
    `SET-Tasks: ${tasks.join(",")}`,
  ].join("\n");

  git(root, ["add", "--", ...paths]);
  git(root, ["commit", "-q", "-m", message]);
  const sha = git(root, ["rev-parse", "HEAD"]);

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

  return { taken: true, sequence, tasks, sha, committed: paths, foreign };
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
