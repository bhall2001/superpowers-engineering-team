import { hostname } from "node:os";
import { canonicalPath, nowIso } from "./run.mjs";

export class WorktreeHeldError extends Error {
  constructor(holder) {
    super(
      holder
        ? `worktree is held by run ${holder.run_id} (pid ${holder.session_pid} on ${holder.hostname}, ` +
            `last seen ${holder.updated_at}). Release it with: set-run.mjs release ${holder.run_id}`
        : "worktree is held by another running run",
    );
    this.name = "WorktreeHeldError";
    this.holder = holder ?? null;
  }
}

/**
 * Liveness for a pid on THIS host. Callers decide liveness; the claim
 * transaction never does, or two racing resumes both conclude the slot is free.
 */
export function probeDead(pid, host = hostname()) {
  if (pid == null) return true;
  if (host !== hostname()) return false; // another machine — never assume dead
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return err.code === "ESRCH";
  }
}

/** Rows holding this worktree, with the timestamp to compare-and-swap against. */
export function probeHolders(db, worktreePath) {
  return db
    .prepare(
      `SELECT run_id, session_pid, hostname, updated_at
         FROM run WHERE worktree_path = ? AND status = 'running'`,
    )
    .all(canonicalPath(worktreePath))
    .map((row) => ({
      runId: row.run_id,
      updatedAt: row.updated_at,
      dead: probeDead(row.session_pid, row.hostname),
      row,
    }));
}

/**
 * Mark caller-supplied dead runs crashed and insert this run's row, in ONE
 * transaction. Each UPDATE is conditional on the updated_at seen at probe time,
 * so a run that revived in between keeps its slot instead of being clobbered.
 */
export function claimWorktree(db, { worktreePath, runId, deadRunIds = [], seed = null }) {
  const worktree = canonicalPath(worktreePath);
  const ts = nowIso();

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const entry of deadRunIds) {
      const { runId: deadId, updatedAt } = entry;
      db.prepare(
        `UPDATE run SET status = 'crashed', updated_at = ?
          WHERE run_id = ? AND status = 'running' AND updated_at = ?`,
      ).run(ts, deadId, updatedAt);
    }

    // Inside the transaction, after clearing: any surviving holder wins.
    // The partial index only fires on INSERT, so a re-claim of an existing run
    // row (resume, which passes no seed) would otherwise slip past it.
    const holder = db
      .prepare(
        `SELECT run_id, session_pid, hostname, updated_at
           FROM run WHERE worktree_path = ? AND status = 'running' AND run_id <> ?`,
      )
      .get(worktree, runId);
    if (holder) {
      db.exec("ROLLBACK");
      throw new WorktreeHeldError(holder);
    }

    if (seed) {
      db.prepare(
        `INSERT INTO run (run_id, project_slug, project_path, worktree_path, branch,
                          plan_path, spec_path, entry_phase, current_phase, status,
                          session_pid, hostname, started_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
      ).run(
        runId,
        seed.projectSlug ?? worktree.replaceAll("/", "-").replace(/^-+/, ""),
        canonicalPath(seed.projectPath),
        worktree,
        seed.branch,
        seed.planPath,
        seed.specPath ?? null,
        seed.entryPhase,
        seed.currentPhase ?? seed.entryPhase,
        seed.sessionPid ?? process.pid,
        hostname(),
        ts,
        ts,
      );
    } else {
      db.prepare(
        `UPDATE run SET worktree_path = ?, status = 'running', updated_at = ?
          WHERE run_id = ?`,
      ).run(worktree, ts, runId);
    }

    db.exec("COMMIT");
  } catch (err) {
    if (err instanceof WorktreeHeldError) throw err; // already rolled back
    db.exec("ROLLBACK");
    if (String(err.message).includes("UNIQUE")) {
      const holder = db
        .prepare(
          `SELECT run_id, session_pid, hostname, updated_at
             FROM run WHERE worktree_path = ? AND status = 'running'`,
        )
        .get(worktree);
      throw new WorktreeHeldError(holder);
    }
    throw err;
  }

  return runId;
}

export function releaseRun(db, runId, status = "complete") {
  db.prepare("UPDATE run SET status = ?, updated_at = ? WHERE run_id = ?").run(
    status,
    nowIso(),
    runId,
  );
}
