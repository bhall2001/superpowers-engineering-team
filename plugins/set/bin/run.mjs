import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { hostname } from "node:os";
import { basename } from "node:path";

/** Resolve symlinks and path spellings so the unique index compares one form. */
export function canonicalPath(path) {
  return realpathSync(path);
}

function stamp(date = new Date()) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10).replaceAll("-", "")}-${iso.slice(11, 19).replaceAll(":", "")}`;
}

function slugify(value, max = 24) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "run"
  );
}

/**
 * Run ids embed hostname and randomness because the skip set is rebuilt from git
 * trailers, and git enforces no uniqueness across clones or machines.
 */
export function newRunId(featureSlug, date = new Date()) {
  return [
    stamp(date),
    slugify(featureSlug),
    slugify(hostname(), 16),
    randomBytes(2).toString("hex"),
  ].join("-");
}

export function nowIso() {
  return new Date().toISOString();
}

export function initRun(db, opts) {
  const {
    projectPath,
    worktreePath,
    branch,
    planPath,
    specPath = null,
    entryPhase,
    featureSlug = basename(planPath, ".md"),
    sessionPid = process.pid,
  } = opts;

  const worktree = canonicalPath(worktreePath);
  const project = canonicalPath(projectPath);
  const runId = newRunId(featureSlug);
  const ts = nowIso();

  db.prepare(
    `INSERT INTO run (run_id, project_slug, project_path, worktree_path, branch,
                      plan_path, spec_path, entry_phase, current_phase, status,
                      session_pid, hostname, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
  ).run(
    runId,
    slugify(project.replaceAll("/", "-"), 64),
    project,
    worktree,
    branch,
    planPath,
    specPath,
    entryPhase,
    entryPhase,
    sessionPid,
    hostname(),
    ts,
    ts,
  );

  return runId;
}

export function heartbeat(db, runId) {
  db.prepare("UPDATE run SET updated_at = ? WHERE run_id = ?").run(nowIso(), runId);
}

export function listRuns(db, { limit = 50 } = {}) {
  return db
    .prepare(
      `SELECT run_id, project_path, worktree_path, branch, status, current_phase,
              session_pid, hostname, started_at, updated_at
         FROM run ORDER BY started_at DESC, rowid DESC LIMIT ?`,
    )
    .all(limit);
}
